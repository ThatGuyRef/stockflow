# Stockflow - Inventory and Order Management System

Sistem manajemen inventaris dan sales order yang aman dari race condition (concurrency-safe), dibangun dengan backend Go, PostgreSQL 16, dan frontend React (Vite + TypeScript + Tailwind CSS).

---

## Cara Menjalankan

### 1. Database (PostgreSQL 16)
Pastikan Docker dan Docker Compose sudah terpasang.

Jalankan container PostgreSQL:
```bash
docker compose up -d
```
Database berjalan di host port `5433` (container port 5432) dengan kredensial default:
- Database: `stockflow`
- User: `user`
- Password: `user`
- Connection URL: `postgres://user:user@localhost:5433/stockflow?sslmode=disable`

Skema tabel (`db/001_schema.sql`) dan data awal seed (`db/002_seed.sql`) otomatis dieksekusi saat container pertama kali dibuat.

Untuk mereset database dan mengembalikan seluruh data seed ke kondisi awal:
```bash
docker compose down -v && docker compose up -d
```

### 2. Backend (Go 1.22+)
Backend menggunakan Go native HTTP routing (`http.ServeMux` Go 1.22+) tanpa external web framework.

```bash
cd backend
go run ./cmd/api
```
Server akan mendengarkan di port `8080` (`http://localhost:8080`).

Jika ingin menggunakan URL database yang berbeda:
```bash
DATABASE_URL="postgres://user:user@localhost:5433/stockflow?sslmode=disable" go run ./cmd/api
```

### 3. Frontend (React 19 + TypeScript + Vite)
```bash
cd frontend
npm install
npm run dev
```
Aplikasi frontend akan berjalan di `http://localhost:5173`.

Catatan proxy Vite: File `vite.config.ts` sudah dikonfigurasi dengan proxy:
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
Semua request ke `/api/*` dari browser secara otomatis diteruskan ke backend Go di `http://localhost:8080`, sehingga tidak terjadi masalah CORS selama tahap pengembangan.

### 4. Menjalankan Test Backend
Test backend mencakup pengujian konkurensi goroutine untuk mencegah overselling dan race condition:
```bash
cd backend
go test -race ./internal/api/ -v
```

### 5. Menjalankan Test Frontend dan Build
```bash
cd frontend
# Menjalankan unit test Vitest
npx vitest run

# Menjalankan linter ESLint
npm run lint

# Menjalankan type-check TypeScript dan build produksi
npm run build
```

---

## Contoh curl untuk Semua Endpoint

### 1. Health Check
```bash
curl -i http://localhost:8080/api/health
```

### 2. Produk

Daftar produk dengan paginasi:
```bash
curl -s "http://localhost:8080/api/products?page=1&limit=5"
```

Pencarian produk (case-insensitive substring):
```bash
curl -s "http://localhost:8080/api/products?search=kertas"
```

Filter status produk (`active`, `inactive`, `low_stock`):
```bash
# Produk aktif
curl -s "http://localhost:8080/api/products?status=active"

# Produk nonaktif
curl -s "http://localhost:8080/api/products?status=inactive"

# Produk stok menipis (aktif dengan stok <= 10)
curl -s "http://localhost:8080/api/products?status=low_stock"
```

Tambah produk baru:
```bash
curl -i -X POST http://localhost:8080/api/products \
  -H "Content-Type: application/json" \
  -d '{"sku":"ATK-017","name":"Map Plastik L Transparan","price":2500}'
```

Tambah produk dengan SKU duplikat (menghasilkan 409 SKU_TAKEN):
```bash
curl -i -X POST http://localhost:8080/api/products \
  -H "Content-Type: application/json" \
  -d '{"sku":"ATK-017","name":"Map Plastik Duplikat","price":2500}'
```

Update produk:
```bash
curl -i -X PUT http://localhost:8080/api/products/17 \
  -H "Content-Type: application/json" \
  -d '{"sku":"ATK-017","name":"Map Plastik Folio F4","price":3000}'
```

Hapus produk tanpa riwayat mutasi atau order (menghasilkan 204 No Content):
```bash
curl -i -X DELETE http://localhost:8080/api/products/17
```

