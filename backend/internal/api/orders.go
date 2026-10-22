package api

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"stockflow/internal/httpx"
)

type CreateOrderRequest struct {
	Customer string           `json:"customer"`
	Items    []OrderItemInput `json:"items"`
}

type OrderItemInput struct {
	SKU string `json:"sku"`
	Qty *int   `json:"qty"`
}

type Order struct {
	ID          int         `json:"id"`
	Customer    string      `json:"customer"`
	Status      string      `json:"status"`
	Total       int         `json:"total"`
	CreatedAt   time.Time   `json:"created_at"`
	CancelledAt *time.Time  `json:"cancelled_at"`
	Items       []OrderItem `json:"items"`
}

type OrderItem struct {
	SKU       string `json:"sku"`
	Name      string `json:"name"`
	Qty       int    `json:"qty"`
	UnitPrice int    `json:"unit_price"`
	Subtotal  int    `json:"subtotal"`
}

type NormalizedOrderItem struct {
	SKU string
	Qty int
}

// validateOrderRequest performs pure in-memory validation of an order request.
func validateOrderRequest(req CreateOrderRequest) (string, []NormalizedOrderItem, []string) {
	customer := strings.TrimSpace(req.Customer)
	var details []string

	if customer == "" {
		details = append(details, "customer is required")
	}

	if len(req.Items) == 0 {
		details = append(details, "items must not be empty")
		return customer, nil, details
	}

	seenSKU := make(map[string]bool, len(req.Items))
	normalizedItems := make([]NormalizedOrderItem, 0, len(req.Items))

	for i, item := range req.Items {
		sku := strings.ToUpper(strings.TrimSpace(item.SKU))
		if sku == "" {
			details = append(details, fmt.Sprintf("items[%d].sku is required", i))
		} else {
			if seenSKU[sku] {
				details = append(details, fmt.Sprintf("items[%d].sku '%s' is duplicated", i, sku))
			}
			seenSKU[sku] = true
		}

		qty := 0
		if item.Qty == nil {
			details = append(details, fmt.Sprintf("items[%d].qty is required", i))
		} else if *item.Qty <= 0 {
			details = append(details, fmt.Sprintf("items[%d].qty must be greater than 0", i))
		} else if *item.Qty > MaxStockAdjustmentQty {
			details = append(details, fmt.Sprintf("items[%d].qty must not exceed %d", i, MaxStockAdjustmentQty))
		} else {
			qty = *item.Qty
		}

		normalizedItems = append(normalizedItems, NormalizedOrderItem{
			SKU: sku,
			Qty: qty,
		})
	}

	return customer, normalizedItems, details
}

type lockedItem struct {
	productID int
	sku       string
	name      string
	qty       int
	unitPrice int
	subtotal  int
}

