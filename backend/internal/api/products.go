package api

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"stockflow/internal/httpx"
)

const LowStockThreshold = 10

var searchEscaper = strings.NewReplacer(
	`\`, `\\`,
	"%", `\%`,
	"_", `\_`,
)

type Handler struct {
	Pool *pgxpool.Pool
}

type Product struct {
	ID             int        `json:"id" db:"id"`
	SKU            string     `json:"sku" db:"sku"`
	Name           string     `json:"name" db:"name"`
	Price          int        `json:"price" db:"price"`
	Stock          int        `json:"stock" db:"stock"`
	IsActive       bool       `json:"is_active" db:"is_active"`
	CreatedAt      time.Time  `json:"created_at" db:"created_at"`
	LastMovementAt *time.Time `json:"last_movement_at" db:"last_movement_at"`
}

type ProductInput struct {
	SKU      string `json:"sku"`
	Name     string `json:"name"`
	Price    *int   `json:"price"`
	IsActive *bool  `json:"is_active"`
}

// validateProductInput validates SKU, Name, and Price.
// SKU is normalized to uppercase.
func validateProductInput(req ProductInput) (string, string, int, []string) {
	sku := strings.ToUpper(strings.TrimSpace(req.SKU))
	name := strings.TrimSpace(req.Name)

	var details []string
	if sku == "" {
		details = append(details, "sku is required")
	}
	if name == "" {
		details = append(details, "name is required")
	}
	price := 0
	if req.Price == nil {
		details = append(details, "price is required")
	} else if *req.Price < 0 {
		details = append(details, "price must be greater than or equal to 0")
	} else {
		price = *req.Price
	}

	return sku, name, price, details
}

// parsePositiveInt parses a string to a positive int (> 0), returning def if invalid or <= 0.
func parsePositiveInt(s string, def int) int {
	if s == "" {
		return def
	}
	val, err := strconv.Atoi(s)
	if err != nil || val <= 0 {
		return def
	}
	return val
}

func (h *Handler) ListProducts(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// 1. Parse pagination parameters with upper bound
	page := parsePositiveInt(r.URL.Query().Get("page"), 1)
	if page > 100000 {
		page = 100000
	}
	limit := parsePositiveInt(r.URL.Query().Get("limit"), 10)
	if limit > 100 {
		limit = 100
	}
	offset := (page - 1) * limit

	// 2. Build filter conditions and arguments (shared between count and select)
	var (
		conditions []string
		args       []any
	)

	// Search filter (matches SKU or Name, case-insensitive with wildcard escaping)
	if search := strings.TrimSpace(r.URL.Query().Get("search")); search != "" {
		escaped := searchEscaper.Replace(search)
		args = append(args, "%"+escaped+"%")
		n := len(args)
		conditions = append(conditions, fmt.Sprintf("(p.sku ILIKE $%d OR p.name ILIKE $%d)", n, n))
	}

	// Status filter
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	switch status {
	case "", "all":
		// No filter
	case "active":
		conditions = append(conditions, "p.is_active")
	case "inactive":
		conditions = append(conditions, "NOT p.is_active")
	case "low_stock":
		conditions = append(conditions, fmt.Sprintf("p.is_active AND p.stock <= %d", LowStockThreshold))
	default:
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeValidation, "invalid status; allowed values: all, active, inactive, low_stock", nil)
		return
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	// 3. Query total count matching filter conditions
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM products p %s", whereClause)
	var total int
	if err := h.Pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		log.Printf("error counting products: %v", err)
		httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to count products", nil)
		return
	}

	// 4. Append limit and offset with dynamic placeholder indexes
	args = append(args, limit)
	limitPlaceholder := fmt.Sprintf("$%d", len(args))

	args = append(args, offset)
	offsetPlaceholder := fmt.Sprintf("$%d", len(args))

	// 5. Query products with pagination
	query := fmt.Sprintf(`
		SELECT
			p.id,
			p.sku,
			p.name,
			p.price,
			p.stock,
			p.is_active,
			p.created_at,
			(SELECT MAX(sm.created_at) FROM stock_movements sm WHERE sm.product_id = p.id) AS last_movement_at
		FROM products p
		%s
		ORDER BY p.id ASC
		LIMIT %s OFFSET %s
	`, whereClause, limitPlaceholder, offsetPlaceholder)

	rows, err := h.Pool.Query(ctx, query, args...)
	if err != nil {
		log.Printf("error querying products: %v", err)
		httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to query products", nil)
		return
	}
	defer rows.Close()

	products := make([]Product, 0)
	for rows.Next() {
		var p Product
		if err := rows.Scan(
			&p.ID,
			&p.SKU,
			&p.Name,
			&p.Price,
			&p.Stock,
			&p.IsActive,
			&p.CreatedAt,
			&p.LastMovementAt,
		); err != nil {
			log.Printf("error scanning product: %v", err)
			httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to read product data", nil)
			return
		}
		products = append(products, p)
	}

	if err := rows.Err(); err != nil {
		log.Printf("error iterating products: %v", err)
		httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to read products", nil)
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"data":  products,
		"page":  page,
		"limit": limit,
		"total": total,
	})
}

func (h *Handler) CreateProduct(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req ProductInput
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeValidation, "invalid request body", map[string]any{
			"details": []string{err.Error()},
		})
		return
	}

	sku, name, price, details := validateProductInput(req)
	if len(details) > 0 {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeValidation, "validation failed", map[string]any{
			"details": details,
		})
		return
	}

	// For POST, default is_active is true unless explicitly set to false
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	// Directly insert and rely on database unique constraint for race-safe SKU check
	query := `
		INSERT INTO products (sku, name, price, is_active)
		VALUES ($1, $2, $3, $4)
		RETURNING id, sku, name, price, stock, is_active, created_at
	`

	var p Product
	err := h.Pool.QueryRow(ctx, query, sku, name, price, isActive).Scan(
		&p.ID,
		&p.SKU,
		&p.Name,
		&p.Price,
		&p.Stock,
		&p.IsActive,
		&p.CreatedAt,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			httpx.WriteError(w, http.StatusConflict, httpx.CodeSKUTaken, "sku already exists", map[string]any{
				"sku": sku,
			})
			return
		}
		log.Printf("error inserting product: %v", err)
		httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to create product", nil)
		return
	}

	// For a newly created product, last_movement_at is nil (null in JSON)
	httpx.WriteJSON(w, http.StatusCreated, p)
}

func (h *Handler) UpdateProduct(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeValidation, "invalid product id", nil)
		return
	}

	var req ProductInput
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeValidation, "invalid request body", map[string]any{
			"details": []string{err.Error()},
		})
		return
	}

	sku, name, price, details := validateProductInput(req)
	if len(details) > 0 {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeValidation, "validation failed", map[string]any{
			"details": details,
		})
		return
	}

	// Stock is intentionally NOT updated here; it only changes via stock movements.
	// COALESCE($4, is_active) preserves the existing is_active if req.IsActive is not provided (nil -> SQL NULL).
	// Subquery in RETURNING ensures response shape matches the product list.
	query := `
		UPDATE products
		SET sku = $1, name = $2, price = $3, is_active = COALESCE($4, is_active)
		WHERE id = $5
		RETURNING
			id, sku, name, price, stock, is_active, created_at,
			(SELECT MAX(sm.created_at) FROM stock_movements sm WHERE sm.product_id = products.id) AS last_movement_at
	`

	var p Product
	err = h.Pool.QueryRow(ctx, query, sku, name, price, req.IsActive, id).Scan(
		&p.ID,
		&p.SKU,
		&p.Name,
		&p.Price,
		&p.Stock,
		&p.IsActive,
		&p.CreatedAt,
		&p.LastMovementAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.WriteError(w, http.StatusNotFound, httpx.CodeNotFound, "product not found", nil)
			return
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			if pgErr.Code == "23505" {
				httpx.WriteError(w, http.StatusConflict, httpx.CodeSKUTaken, "sku already exists", map[string]any{
					"sku": sku,
				})
				return
			}
			if pgErr.Code == "23503" {
				httpx.WriteError(w, http.StatusConflict, httpx.CodeProductHasHistory, "sku cannot be changed for a product with order history", map[string]any{
					"sku": sku,
				})
				return
			}
		}
		log.Printf("error updating product %d: %v", id, err)
		httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to update product", nil)
		return
	}

	httpx.WriteJSON(w, http.StatusOK, p)
}

func (h *Handler) DeleteProduct(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeValidation, "invalid product id", nil)
		return
	}

	// Directly attempt delete. If the product has movement or order history,
	// foreign key constraint 23503 prevents deletion.
	res, err := h.Pool.Exec(ctx, "DELETE FROM products WHERE id = $1", id)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23503" {
			httpx.WriteError(w, http.StatusConflict, httpx.CodeProductHasHistory, "cannot delete product with movement or order history", nil)
			return
		}
		log.Printf("error deleting product %d: %v", id, err)
		httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to delete product", nil)
		return
	}

	if res.RowsAffected() == 0 {
		httpx.WriteError(w, http.StatusNotFound, httpx.CodeNotFound, "product not found", nil)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

type ProductSummary struct {
	TotalProducts   int   `json:"total_products"`
	ActiveProducts  int   `json:"active_products"`
	TotalStockValue int64 `json:"total_stock_value"`
	LowStockCount   int   `json:"low_stock_count"`
}

func (h *Handler) GetProductSummary(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var summary ProductSummary
	query := `
		SELECT
			COUNT(*) AS total_products,
			COUNT(*) FILTER (WHERE is_active) AS active_products,
			COALESCE(SUM(price::bigint * stock), 0) AS total_stock_value,
			COUNT(*) FILTER (WHERE is_active AND stock <= $1) AS low_stock_count
		FROM products
	`
	err := h.Pool.QueryRow(ctx, query, LowStockThreshold).Scan(
		&summary.TotalProducts,
		&summary.ActiveProducts,
		&summary.TotalStockValue,
		&summary.LowStockCount,
	)
	if err != nil {
		log.Printf("error getting product summary: %v", err)
		httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to get product summary", nil)
		return
	}

	httpx.WriteJSON(w, http.StatusOK, summary)
}