Hapus produk yang memiliki riwayat mutasi atau order (menghasilkan 409 PRODUCT_HAS_HISTORY):
```bash
curl -i -X DELETE http://localhost:8080/api/products/1
```

Ringkasan inventaris (Summary):
```bash
curl -s http://localhost:8080/api/products/summary
```

### 3. Penyesuaian Stok (Stock Adjustment) & Riwayat Mutasi

Tambah stok masuk (in):
```bash
curl -i -X POST http://localhost:8080/api/products/1/stock \
  -H "Content-Type: application/json" \
  -d '{"type":"in","qty":20,"note":"Penerimaan barang dari supplier"}'
```

Kurangi stok keluar (out):
```bash
curl -i -X POST http://localhost:8080/api/products/1/stock \
  -H "Content-Type: application/json" \
  -d '{"type":"out","qty":5,"note":"Barang rusak di gudang"}'
```

Kurangi stok melebihi stok yang tersedia (menghasilkan 409 INSUFFICIENT_STOCK):
```bash
curl -i -X POST http://localhost:8080/api/products/16/stock \
  -H "Content-Type: application/json" \
  -d '{"type":"out","qty":999,"note":"Uji pengurangan melebihi kapasitas"}'
```

Input qty tidak valid (menghasilkan 400 VALIDATION_ERROR):
```bash
curl -i -X POST http://localhost:8080/api/products/1/stock \
  -H "Content-Type: application/json" \
  -d '{"type":"in","qty":0}'
```

Lihat riwayat pergerakan stok suatu produk:
```bash
curl -s http://localhost:8080/api/products/1/movements
```

### 4. Pesanan (Sales Orders)

Buat pesanan baru (berhasil 201 Created):
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

Buat pesanan dengan stok tidak mencukupi (menghasilkan 409 INSUFFICIENT_STOCK):
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

Buat pesanan dengan SKU tidak dikenal (menghasilkan 400 VALIDATION_ERROR):
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

Buat pesanan dengan produk nonaktif (menghasilkan 400 VALIDATION_ERROR):
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

Lihat detail pesanan berdasarkan ID:
```bash
curl -s http://localhost:8080/api/orders/1
```

Lihat pesanan yang tidak ada (menghasilkan 404 NOT_FOUND):
```bash
curl -i http://localhost:8080/api/orders/9999
```

Batalkan pesanan (mengembalikan stok produk ke database):
```bash
curl -i -X POST http://localhost:8080/api/orders/1/cancel
```

Batalkan pesanan yang sudah berstatus CANCELLED (menghasilkan 409 ALREADY_CANCELLED):
```bash
curl -i -X POST http://localhost:8080/api/orders/1/cancel
```

---

## Keputusan Desain