func (h *Handler) CreateOrder(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req CreateOrderRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeValidation, "invalid request body", map[string]any{
			"details": []string{err.Error()},
		})
		return
	}

	customer, items, details := validateOrderRequest(req)
	if len(details) > 0 {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeValidation, "validation failed", map[string]any{
			"details": details,
		})
		return
	}

	// 1. Sort items by SKU to ensure a deterministic row locking order across concurrent orders (deadlock prevention)
	sort.Slice(items, func(i, j int) bool {
		return items[i].SKU < items[j].SKU
	})

	// 2. Begin database transaction
	tx, err := h.Pool.Begin(ctx)
	if err != nil {
		log.Printf("error starting order transaction: %v", err)
		httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to start transaction", nil)
		return
	}
	defer tx.Rollback(ctx)

	// 3. Pre-check SKUs before writing any modifications
	skus := make([]string, len(items))
	for i, it := range items {
		skus[i] = it.SKU
	}

	productIsActive := make(map[string]bool, len(skus))

	rows, err := tx.Query(ctx, "SELECT sku, is_active FROM products WHERE sku = ANY($1)", skus)
	if err != nil {
		log.Printf("error checking order skus: %v", err)
		httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to check product skus", nil)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var (
			s        string
			isActive bool
		)
		if err := rows.Scan(&s, &isActive); err != nil {
			log.Printf("error scanning product sku: %v", err)
			httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to check product skus", nil)
			return
		}
		productIsActive[s] = isActive
	}
	if err := rows.Err(); err != nil {
		log.Printf("error iterating product skus: %v", err)
		httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to check product skus", nil)
		return
	}
	rows.Close()

	var preCheckDetails []string
	for _, it := range items {
		isActive, found := productIsActive[it.SKU]
		if !found {
			preCheckDetails = append(preCheckDetails, fmt.Sprintf("unknown sku '%s'", it.SKU))
		} else if !isActive {
			preCheckDetails = append(preCheckDetails, fmt.Sprintf("sku '%s' is inactive", it.SKU))
		}
	}
	if len(preCheckDetails) > 0 {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeValidation, "validation failed", map[string]any{
			"details": preCheckDetails,
		})
		return
	}

	// 4. Deduct stock atomically per item and lock price/name
	lockedItems := make([]lockedItem, 0, len(items))
	var total int64

	for _, it := range items {
		updateStockQuery := `
			UPDATE products
			SET stock = stock - $1
			WHERE sku = $2 AND stock >= $1
			RETURNING id, name, price
		`
		var (
			prodID int
			name   string
			price  int
		)
		err := tx.QueryRow(ctx, updateStockQuery, it.Qty, it.SKU).Scan(&prodID, &name, &price)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				// SKU was verified to exist in step 3, so ErrNoRows strictly indicates insufficient stock
				var availableStock int
				checkErr := tx.QueryRow(ctx, "SELECT stock FROM products WHERE sku = $1", it.SKU).Scan(&availableStock)
				if checkErr != nil {
					log.Printf("error checking stock for %s: %v", it.SKU, checkErr)
					httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to check product stock", nil)
					return
				}

				httpx.WriteError(w, http.StatusConflict, httpx.CodeInsufficientStock, "insufficient stock", map[string]any{
					"sku":       it.SKU,
					"available": availableStock,
				})
				return
			}
			log.Printf("error deducting stock for %s: %v", it.SKU, err)
			httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to deduct product stock", nil)
			return
		}

		subtotal := it.Qty * price
		total += int64(subtotal)
		if total > math.MaxInt32 {
			httpx.WriteError(w, http.StatusBadRequest, httpx.CodeValidation, "order total exceeds maximum allowed amount", nil)
			return
		}

		lockedItems = append(lockedItems, lockedItem{
			productID: prodID,
			sku:       it.SKU,
			name:      name,
			qty:       it.Qty,
			unitPrice: price,
			subtotal:  subtotal,
		})
	}

	// 5. Insert sales order
	var order Order
	insertOrderQuery := `
		INSERT INTO sales_orders (customer, total)
		VALUES ($1, $2)
		RETURNING id, status, created_at, cancelled_at
	`
	err = tx.QueryRow(ctx, insertOrderQuery, customer, int(total)).Scan(
		&order.ID,
		&order.Status,
		&order.CreatedAt,
		&order.CancelledAt,
	)
	if err != nil {
		log.Printf("error creating sales order: %v", err)
		httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to create sales order", nil)
		return
	}
	order.Customer = customer
	order.Total = int(total)

	// 6. Insert order items and corresponding stock movement records
	responseItems := make([]OrderItem, len(lockedItems))
	for i, it := range lockedItems {
		_, err := tx.Exec(ctx, `
			INSERT INTO sales_order_items (order_id, sku, qty, unit_price)
			VALUES ($1, $2, $3, $4)
		`, order.ID, it.sku, it.qty, it.unitPrice)
		if err != nil {
			log.Printf("error recording sales order item: %v", err)
			httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to record sales order item", nil)
			return
		}

		note := fmt.Sprintf("Order #%d", order.ID)
		_, err = tx.Exec(ctx, `
			INSERT INTO stock_movements (product_id, type, qty, note)
			VALUES ($1, 'out', $2, $3)
		`, it.productID, it.qty, note)
		if err != nil {
			log.Printf("error recording stock movement for order: %v", err)
			httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to record stock movement", nil)
			return
		}

		responseItems[i] = OrderItem{
			SKU:       it.sku,
			Name:      it.name,
			Qty:       it.qty,
			UnitPrice: it.unitPrice,
			Subtotal:  it.subtotal,
		}
	}
	order.Items = responseItems

	// 7. Commit transaction
	if err := tx.Commit(ctx); err != nil {
		log.Printf("error committing sales order transaction: %v", err)
		httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to commit order", nil)
		return
	}

	// 8. Return 201 Created with full order representation
	httpx.WriteJSON(w, http.StatusCreated, order)
}

type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

func loadOrder(ctx context.Context, q querier, id int) (Order, error) {
	var order Order
	err := q.QueryRow(ctx, `
		SELECT id, customer, status, total, created_at, cancelled_at
		FROM sales_orders
		WHERE id = $1
	`, id).Scan(
		&order.ID,
		&order.Customer,
		&order.Status,
		&order.Total,
		&order.CreatedAt,
		&order.CancelledAt,
	)
	if err != nil {
		return Order{}, err
	}

	rows, err := q.Query(ctx, `
		SELECT i.sku, p.name, i.qty, i.unit_price
		FROM sales_order_items i
		JOIN products p ON p.sku = i.sku
		WHERE i.order_id = $1
		ORDER BY i.id
	`, id)
	if err != nil {
		return Order{}, err
	}
	defer rows.Close()

	items := make([]OrderItem, 0)
	for rows.Next() {
		var item OrderItem
		if err := rows.Scan(&item.SKU, &item.Name, &item.Qty, &item.UnitPrice); err != nil {
			return Order{}, err
		}
		item.Subtotal = item.Qty * item.UnitPrice
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return Order{}, err
	}
	order.Items = items

	return order, nil
}

