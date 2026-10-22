package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

var testSKUCounter atomic.Int64

// newTestHandler establishes a connection pool to the test database and registers cleanup.
func newTestHandler(t *testing.T) *Handler {
	t.Helper()
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://user:user@localhost:5433/stockflow"
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("failed to connect to test database: %v", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		t.Fatalf("failed to ping test database: %v", err)
	}

	t.Cleanup(func() {
		pool.Close()
	})

	return &Handler{Pool: pool}
}

// createTestProduct inserts an isolated product directly via SQL and registers cleanup.
func createTestProduct(t *testing.T, h *Handler, price, stock int) string {
	t.Helper()
	ctx := context.Background()
	seq := testSKUCounter.Add(1)
	sku := fmt.Sprintf("TEST-%d-%d", time.Now().UnixNano(), seq)
	name := fmt.Sprintf("Test Product %s", sku)

	var id int
	err := h.Pool.QueryRow(ctx, `
		INSERT INTO products (sku, name, price, stock, is_active)
		VALUES ($1, $2, $3, $4, TRUE)
		RETURNING id
	`, sku, name, price, stock).Scan(&id)
	if err != nil {
		t.Fatalf("failed to create test product: %v", err)
	}

	t.Cleanup(func() {
		cleanCtx := context.Background()
		_, _ = h.Pool.Exec(cleanCtx, "DELETE FROM stock_movements WHERE product_id = $1", id)
		_, _ = h.Pool.Exec(cleanCtx, "DELETE FROM sales_order_items WHERE sku = $1", sku)
		_, _ = h.Pool.Exec(cleanCtx, "DELETE FROM products WHERE id = $1", id)
	})

	return sku
}

func intPtr(v int) *int {
	return &v
}

// TestCreateOrder_InsufficientStock_NoMutation tests that an order failing due to insufficient
// stock on any item rolls back completely, ensuring no stock changes, no movements, and no order items.
func TestCreateOrder_InsufficientStock_NoMutation(t *testing.T) {
	h := newTestHandler(t)
	ctx := context.Background()

	// 1. Create product A (stock: 10) and product B (stock: 2)
	skuA := createTestProduct(t, h, 10000, 10)
	skuB := createTestProduct(t, h, 20000, 2)

	// 2. Submit order for A qty 5 and B qty 3 (B has only 2 available)
	orderReq := CreateOrderRequest{
		Customer: "PT Insufficient Stock Test",
		Items: []OrderItemInput{
			{SKU: skuA, Qty: intPtr(5)},
			{SKU: skuB, Qty: intPtr(3)},
		},
	}
	bodyBytes, err := json.Marshal(orderReq)
	if err != nil {
		t.Fatalf("failed to marshal order request: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/orders", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.CreateOrder(rec, req)

	// 3. Verify HTTP 409 Conflict response and payload
	if rec.Code != http.StatusConflict {
		t.Fatalf("expected status 409 Conflict, got %d. Body: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Error struct {
			Code      string `json:"code"`
			Message   string `json:"message"`
			SKU       string `json:"sku"`
			Available int    `json:"available"`
		} `json:"error"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode error response: %v", err)
	}

	if resp.Error.Code != "INSUFFICIENT_STOCK" {
		t.Errorf("expected error code INSUFFICIENT_STOCK, got %q", resp.Error.Code)
	}
	if resp.Error.SKU != skuB {
		t.Errorf("expected error sku %q, got %q", skuB, resp.Error.SKU)
	}
	if resp.Error.Available != 2 {
		t.Errorf("expected available 2, got %d", resp.Error.Available)
	}

	// 4. Directly verify database state: stock A must still be 10, stock B must still be 2
	var stockA int
	if err := h.Pool.QueryRow(ctx, "SELECT stock FROM products WHERE sku = $1", skuA).Scan(&stockA); err != nil {
		t.Fatalf("failed to query stock A: %v", err)
	}
	if stockA != 10 {
		t.Errorf("expected stock A to remain 10, got %d", stockA)
	}

	var stockB int
	if err := h.Pool.QueryRow(ctx, "SELECT stock FROM products WHERE sku = $1", skuB).Scan(&stockB); err != nil {
		t.Fatalf("failed to query stock B: %v", err)
	}
	if stockB != 2 {
		t.Errorf("expected stock B to remain 2, got %d", stockB)
	}

	// 5. Directly verify database state: 0 stock movements for either product
	var movementCount int
	err = h.Pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM stock_movements sm
		JOIN products p ON p.id = sm.product_id
		WHERE p.sku IN ($1, $2)
	`, skuA, skuB).Scan(&movementCount)
	if err != nil {
		t.Fatalf("failed to query stock movements: %v", err)
	}
	if movementCount != 0 {
		t.Errorf("expected 0 stock movements for both products, got %d", movementCount)
	}

	// 6. Directly verify database state: 0 sales order items referencing either SKU
	var orderItemCount int
	err = h.Pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM sales_order_items
		WHERE sku IN ($1, $2)
	`, skuA, skuB).Scan(&orderItemCount)
	if err != nil {
		t.Fatalf("failed to query sales order items: %v", err)
	}
	if orderItemCount != 0 {
		t.Errorf("expected 0 sales order items for both products, got %d", orderItemCount)
	}
}