1. Normalisasi SKU: Semua input SKU selalu di-trim dan diubah ke huruf kapital di backend maupun frontend. Ini mencegah kebingungan seperti `atk-001` versus `ATK-001` serta memastikan pencocokan error server ke baris form selalu akurat.
2. Timestamp Pergerakan Terakhir Dinamis: Kolom `last_movement_at` tidak disimpan sebagai kolom statis pada tabel `products` untuk menghindari desinkronisasi. Nilai ini dihitung dinamis menggunakan subquery `MAX(sm.created_at)` saat query dijalankan.
3. Definisi Stok Menipis (Low Stock): Filter `low_stock` didefinisikan sebagai produk yang berstatus aktif dan memiliki stok <= 10 (`is_active AND stock <= 10`). Produk nonaktif tidak perlu memunculkan peringatan pengadaan karena memang sudah dihentikan operasional penjualannya.
4. Immutability Stok via Update Produk: Endpoint `PUT /api/products/{id}` sengaja melarang perubahan kolom `stock`. Stok hanya boleh bertambah atau berkurang lewat mutasi stok resmi (`stock_movements`) dan pesanan (`sales_orders`).
5. Concurrency Berbasis Database Constraints: Kami menghindari pengecekan manual sebelum eksekusi (anti-pattern check-then-act) yang rawan race condition. Kami mengandalkan PostgreSQL constraints secara langsung: kode error 23505 dipetakan ke 409 `SKU_TAKEN`, dan 23503 dipetakan ke 409 `PRODUCT_HAS_HISTORY`.
6. Update Parsial Status Aktif: Pada `PUT /api/products/{id}`, kolom `is_active` diparse sebagai pointer `*bool` dan dievaluasi di SQL menggunakan `is_active = COALESCE($4, is_active)`. Ini memastikan update nama atau harga tidak sengaja mengaktifkan kembali produk yang berstatus nonaktif.
7. Sanitasi Karakter Wildcard SQL: Karakter `%`, `_`, dan `\` pada input pencarian di-escape terlebih dahulu sebelum dimasukkan ke klausul `ILIKE` untuk mencegah perilaku pencarian yang tidak terduga atau syntax error.
8. Mutasi Stok Atomik dan Batas Kuantitas: Pengurangan stok dijalankan dalam transaksi dengan klausul `WHERE stock >= qty` langsung di query `UPDATE`. Jika baris yang terpengaruh bernilai 0, sistem langsung mengembalikan status stok terkini (409 `INSUFFICIENT_STOCK`). Kuantitas dibatasi maksimal 1.000.000 untuk mencegah overflow integer di PostgreSQL.
9. Pencegahan Deadlock pada Transaksi Order: Ketika beberapa goroutine mencoba mengunci sejumlah baris produk secara bersamaan, potensi deadlock bisa terjadi jika urutan penguncian berbeda. Sistem selalu mengurutkan item pesanan berdasarkan SKU secara leksikografis sebelum melakukan update stok, sehingga urutan penguncian baris selalu seragam dan bebas deadlock. Konsekuensinya, item pada pesanan tersimpan dan dikembalikan dalam urutan abjad SKU.
10. Valuasi Aset vs Peringatan Pengadaan: Nilai total inventaris (`total_stock_value`) menghitung semua barang termasuk yang berstatus nonaktif, karena unit fisik barang di gudang tetap bernilai aset uang. Sebaliknya, penghitung stok menipis (`low_stock_count`) hanya memperhitungkan barang aktif. Perkalian harga dan stok di-cast ke `bigint` untuk mencegah overflow integer 32-bit.
11. Pengembalian Stok Aman saat Pembatalan: Handler pembatalan order membuka transaksi atomik, mengubah status dari `CREATED` ke `CANCELLED`, mengambil daftar item pesanan, menambahkan kembali stok produk, mencatat mutasi stok `in` dengan catatan "Cancellation Order #id", lalu meng-commit transaksi. Jika order sudah berstatus `CANCELLED`, sistem mengembalikan 409 `ALREADY_CANCELLED`.
12. Satu Modul API Client Terpusat (Frontend): Semua fungsi HTTP dan pemrosesan envelope error diisolasi ke dalam `src/api/client.ts`. Komponen UI tidak melakukan `fetch` langsung, melainkan menerima data bertipe pasti atau instance `ApiError`.
13. Pemetaan Error Server ke Input Baris: Fungsi pure `mapOrderError` mengekstrak pesan detail error 400 (`unknown sku`, `inactive sku`, `items[N]`) dan 409 (`INSUFFICIENT_STOCK` beserta sisa stok tersedia) untuk menyorot container baris yang salah dengan border merah rose dan pesan kesalahan inline.
14. Pengangkatan State Order Modal (Single Overlay): Komponen `OrderDetail` dipakai bersama baik untuk melihat detail order dari pencarian navbar maupun sebagai tampilan konfirmasi setelah order dibuat. State `viewingOrderId` diangkat ke level `App` sehingga tidak terjadi penumpukan overlay ganda di layar.
15. Sinkronisasi Data Basi pada Pembatalan: Jika pesanan dibatalkan dari tab atau pengguna lain dan menghasilkan error 409 `ALREADY_CANCELLED`, query cache `['order', orderId]` seketika di-invalidate agar badge status dan tombol langsung menyesuaikan dengan status terbaru di server.

---

## Yang Akan Diperbaiki Kalau Ada Waktu Lebih

1. Fitur Autocomplete / Dropdown Pencarian SKU: Form pembuatan pesanan saat ini mengharuskan pengguna mengetik SKU secara manual. Penambahan input autocomplete berbasis pencarian produk aktif akan mempercepat penginputan dan mencegah saltik SKU.
2. Tampilan Riwayat Transaksi Penjualan (Order List): Saat ini pesanan baru bisa dilihat lewat input pencarian ID atau langsung setelah pesanan dibuat. Tampilan tabel daftar seluruh pesanan dengan filter status dan tanggal akan mempermudah audit operasional.
3. Tampilan Riwayat Mutasi Barang pada Frontend: Backend sudah menyediakan endpoint `GET /api/products/{id}/movements`. Fitur drawer atau modal timeline pergerakan stok per produk dapat ditambahkan di tabel produk.
4. Migrasi Database Otomatis: Saat ini skema dan seed dijalankan melalui file SQL di Docker Compose. Menggunakan migration tool seperti `golang-migrate` atau `goose` akan memudahkan evolusi skema di lingkungan staging dan produksi.
5. Optimistic UI Updates: Pada koneksi lambat, perubahan stok dapat diperbarui terlebih dahulu di antarmuka sebelum respons server tiba, dengan rollback otomatis jika mutasi gagal.
6. Automated End-to-End Testing: Menambahkan pengujian integrasi browser end-to-end menggunakan Playwright untuk memverifikasi alur pengguna dari input tabel hingga dialog pesanan.

---

## Jam Kerja yang Jujur

Total waktu pengerjaan proyek ini adalah sekitar 7 jam 45 menit, yang dikerjakan secara bertahap dalam beberapa sesi terfokus:

- Perancangan Skema Database, Seed Data, dan Setup Awal (sekitar 1 jam 15 menit): Pembuatan `db/001_schema.sql`, 16 skenario produk ATK pada `db/002_seed.sql`, dan integrasi Docker Compose.
- Pengembangan Backend Go (sekitar 2 jam 30 menit): Implementasi `http.ServeMux` Go 1.22+, koneksi `pgxpool`, seluruh handler CRUD produk, kalkulasi summary, mutasi stok atomik, order transaksi, dan endpoint pembatalan.
- Integration Testing Backend & Concurrency (sekitar 1 jam): Penulisan `api_test.go` dengan Go race detector (`-race`), verifikasi isolasi transaksi order, verifikasi rollback atomik saat stok kurang, dan uji no-oversell 20 goroutine bersamaan.
- Pengembangan Frontend Bagian Dasar (sekitar 1 jam 15 menit): Konfigurasi Vite, TypeScript, Tailwind CSS v4, TanStack Query, pembuatan `client.ts`, fungsi utilitas formatting, ringkasan cards, dan tabel produk dengan paginasi, pencarian, dan filter status.
- Pengembangan Fitur Interaktif Modal & Error Handling (sekitar 1 jam 45 menit): Implementasi modal penyesuaian stok, form pembuatan pesanan multi-baris dengan per-row error mapping, modal detail & pembatalan pesanan, pencegahan double overlay, dan perapian test Vitest.

---

## Alat yang Dipakai

- Bahasa Pemrograman: Go 1.25, TypeScript 5.8
- Runtime Lingkungan: Node.js v24, macOS (Darwin arm64)
- Database: PostgreSQL 16 Alpine berjalan via Docker Compose
- Web Framework / Library Frontend: React 19, Vite 8, TanStack React Query v5, Tailwind CSS v4
- Driver Database Backend: `github.com/jackc/pgx/v5` (`pgxpool`)
- Pengujian & Kualitas Kode: `go test` (dengan flag `-race`), Vitest v3, ESLint v10
- Alat Bantu AI: Google DeepMind Antigravity sebagai AI pair programmer yang membantu brainstorming struktur arsitektur concurrency database, mengecek skenario perlombaan data (race conditions), menyusun regex pemetaan error server ke form baris, dan memandu pembuatan unit test serta integration test secara komprehensif.
