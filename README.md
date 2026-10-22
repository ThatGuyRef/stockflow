# 📦 Stockflow — Inventory & Order Management System

A robust, concurrency-safe inventory and order management API built with **Go** (Go 1.22+ native routing), **PostgreSQL 16**, and **pgxpool**.

---

## 📑 Table of Contents
- [Architecture & Tech Stack](#-architecture--tech-stack)
- [Key Architectural & Design Decisions](#-key-architectural--design-decisions)
- [Database Schema & Seed Strategy](#-database-schema--seed-strategy)
- [API Reference](#-api-reference)
- [Error Handling & Response Envelope](#-error-handling--response-envelope)
- [Getting Started](#-getting-started)
- [Verification & curl Examples](#-verification--curl-examples)

---

## ⚙️ Architecture & Tech Stack

- **Language & Runtime**: Go (v1.22+ / v1.25 toolchain)
- **HTTP Routing**: Go standard library `http.ServeMux` with native method routing (`"GET /path"`, `"POST /path"`)
- **Database Driver**: `github.com/jackc/pgx/v5` with connection pooling (`pgxpool.Pool`)
- **Relational Database**: PostgreSQL 16 Alpine containerized with Docker Compose
- **Configuration**: Environment variable driven (`DATABASE_URL`) with fallback defaults for local development

---

## 🧠 Key Architectural & Design Decisions

### 1. SKU Case Normalization
- All SKU inputs are normalized to uppercase (`strings.ToUpper(strings.TrimSpace(sku))`).
- Prevents ambiguous warehouse records (`atk-001` vs `ATK-001`) and ensures consistent lookup across product updates, stock adjustments, and order placements.

### 2. Dynamically Derived `last_movement_at`
- Instead of maintaining a denormalized timestamp column on the `products` table (which risks state drift), `last_movement_at` is computed on-the-fly via subquery:
  ```sql
  (SELECT MAX(sm.created_at) FROM stock_movements sm WHERE sm.product_id = products.id) AS last_movement_at
  ```
- Guaranteed to be up-to-date and serialized as `null` for newly created products or products without movement history.
- Consistently queried in both collection endpoints (`GET /api/products`) and update operations (`PUT /api/products/{id}` via `RETURNING`).

### 3. Operational Definition of "Low Stock"
- The filter `?status=low_stock` is defined as:
  ```sql
  p.is_active AND p.stock <= 10
  ```
- **Rationale**: Inactive products (`is_active = FALSE`) are discontinued or archived and no longer sold to customers. A low or zero stock level on an inactive product does not represent an operational replenishment priority.
- Threshold `10` is centralized in a constant (`const LowStockThreshold = 10`) for reuse across list filters and summary metrics.

### 4. Stock Immutability via Product PUT
- `PUT /api/products/{id}` intentionally **disallows** directly updating the `stock` column.
- **Rationale**: Stock must only mutate through explicit, auditable stock movements (`stock_movements`) and sales order lifecycles (`sales_orders`). Allowing arbitrary stock overwrite via PUT breaks the audit trail and causes desynchronization with ledger history.

### 5. Constraint-Driven Concurrency & Conflict Handling (Race-Safe)
- We deliberately avoid the *check-then-act* anti-pattern (e.g. running `SELECT` before `INSERT`/`UPDATE`/`DELETE`), which is vulnerable to race conditions under concurrent requests.
- Instead, PostgreSQL constraints are the single source of truth:
  - **`23505` (`unique_violation`)** $\rightarrow$ mapped to `409 Conflict` (`CodeSKUTaken`).
  - **`23503` (`foreign_key_violation`)** $\rightarrow$ mapped to `409 Conflict` (`CodeProductHasHistory`) when deleting or mutating SKU of products referenced by order items or movement history.

### 6. Partial Updates with `COALESCE` for `is_active`
- In `PUT /api/products/{id}`, `is_active` is parsed as `*bool`. If omitted in the JSON payload, it passes `nil` (`SQL NULL`), evaluated safely via:
  ```sql
  is_active = COALESCE($4, is_active)
  ```
- This prevents archived/inactive products from inadvertently flipping back to `is_active = true` during partial updates (e.g., updating only name or price).

### 7. SQL Wildcard Sanitization & Friendly Error Decoding
- Search queries escape Postgres ILIKE wildcards (`\`, `%`, and `_`) using `strings.NewReplacer` to prevent unexpected full-table matching or syntax errors on trailing backslashes.
- `httpx.DecodeJSON` rejects unknown fields via `DisallowUnknownFields()`, maps `io.EOF` to `"request body is required"`, and sanitizes type mismatch errors to prevent internal Go struct names from leaking to API consumers.

### 8. Atomic Stock Mutation & Integer Overflow Protection
- Stock adjustments run inside an atomic transaction where `out` movements enforce `stock >= qty` directly inside the `UPDATE` statement's `WHERE` clause, eliminating race conditions.
- Quantities are strictly capped at `1,000,000` to prevent PostgreSQL integer arithmetic overflow (`22003`) on large increments.
- Responses return `{"product": ..., "movement": ...}` so clients can immediately update both table rows and ledger timelines without secondary fetch requests.

### 9. Deadlock Prevention & Deterministic Item Ordering in Orders
- Concurrent orders locking multiple rows in opposing order (e.g., Order A locks `ATK-001` then waits for `ATK-003`, while Order B locks `ATK-003` then waits for `ATK-001`) create database deadlocks.
- To prevent this, incoming order items are sorted lexicographically by SKU before acquiring row locks via `UPDATE products ... WHERE sku = $2 AND stock >= $1`.
- **Note on Response Ordering**: As a direct consequence of this deterministic locking sequence, order items are processed, persisted, and returned in ascending SKU order, rather than the arbitrary order submitted by the client.

---

## 🗄️ Database Schema & Seed Strategy

### Relational Schema (`db/001_schema.sql`)
- **`products`**: `(id, sku, name, price, stock, is_active, created_at)`
- **`stock_movements`**: `(id, product_id, type, qty, note, created_at)`
- **`sales_orders`**: `(id, customer, status, total, created_at, cancelled_at)`
- **`sales_order_items`**: `(id, order_id, sku, qty, unit_price)`

### Comprehensive Seed Scenarios (`db/002_seed.sql`)
16 stationery (ATK) products specifically structured to exercise all UI states and edge cases:
- **Low Stock Cards ($\le 10$)**: `ATK-002` (8), `ATK-005` (4), `ATK-009` (7), `ATK-014` (0), and `ATK-016` (3).
- **Insufficient Stock Trigger (409 Error Demo)**: `ATK-014` (active with 0 stock).
- **Inactive Badges & Filter**: `ATK-007` (stock 25, inactive) and `ATK-015` (stock 0, inactive).
- **Clean Deletion Demo (Zero History)**: `ATK-014` and `ATK-015` have no records in `stock_movements` or `sales_order_items`, allowing `DELETE` without FK conflicts.
- **Order Chronology**: 3 orders (2 `CREATED`, 1 `CANCELLED` with return movements) with dynamic relative timestamps (`NOW() - INTERVAL '...'`) ensuring realistic "Xd ago" and "Xh ago" UI representations.

---

## 📡 API Reference

### 1. System Health
```http
GET /api/health
```
**Response (200 OK):**
```json
{
  "status": "ok"
}
```

---

### 2. Products

#### `GET /api/products`
Retrieves a paginated list of products with optional search and status filtering.

**Query Parameters:**
| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | integer | `1` | Page number ($\ge 1$, capped at `100000`). |
| `limit` | integer | `10` | Page size ($\ge 1$, capped at `100`). |
| `search` | string | `""` | Case-insensitive substring search matching `sku` or `name`. Wildcards are safely escaped. |
| `status` | string | `all` | Filter status: `all`, `active`, `inactive`, `low_stock`. |

**Response (200 OK):**
```json
{
  "data": [
    {
      "id": 1,
      "sku": "ATK-001",
      "name": "Kertas HVS A4 70gsm (1 rim)",
      "price": 52000,
      "stock": 110,
      "is_active": true,
      "created_at": "2026-10-08T12:00:00Z",
      "last_movement_at": "2026-10-19T12:00:00Z"
    }
  ],
  "page": 1,
  "limit": 10,
  "total": 16
}
```

---

#### `POST /api/products`
Creates a new product record. `stock` initializes to `0` and `last_movement_at` is `null`.

**Request Body:**
```json
{
  "sku": "ATK-017",
  "name": "Buku Tulis Bergaris 38 Lembar",
  "price": 4000,
  "is_active": true
}
```
*Note: `is_active` is optional (defaults to `true`). Unknown fields (e.g. `stock`) are rejected.*

**Responses:**
- `201 Created`: Returns newly created `Product` object.
- `400 Bad Request`: `VALIDATION_ERROR` with a list of missing or invalid fields in `details`.
- `409 Conflict`: `SKU_TAKEN` when SKU already exists in the database.

---

#### `PUT /api/products/{id}`
Updates an existing product's SKU, name, price, and optional active status.

**Request Body:**
```json
{
  "sku": "ATK-002",
  "name": "Pulpen Gel Hitam 0.5mm Joyko",
  "price": 4800
}
```
*Note: If `is_active` is omitted, its current database state is preserved via `COALESCE`.*

**Responses:**
- `200 OK`: Returns updated `Product` object with populated `last_movement_at`.
- `400 Bad Request`: Invalid ID or validation failures.
- `404 Not Found`: Product ID does not exist.
- `409 Conflict`:
  - `SKU_TAKEN`: Target SKU belongs to another product.
  - `PRODUCT_HAS_HISTORY`: Cannot mutate SKU because sales order items reference the existing SKU.

---

#### `DELETE /api/products/{id}`
Deletes a product record if it has no foreign key dependencies.

**Responses:**
- `204 No Content`: Product deleted successfully (empty body).
- `404 Not Found`: Product ID does not exist.
- `409 Conflict`: `PRODUCT_HAS_HISTORY` when product is referenced in `stock_movements` or `sales_order_items`.

---

#### `POST /api/products/{id}/stock`
Adjusts the stock level of a product within an atomic transaction and appends an auditable movement record.

**Request Body:**
```json
{
  "type": "out",
  "qty": 3,
  "note": "Pengambilan sisa box file"
}
```
*Note: `type` must be `"in"` or `"out"`. `qty` must be between `1` and `1,000,000`. `note` is optional (stored as `NULL` if omitted or empty).*

**Responses:**
- `200 OK`: Returns both the updated `product` (with new stock and synchronized `last_movement_at`) and the newly created `movement`.
- `400 Bad Request`: `VALIDATION_ERROR` (invalid type, qty <= 0, or qty > 1,000,000).
- `404 Not Found`: Product ID does not exist.
- `409 Conflict`: `INSUFFICIENT_STOCK` with `available` and `sku` if an `out` operation exceeds current stock.

---

#### `GET /api/products/{id}/movements`
Retrieves the audit trail of all stock movements for a specific product, ordered descending by `created_at` (newest first).

**Responses:**
- `200 OK`: Returns `{"data": [...]}` containing the list of movements. If the product exists but has no movements, returns `{"data": []}`.
- `400 Bad Request`: Invalid product ID.
- `404 Not Found`: Product ID does not exist.

---

### 3. Orders

#### `POST /api/orders`
Creates a new sales order, atomically reducing product stocks, recording order items, and creating `'out'` stock movements within a single ACID transaction.

**Request Body:**
```json
{
  "customer": "PT Sinar Baru",
  "items": [
    {
      "sku": "ATK-001",
      "qty": 2
    },
    {
      "sku": "ATK-003",
      "qty": 1
    }
  ]
}
```

**Key Behaviors:**
- Validates that `customer` is not empty, `items` is not empty, and all `sku`s are non-empty and non-duplicated (after uppercase normalization).
- Pre-checks that all requested SKUs exist and are active (`is_active = true`) before acquiring any row locks.
- Sorts items by SKU to prevent database deadlocks under concurrent ordering.
- Deducts stock with guarded `UPDATE products ... WHERE sku = $2 AND stock >= $1`. If stock is insufficient, triggers an immediate rollback and returns `409 Conflict` with current available stock.
- Calculates order total in 64-bit integer, rejecting totals exceeding `math.MaxInt32` (`2147483647`).
- Appends `stock_movements` with type `'out'` and note `"Order #{order_id}"` for each item.

**Responses:**
- `201 Created`: Returns the newly created `Order` object including its sorted `items`.
- `400 Bad Request`: `VALIDATION_ERROR` (empty customer/items, duplicate/unknown/inactive SKUs, non-positive or excessive quantities, total overflow).
- `409 Conflict`: `INSUFFICIENT_STOCK` with `sku` and `available` if any product lacks required stock. Full rollback guarantees no partial deductions.

---

## 🚨 Error Handling & Response Envelope

All error responses strictly adhere to a unified error envelope format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "validation failed",
    "details": [
      "sku is required",
      "price must be greater than or equal to 0"
    ]
  }
}
```

For domain conflicts, relevant contextual fields (such as `sku`) are placed directly alongside `code` and `message`:

```json
{
  "error": {
    "code": "SKU_TAKEN",
    "message": "sku already exists",
    "sku": "ATK-001"
  }
}
```

### Standardized Error Codes
| Code | HTTP Status | Description |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Missing required fields, invalid types, or unsupported query filters. |
| `NOT_FOUND` | 404 | Resource does not exist. |
| `SKU_TAKEN` | 409 | Unique constraint violation on product SKU. |
| `PRODUCT_HAS_HISTORY` | 409 | Foreign key violation when mutating or deleting products with audit records. |
| `INSUFFICIENT_STOCK` | 409 | Attempting to deduct or order more stock than currently available. |
| `ALREADY_CANCELLED` | 409 | Order is already in cancelled state. |
| `INTERNAL` | 500 | Unhandled database or server error. |

---

## 🚀 Getting Started

### Prerequisites
- [Go](https://golang.org/dl/) 1.22+
- [Docker](https://www.docker.com/) & Docker Compose

### 1. Clone & Start Database
```bash
git clone https://github.com/ThatGuyRef/stockflow.git
cd stockflow

# Start PostgreSQL 16 container and initialize schema & seed
docker compose up -d
```

### 2. Run Backend Server
```bash
cd backend
go run ./cmd/api
```
Server starts on port `8080`:
```text
Server is listening on :8080...
```

---

## 🧪 Verification & curl Examples

```bash
# 1. Health check
curl -i http://localhost:8080/api/health

# 2. List products with pagination
curl -s "http://localhost:8080/api/products?page=2&limit=5"

# 3. Filter low stock products (active with stock <= 10)
curl -s "http://localhost:8080/api/products?status=low_stock"

# 4. Search products with wildcard escaping
curl -s "http://localhost:8080/api/products?search=pensil"

# 5. Create a new product
curl -i -X POST http://localhost:8080/api/products \
  -H "Content-Type: application/json" \
  -d '{"sku":"ATK-017","name":"Buku Tulis Bergaris 38 Lembar","price":4000}'

# 6. Attempt duplicate SKU creation (triggers 409 SKU_TAKEN)
curl -i -X POST http://localhost:8080/api/products \
  -H "Content-Type: application/json" \
  -d '{"sku":"ATK-017","name":"Buku Tulis Duplikat","price":4000}'

# 7. Update product name without mutating is_active
curl -i -X PUT http://localhost:8080/api/products/7 \
  -H "Content-Type: application/json" \
  -d '{"sku":"ATK-007","name":"Gunting Kertas Sedang 6 Inch Joyko","price":12500}'

# 8. Delete product without history (triggers 204 No Content)
curl -i -X DELETE http://localhost:8080/api/products/14

# 9. Delete product with history (triggers 409 PRODUCT_HAS_HISTORY)
curl -i -X DELETE http://localhost:8080/api/products/1
```
