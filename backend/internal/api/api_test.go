package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"sync"
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
// Returns both the generated product ID and SKU.
func createTestProduct(t *testing.T, h *Handler, price, stock int) (int, string) {
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

	return id, sku
}

func intPtr(v int) *int {
	return &v
}

func strPtr(s string) *string {
	return &s
}

// TestCreateOrder_InsufficientStock_NoMutation tests that an order failing due to insufficient
// stock on any item rolls back completely, ensuring no stock changes, no movements, and no order items.
func TestCreateOrder_InsufficientStock_NoMutation(t *testing.T) {
	h := newTestHandler(t)
	ctx := context.Background()

	// 1. Create product A (stock: 10) and product B (stock: 2)
	_, skuA := createTestProduct(t, h, 10000, 10)
	_, skuB := createTestProduct(t, h, 20000, 2)

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

// TestAdjustStock_HappyPath tests that reducing stock via AdjustStock correctly updates
// stock in the database and records exactly one corresponding movement.
func TestAdjustStock_HappyPath(t *testing.T) {
	h := newTestHandler(t)
	ctx := context.Background()

	// 1. Create a product with initial stock 5
	id, _ := createTestProduct(t, h, 15000, 5)

	// 2. Adjust stock: out 2
	adjustReq := StockAdjustRequest{
		Type: "out",
		Qty:  intPtr(2),
		Note: strPtr("Test adjust out 2"),
	}
	bodyBytes, err := json.Marshal(adjustReq)
	if err != nil {
		t.Fatalf("failed to marshal stock adjust request: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/products/%d/stock", id), bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req.SetPathValue("id", strconv.Itoa(id))
	rec := httptest.NewRecorder()

	h.AdjustStock(rec, req)

	// 3. Verify HTTP 200 OK
	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200 OK, got %d. Body: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Product  Product       `json:"product"`
		Movement StockMovement `json:"movement"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Product.Stock != 3 {
		t.Errorf("expected response product stock 3, got %d", resp.Product.Stock)
	}
	if resp.Movement.Type != "out" || resp.Movement.Qty != 2 {
		t.Errorf("expected response movement type 'out' and qty 2, got type %q and qty %d", resp.Movement.Type, resp.Movement.Qty)
	}

	// 4. Verify directly in database: stock must be 3
	var dbStock int
	if err := h.Pool.QueryRow(ctx, "SELECT stock FROM products WHERE id = $1", id).Scan(&dbStock); err != nil {
		t.Fatalf("failed to query product stock in DB: %v", err)
	}
	if dbStock != 3 {
		t.Errorf("expected product stock in DB to be 3, got %d", dbStock)
	}

	// 5. Verify directly in database: exactly one movement with type 'out' and qty 2
	var moveType string
	var moveQty int
	var moveCount int
	err = h.Pool.QueryRow(ctx, `
		SELECT COUNT(*), COALESCE(MAX(type), ''), COALESCE(MAX(qty), 0)
		FROM stock_movements
		WHERE product_id = $1
	`, id).Scan(&moveCount, &moveType, &moveQty)
	if err != nil {
		t.Fatalf("failed to query movements in DB: %v", err)
	}
	if moveCount != 1 {
		t.Fatalf("expected exactly 1 movement in DB, got %d", moveCount)
	}
	if moveType != "out" || moveQty != 2 {
		t.Errorf("expected movement in DB to be out/2, got %s/%d", moveType, moveQty)
	}
}

// TestCreateOrder_Concurrent_NoOversell tests that concurrent orders for the same product
// do not oversell: given stock of 5 and 20 concurrent orders for qty 1, exactly 5 must succeed
// (201 Created), exactly 15 must fail with 409 Conflict, final stock must be 0, and exactly 5 movements logged.
func TestCreateOrder_Concurrent_NoOversell(t *testing.T) {
	h := newTestHandler(t)
	ctx := context.Background()

	// 1. Create a product with stock 5
	id, sku := createTestProduct(t, h, 10000, 5)

	// 2. Launch 20 concurrent goroutines, each attempting to order qty 1
	const concurrency = 20
	var wg sync.WaitGroup
	var successCount atomic.Int32
	var conflictCount atomic.Int32
	var unexpectedCount atomic.Int32

	wg.Add(concurrency)
	for i := 0; i < concurrency; i++ {
		go func(idx int) {
			defer wg.Done()

			orderReq := CreateOrderRequest{
				Customer: fmt.Sprintf("Concurrent Customer %d", idx),
				Items: []OrderItemInput{
					{SKU: sku, Qty: intPtr(1)},
				},
			}
			bodyBytes, _ := json.Marshal(orderReq)
			req := httptest.NewRequest(http.MethodPost, "/api/orders", bytes.NewReader(bodyBytes))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()

			h.CreateOrder(rec, req)

			switch rec.Code {
			case http.StatusCreated:
				successCount.Add(1)
			case http.StatusConflict:
				conflictCount.Add(1)
			default:
				unexpectedCount.Add(1)
				t.Logf("unexpected status %d: %s", rec.Code, rec.Body.String())
			}
		}(i)
	}

	wg.Wait()

	// 3. Verify exactly 5 successes and 15 conflicts
	if unexpectedCount.Load() != 0 {
		t.Errorf("expected 0 unexpected statuses, got %d", unexpectedCount.Load())
	}
	if successCount.Load() != 5 {
		t.Errorf("expected exactly 5 successful orders (201 Created), got %d", successCount.Load())
	}
	if conflictCount.Load() != 15 {
		t.Errorf("expected exactly 15 conflict orders (409 Conflict), got %d", conflictCount.Load())
	}

	// 4. Verify directly in database: final stock must be exactly 0 (never negative)
	var finalStock int
	if err := h.Pool.QueryRow(ctx, "SELECT stock FROM products WHERE id = $1", id).Scan(&finalStock); err != nil {
		t.Fatalf("failed to query final product stock: %v", err)
	}
	if finalStock != 0 {
		t.Errorf("expected final stock to be 0, got %d", finalStock)
	}

	// 5. Verify directly in database: exactly 5 'out' stock movements
	var outMovementCount int
	err := h.Pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM stock_movements
		WHERE product_id = $1 AND type = 'out'
	`, id).Scan(&outMovementCount)
	if err != nil {
		t.Fatalf("failed to query stock movements: %v", err)
	}
	if outMovementCount != 5 {
		t.Errorf("expected exactly 5 out stock movements in DB, got %d", outMovementCount)
	}

	// 6. Verify directly in database: exactly 5 sales order items recorded
	var orderItemCount int
	err = h.Pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM sales_order_items
		WHERE sku = $1
	`, sku).Scan(&orderItemCount)
	if err != nil {
		t.Fatalf("failed to query sales order items: %v", err)
	}
	if orderItemCount != 5 {
		t.Errorf("expected exactly 5 sales order items in DB, got %d", orderItemCount)
	}
}
