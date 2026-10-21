package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	// 1. Baca DATABASE_URL dengan fallback
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://user:user@localhost:5433/stockflow"
	}

	// 2. Buat connection pool
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("Failed to create database connection pool: %v", err)
	}
	defer pool.Close()

	// 3. Ping database untuk memastikan koneksi aktif
	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	// 4. Inisialisasi ServeMux dan daftarkan route health check
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// 5. Jalankan server HTTP pada port :8080
	log.Println("Server is listening on :8080...")
	log.Fatal(http.ListenAndServe(":8080", mux))
}
