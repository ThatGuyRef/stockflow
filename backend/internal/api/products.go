package api

import (
	"log"
	"net/http"
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

func (h *Handler) ListProducts(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	query := `
		SELECT
			p.id,
			p.sku,
			p.name,
			p.price,
			p.stock,
			p.is_active,
			p.created_at,
			(SELECT MAX(created_at) FROM stock_movements sm WHERE sm.product_id = p.id) AS last_movement_at
		FROM products p
		ORDER BY p.id ASC
	`

	rows, err := h.Pool.Query(ctx, query)
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
		"data": products,
	})
}