func (h *Handler) GetOrder(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeValidation, "invalid order id", nil)
		return
	}

	order, err := loadOrder(ctx, h.Pool, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.WriteError(w, http.StatusNotFound, httpx.CodeNotFound, "order not found", nil)
			return
		}
		log.Printf("error getting order %d: %v", id, err)
		httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to get order", nil)
		return
	}

	httpx.WriteJSON(w, http.StatusOK, order)
}

func (h *Handler) CancelOrder(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// 1. Parse id, begin transaction, defer rollback
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		httpx.WriteError(w, http.StatusBadRequest, httpx.CodeValidation, "invalid order id", nil)
		return
	}

	tx, err := h.Pool.Begin(ctx)
	if err != nil {
		log.Printf("error starting cancel order transaction: %v", err)
		httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to start transaction", nil)
		return
	}
	defer tx.Rollback(ctx)

	// 2. Atomically update status to CANCELLED if it is currently CREATED
	tag, err := tx.Exec(ctx, `
		UPDATE sales_orders
		SET status = 'CANCELLED', cancelled_at = NOW()
		WHERE id = $1 AND status = 'CREATED'
	`, id)
	if err != nil {
		log.Printf("error cancelling sales order %d: %v", id, err)
		httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to cancel order", nil)
		return
	}

	if tag.RowsAffected() == 0 {
		var exists bool
		checkErr := tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM sales_orders WHERE id = $1)", id).Scan(&exists)
		if checkErr != nil {
			log.Printf("error checking order existence %d: %v", id, checkErr)
			httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to check order status", nil)
			return
		}
		if !exists {
			httpx.WriteError(w, http.StatusNotFound, httpx.CodeNotFound, "order not found", nil)
			return
		}
		httpx.WriteError(w, http.StatusConflict, httpx.CodeAlreadyCancelled, "order is already cancelled", nil)
		return
	}

	// 3. Fetch items to return stock
	rows, err := tx.Query(ctx, `
		SELECT p.id, i.qty
		FROM sales_order_items i
		JOIN products p ON p.sku = i.sku
		WHERE i.order_id = $1
		ORDER BY i.sku
	`, id)
	if err != nil {
		log.Printf("error fetching order items for cancellation %d: %v", id, err)
		httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to fetch order items", nil)
		return
	}

	type returnItem struct {
		productID int
		qty       int
	}
	var returnItems []returnItem
	for rows.Next() {
		var it returnItem
		if err := rows.Scan(&it.productID, &it.qty); err != nil {
			rows.Close()
			log.Printf("error scanning order item for cancellation %d: %v", id, err)
			httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to read order items", nil)
			return
		}
		returnItems = append(returnItems, it)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		log.Printf("error iterating order items for cancellation %d: %v", id, err)
		httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to read order items", nil)
		return
	}
	rows.Close()

	// 4. Return stock and record 'in' movement for each item
	note := fmt.Sprintf("Cancellation Order #%d", id)
	for _, it := range returnItems {
		_, err := tx.Exec(ctx, "UPDATE products SET stock = stock + $1 WHERE id = $2", it.qty, it.productID)
		if err != nil {
			log.Printf("error returning stock for product %d: %v", it.productID, err)
			httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to return stock", nil)
			return
		}

		_, err = tx.Exec(ctx, `
			INSERT INTO stock_movements (product_id, type, qty, note)
			VALUES ($1, 'in', $2, $3)
		`, it.productID, it.qty, note)
		if err != nil {
			log.Printf("error recording stock return movement for product %d: %v", it.productID, err)
			httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to record stock movement", nil)
			return
		}
	}

	// 5. Load full updated order representation using the same transaction
	order, err := loadOrder(ctx, tx, id)
	if err != nil {
		log.Printf("error loading cancelled order %d: %v", id, err)
		httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to load updated order", nil)
		return
	}

	// 6. Commit transaction and return 200 OK
	if err := tx.Commit(ctx); err != nil {
		log.Printf("error committing cancellation transaction %d: %v", id, err)
		httpx.WriteError(w, http.StatusInternalServerError, httpx.CodeInternal, "failed to commit cancellation", nil)
		return
	}

	httpx.WriteJSON(w, http.StatusOK, order)
}
