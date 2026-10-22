package api

import (
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"stockflow/internal/httpx"
)

type StockMovement struct {
	ID        int       `json:"id"`
	ProductID int       `json:"product_id"`
	Type      string    `json:"type"`
	Qty       int       `json:"qty"`
	Note      *string   `json:"note"`
	CreatedAt time.Time `json:"created_at"`
}

type StockAdjustRequest struct {
	Type string  `json:"type"`
	Qty  *int    `json:"qty"`
	Note *string `json:"note"`
}

const MaxStockAdjustmentQty = 1000000

func (h *Handler) AdjustStock(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// 1. Parse product id from path
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeValidation, "invalid product id", nil)
		return
	}

	// 2. Decode request body
	var req StockAdjustRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeValidation, "invalid request body", map[string]any{
			"details": []string{err.Error()},
		})
		return
	}

	// 3. Validate type, qty, and sanitize note
	var details []string

	reqType := strings.ToLower(strings.TrimSpace(req.Type))
	if reqType != "in" && reqType != "out" {
		details = append(details, "type must be 'in' or 'out'")
	}

	if req.Qty == nil {
		details = append(details, "qty is required")
	} else if *req.Qty <= 0 {
		details = append(details, "qty must be greater than 0")
	} else if *req.Qty > MaxStockAdjustmentQty {
		details = append(details, "qty must not exceed 1000000")
	}

	if req.Note != nil {
		trimmed := strings.TrimSpace(*req.Note)
		if trimmed == "" {
			req.Note = nil
		} else {
			req.Note = &trimmed
		}
	}

	if len(details) > 0 {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeValidation, "validation failed", map[string]any{
			"details": details,
		})
		return
	}

	// 4. Begin database transaction
	tx, err := h.Pool.Begin(ctx)
	if err != nil {
		log.Printf("error starting stock adjustment transaction: %v", err)
		httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to start transaction", nil)
		return
	}
	defer tx.Rollback(ctx)

	// 5. Atomic stock update: 'out' requires stock >= qty in WHERE clause
	var updateQuery string
	if reqType == "in" {
		updateQuery = `
			UPDATE products
			SET stock = stock + $1
			WHERE id = $2
			RETURNING id, sku, name, price, stock, is_active, created_at
		`
	} else {
		updateQuery = `
			UPDATE products
			SET stock = stock - $1
			WHERE id = $2 AND stock >= $1
			RETURNING id, sku, name, price, stock, is_active, created_at
		`
	}

	var p Product
	err = tx.QueryRow(ctx, updateQuery, *req.Qty, id).Scan(
		&p.ID,
		&p.SKU,
		&p.Name,
		&p.Price,
		&p.Stock,
		&p.IsActive,
		&p.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Check whether the product doesn't exist (404) or insufficient stock (409)
			var (
				currentStock int
				sku          string
			)
			checkErr := tx.QueryRow(ctx, "SELECT stock, sku FROM products WHERE id = $1", id).Scan(&currentStock, &sku)
			if errors.Is(checkErr, pgx.ErrNoRows) {
				httpx.WriteError(w, http.StatusNotFound, httpx.CodeNotFound, "product not found", nil)
				return
			}
			if checkErr != nil {
				log.Printf("error checking stock for product %d: %v", id, checkErr)
				httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to check stock", nil)
				return
			}

			// Product exists, so update failed because stock < qty
			httpx.WriteError(w, http.StatusConflict, httpx.CodeInsufficientStock, "insufficient stock", map[string]any{
				"sku":       sku,
				"available": currentStock,
			})
			return
		}

		log.Printf("error updating stock for product %d: %v", id, err)
		httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to adjust stock", nil)
		return
	}

	// 6. Record stock movement within the same transaction
	insertMovementQuery := `
		INSERT INTO stock_movements (product_id, type, qty, note)
		VALUES ($1, $2, $3, $4)
		RETURNING id, product_id, type, qty, note, created_at
	`

	var m StockMovement
	err = tx.QueryRow(ctx, insertMovementQuery, id, reqType, *req.Qty, req.Note).Scan(
		&m.ID,
		&m.ProductID,
		&m.Type,
		&m.Qty,
		&m.Note,
		&m.CreatedAt,
	)
	if err != nil {
		log.Printf("error inserting stock movement for product %d: %v", id, err)
		httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to record stock movement", nil)
		return
	}

	// Attach latest movement timestamp to product representation
	p.LastMovementAt = &m.CreatedAt

	// 7. Commit transaction
	if err := tx.Commit(ctx); err != nil {
		log.Printf("error committing stock adjustment transaction: %v", err)
		httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to commit transaction", nil)
		return
	}

	// 8. Return updated product and recorded movement
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"product":  p,
		"movement": m,
	})
}
