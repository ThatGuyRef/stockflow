package api

import (
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"stockflow/internal/httpx"
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
