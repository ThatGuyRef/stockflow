# Stockflow - Inventory and Order Management System

A robust, concurrency-safe inventory and sales order management system built with Go, PostgreSQL 16, and React (Vite, TypeScript, Tailwind CSS).

---

## Table of Contents
- [Architecture and Tech Stack](#architecture-and-tech-stack)
- [Database Schema and Seed Data](#database-schema-and-seed-data)
- [Getting Started](#getting-started)
- [Response Envelope and Error Codes](#response-envelope-and-error-codes)
- [curl Examples for All Endpoints](#curl-examples-for-all-endpoints)
- [Design Decisions](#design-decisions)
- [What Would Be Improved with More Time](#what-would-be-improved-with-more-time)
- [Honest Work Hours](#honest-work-hours)
- [Tools Used](#tools-used)

---

## Architecture and Tech Stack

### Backend
- Language: Go (v1.22+ native routing / toolchain 1.25)
- HTTP Router: Standard library `http.ServeMux` with method-based routing (`"GET /path"`, `"POST /path"`)
- Database Driver: `github.com/jackc/pgx/v5` with connection pooling (`pgxpool.Pool`)
- Database: PostgreSQL 16 Alpine containerized with Docker Compose

### Frontend
- Framework: React 19 with TypeScript
- Build Tool: Vite 8
- Server State and Caching: TanStack React Query v5
- Styling: Tailwind CSS v4
- Testing: Vitest v3

---

## Database Schema and Seed Data

### Relational Schema
The database schema consists of four core tables (`db/001_schema.sql`):
1. `products`: Catalog records (`id`, `sku`, `name`, `price`, `stock`, `is_active`, `created_at`). The `sku` column has an indexed `UNIQUE` constraint.
2. `stock_movements`: Ledger of stock adjustments (`id`, `product_id`, `type`, `qty`, `note`, `created_at`). Foreign key references `products(id)`.
3. `sales_orders`: Transaction headers (`id`, `customer`, `status`, `total`, `created_at`, `cancelled_at`).
4. `sales_order_items`: Line items per order (`id`, `order_id`, `sku`, `qty`, `unit_price`). Foreign key references `sales_orders(id)`.

### Seed Scenarios
The seed dataset (`db/002_seed.sql`) provides 16 stationery (ATK) products specifically structured to test business logic edge cases:
- Low stock items (stock <= 10): `ATK-002` (8), `ATK-005` (4), `ATK-009` (7), `ATK-014` (0), and `ATK-016` (3).
- Inactive items: `ATK-007` (25, inactive) and `ATK-015` (0, inactive).
- Happy path items for order placement and stock adjustments: `ATK-001`, `ATK-003`, `ATK-010`.
- Initial order records: Order #1 (`CREATED`), Order #2 (`CREATED`), and Order #3 (`CANCELLED`).

---

## Getting Started

### 1. Database (PostgreSQL 16)
Ensure Docker and Docker Compose are installed and running.

Start the PostgreSQL container:
```bash
docker compose up -d
```
The database listens on host port `5433` (container port 5432) with default credentials:
- Database: `stockflow`
- User: `user`
- Password: `user`
- Connection URL: `postgres://user:user@localhost:5433/stockflow?sslmode=disable`

Database schema (`db/001_schema.sql`) and initial seed data (`db/002_seed.sql`) are automatically applied on container startup.

To reset the database and restore all seed records to their initial state:
```bash
docker compose down -v && docker compose up -d
```

### 2. Backend (Go 1.22+)
The backend uses native Go standard library HTTP routing without third-party web frameworks.

```bash
cd backend
go run ./cmd/api
```
The backend server listens on port `8080` (`http://localhost:8080`).

To run with a custom database connection string:
```bash
DATABASE_URL="postgres://user:user@localhost:5433/stockflow?sslmode=disable" go run ./cmd/api
```

### 3. Frontend (React 19 + TypeScript + Vite)
```bash
cd frontend
npm install
npm run dev
```
The frontend application will be accessible at `http://localhost:5173`.

Vite proxy note: The `vite.config.ts` file includes a proxy configuration:
```ts
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:8080',
      changeOrigin: true,
    },
  },
}
```
All `/api/*` browser requests are automatically proxied to the Go backend on `http://localhost:8080`, eliminating CORS hurdles during local development.

### 4. Running Backend Integration & Concurrency Tests
Backend integration tests verify transactional integrity, race condition safety, and atomic rollbacks under concurrent load:
```bash
cd backend
go test -race ./internal/api/ -v
```

### 5. Running Frontend Tests and Production Build
```bash
cd frontend
# Run Vitest test suite
npx vitest run

# Run ESLint linter
npm run lint

# Run TypeScript type-check and Vite production build
npm run build
```

---

## Response Envelope and Error Codes

### Success Response
Collection and single-resource responses return standardized JSON envelopes:
```json
{
  "data": [ ... ],
  "page": 1,
  "limit": 10,
  "total": 16
}
```

### Error Response
All API errors return a unified envelope structure:
```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "insufficient stock",
    "sku": "ATK-016",
    "available": 3
  }
}
```

### Standardized Error Codes
| Code | HTTP Status | Description |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Missing required fields, invalid types, invalid quantity format, or unrecognized SKU. |
| `NOT_FOUND` | 404 | The requested resource (product or order) was not found. |
| `SKU_TAKEN` | 409 | Unique constraint violation on product SKU. |
| `PRODUCT_HAS_HISTORY` | 409 | Foreign key violation when attempting to delete a product with existing movements or orders. |
| `INSUFFICIENT_STOCK` | 409 | Available inventory is insufficient for the requested stock reduction or sales order. |
| `ALREADY_CANCELLED` | 409 | Attempting to cancel an order that is already in CANCELLED status. |
| `INTERNAL` | 500 | Unhandled database or server exception. |

---

## curl Examples for All Endpoints

### 1. Health Check
```bash
curl -i http://localhost:8080/api/health
```

### 2. Products

List products with pagination:
```bash
curl -s "http://localhost:8080/api/products?page=1&limit=5"
```

Search products (case-insensitive substring match):
```bash
curl -s "http://localhost:8080/api/products?search=kertas"
```

Filter products by status (`active`, `inactive`, `low_stock`):
```bash
# Active products
curl -s "http://localhost:8080/api/products?status=active"

# Inactive products
curl -s "http://localhost:8080/api/products?status=inactive"

# Low stock products (active items with stock <= 10)
curl -s "http://localhost:8080/api/products?status=low_stock"
```

Create a new product:
```bash
curl -i -X POST http://localhost:8080/api/products \
  -H "Content-Type: application/json" \
  -d '{"sku":"ATK-017","name":"Clear Plastic Pocket Folder","price":2500}'
```

Create a product with a duplicate SKU (returns 409 SKU_TAKEN):
```bash
curl -i -X POST http://localhost:8080/api/products \
  -H "Content-Type: application/json" \
  -d '{"sku":"ATK-017","name":"Duplicate Folder","price":2500}'
```

Update a product:
```bash
curl -i -X PUT http://localhost:8080/api/products/17 \
  -H "Content-Type: application/json" \
  -d '{"sku":"ATK-017","name":"Clear Plastic Folder Folio F4","price":3000}'
```

Delete a product without transaction history (returns 204 No Content):
```bash
curl -i -X DELETE http://localhost:8080/api/products/17
```

Delete a product with transaction history (returns 409 PRODUCT_HAS_HISTORY):
```bash
curl -i -X DELETE http://localhost:8080/api/products/1
```

Get inventory summary metrics:
```bash
curl -s http://localhost:8080/api/products/summary
```

### 3. Stock Adjustments and Movements

Stock adjustment in (increase inventory):
```bash
curl -i -X POST http://localhost:8080/api/products/1/stock \
  -H "Content-Type: application/json" \
  -d '{"type":"in","qty":20,"note":"Received goods from supplier"}'
```

Stock adjustment out (decrease inventory):
```bash
curl -i -X POST http://localhost:8080/api/products/1/stock \
  -H "Content-Type: application/json" \
  -d '{"type":"out","qty":5,"note":"Damaged in warehouse"}'
```

Stock adjustment out exceeding available stock (returns 409 INSUFFICIENT_STOCK):
```bash
curl -i -X POST http://localhost:8080/api/products/16/stock \
  -H "Content-Type: application/json" \
  -d '{"type":"out","qty":999,"note":"Exceeds available inventory"}'
```

Invalid quantity payload (returns 400 VALIDATION_ERROR):
```bash
curl -i -X POST http://localhost:8080/api/products/1/stock \
  -H "Content-Type: application/json" \
  -d '{"type":"in","qty":0}'
```

List stock movements history for a product:
```bash
curl -s http://localhost:8080/api/products/1/movements
```

### 4. Sales Orders

Create a sales order (returns 201 Created):
```bash
curl -i -X POST http://localhost:8080/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer": "CV Maju Terus",
    "items": [
      {"sku": "ATK-001", "qty": 2},
      {"sku": "ATK-003", "qty": 1}
    ]
  }'
```

Create an order with insufficient stock (returns 409 INSUFFICIENT_STOCK):
```bash
curl -i -X POST http://localhost:8080/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer": "Toko Berkah",
    "items": [
      {"sku": "ATK-016", "qty": 500}
    ]
  }'
```

Create an order with an unknown SKU (returns 400 VALIDATION_ERROR):
```bash
curl -i -X POST http://localhost:8080/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer": "Toko Berkah",
    "items": [
      {"sku": "ATK-999", "qty": 1}
    ]
  }'
```

Create an order with an inactive product (returns 400 VALIDATION_ERROR):
```bash
curl -i -X POST http://localhost:8080/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer": "Toko Berkah",
    "items": [
      {"sku": "ATK-007", "qty": 1}
    ]
  }'
```

Get order details by ID:
```bash
curl -s http://localhost:8080/api/orders/1
```

Get non-existent order (returns 404 NOT_FOUND):
```bash
curl -i http://localhost:8080/api/orders/9999
```

Cancel an order (restores product stock into database):
```bash
curl -i -X POST http://localhost:8080/api/orders/1/cancel
```

Cancel an order that is already cancelled (returns 409 ALREADY_CANCELLED):
```bash
curl -i -X POST http://localhost:8080/api/orders/1/cancel
```

---

## Design Decisions

1. SKU Normalization: All SKU inputs are trimmed and converted to uppercase on both backend and frontend. This avoids casing ambiguities (e.g. `atk-001` vs `ATK-001`) and ensures accurate server error mapping to form rows.
2. Dynamically Derived Last Movement Timestamp: The `last_movement_at` field is not stored as a denormalized column on the `products` table to eliminate synchronization drift. Instead, it is computed dynamically via a `MAX(sm.created_at)` subquery during product queries.
3. Low Stock Operational Definition: The `low_stock` filter is strictly defined as active products with stock <= 10 (`is_active AND stock <= 10`). Inactive products are discontinued and do not require procurement alerts regardless of their stock level.
4. Stock Immutability via Product Update: Endpoint `PUT /api/products/{id}` deliberately disallows direct modification of the `stock` column. Stock can only be altered through formal stock movements (`stock_movements`) and order workflows (`sales_orders`).
5. Constraint-Driven Concurrency: We avoid check-then-act anti-patterns that introduce race conditions. The application relies on PostgreSQL constraints as the single source of truth: error code 23505 is mapped to 409 `SKU_TAKEN`, and 23503 is mapped to 409 `PRODUCT_HAS_HISTORY`.
6. Partial Status Updates via Pointer Bool: In `PUT /api/products/{id}`, `is_active` is parsed as `*bool` and evaluated in SQL using `is_active = COALESCE($4, is_active)`. This guarantees that updating name or price does not inadvertently reactivate archived products.
7. SQL Wildcard Sanitization: Characters `%`, `_`, and `\` in search inputs are sanitized prior to entering the `ILIKE` clause to prevent unintended pattern matching or syntax errors.
8. Atomic Stock Decrement and Overflow Guards: Decrementing stock runs inside an atomic transaction where `WHERE stock >= qty` is evaluated directly in the `UPDATE` query. If 0 rows are affected, the system fetches current stock and returns 409 `INSUFFICIENT_STOCK`. Quantities are capped at 1,000,000 to prevent integer arithmetic overflow in PostgreSQL.
9. Deadlock Prevention via Deterministic SKU Ordering: When concurrent orders attempt to lock multiple product rows, deadlocks occur if rows are locked in conflicting sequences. The system sorts items lexicographically by SKU prior to acquiring locks, ensuring a uniform locking order. As a consequence, order items are persisted and returned in alphabetical order by SKU.
10. Valuation Accounts for Inactive Inventory; Low Stock Focuses on Active: Inventory valuation (`total_stock_value`) includes all products including inactive ones, as physical units in the warehouse remain capitalized assets. Conversely, `low_stock_count` only accounts for active items. Multiplication uses `price::bigint * stock` to prevent 32-bit integer overflow.
11. Atomic Stock Restoration on Order Cancellation: The cancel handler initiates a transaction, transitions status from `CREATED` to `CANCELLED`, retrieves the line items, restores inventory quantities, records `in` movements with the note "Cancellation Order #id", and commits. If the order is already cancelled, it returns 409 `ALREADY_CANCELLED`.
12. Centralized Frontend API Client: All network requests and error envelope handling are encapsulated inside `src/api/client.ts`. UI components do not use raw `fetch`, but interact with typed contracts and the `ApiError` class.
13. Inline Server Error Mapping per Row: Pure function `mapOrderError` parses validation error details (400 `unknown sku`, `inactive sku`, `items[N]`) and 409 `INSUFFICIENT_STOCK` (with remaining stock) to highlight the specific problematic row with a rose border and warning message.
14. State Lifting to Prevent Nested Overlays: The `OrderDetail` modal is reused for both navbar order search and post-order creation confirmation. State `viewingOrderId` is lifted to `App`, closing the creation form before opening the order details, preventing stacked modal backdrops.
15. Query Invalidation on Stale Cancellation: When an order is cancelled from another browser tab and returns 409 `ALREADY_CANCELLED`, `['order', orderId]` query cache is immediately invalidated, automatically updating the status badge and hiding the cancel button.

---

## What Would Be Improved with More Time

1. Autocomplete / Searchable SKU Dropdown: Currently users must enter SKUs manually. Adding a searchable dropdown for active products would speed up order entry and prevent typing errors.
2. Sales Orders History List: Orders are currently accessed via direct ID lookup or post-creation confirmation. A dedicated order list view with pagination and status filters would streamline operational tracking.
3. Movements Timeline Drawer: The backend provides `GET /api/products/{id}/movements`. A side drawer displaying historical movements per product would give inventory staff immediate ledger visibility.
4. Database Migration Tool: Schema and seeds are currently applied via SQL scripts on container creation. Integrating an automated migration tool such as `golang-migrate` or `goose` would better manage schema versioning across staging and production.
5. Optimistic UI Updates: For low-latency interactions, inventory adjustments could update UI state optimistically with automated rollbacks on mutation failure.
6. Automated End-to-End Testing: Implementing Playwright browser tests to simulate complete user journeys across table pagination, order creation, and cancellation.

---

## Honest Work Hours

Total project implementation time was approximately 7 hours 45 minutes, divided into focused sessions:

- Database Schema Design, Seed Data, and Initial Setup (~1 hour 15 minutes): Creating `db/001_schema.sql`, 16 test product scenarios in `db/002_seed.sql`, and Docker Compose integration.
- Go Backend Development (~2 hours 30 minutes): Implementing Go 1.22+ `http.ServeMux` handlers, `pgxpool` connection management, CRUD endpoints, summary aggregation, atomic stock adjustments, and order transactions.
- Backend Integration & Concurrency Testing (~1 hour): Writing `api_test.go` using the Go race detector (`-race`), testing transaction rollbacks, and verifying zero overselling across 20 concurrent goroutines.
- Core Frontend Implementation (~1 hour 15 minutes): Vite, TypeScript, Tailwind CSS v4, and TanStack Query configuration, typed `client.ts`, formatting utilities, summary metric cards, and product table with pagination, search, and status filters.
- Interactive Modals, Error Mapping & UX Refinements (~1 hour 45 minutes): Stock adjustment modal, dynamic multi-row order creation form with per-row server error mapping, order details modal with inline cancellation, double-overlay elimination, and comprehensive Vitest unit tests.

---

## Tools Used

- Programming Languages: Go 1.25, TypeScript 5.8
- Runtime Environments: Node.js v24, macOS (Darwin arm64)
- Database: PostgreSQL 16 Alpine containerized via Docker Compose
- Web Framework & Libraries: React 19, Vite 8, TanStack React Query v5, Tailwind CSS v4
- Database Driver: `github.com/jackc/pgx/v5` (`pgxpool`)
- Testing & Tooling: `go test` (with `-race` flag), Vitest v3, ESLint v10
- AI Assistance: Google DeepMind Antigravity as an AI pair programmer, assisting with database concurrency architecture design, race condition analysis, regex formulation for server error mapping, and structuring integration and unit test coverage.
