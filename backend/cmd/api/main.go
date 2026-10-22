package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"

	"stockflow/internal/api"
)

func main() {
	// 1. Read DATABASE_URL with a local fallback
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://user:user@localhost:5433/stockflow"
	}

	// 2. Create the connection pool
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("Failed to create database connection pool: %v", err)
	}
	defer pool.Close()

	// 3. Ping the database to fail fast if it's unreachable
	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	// 4. Initialize ServeMux and register routes
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	productHandler := &api.Handler{Pool: pool}
	mux.HandleFunc("GET /api/products", productHandler.ListProducts)
	mux.HandleFunc("POST /api/products", productHandler.CreateProduct)
	mux.HandleFunc("PUT /api/products/{id}", productHandler.UpdateProduct)
	mux.HandleFunc("DELETE /api/products/{id}", productHandler.DeleteProduct)
	mux.HandleFunc("POST /api/products/{id}/stock", productHandler.AdjustStock)
	mux.HandleFunc("GET /api/products/{id}/movements", productHandler.ListMovements)
	mux.HandleFunc("POST /api/orders", productHandler.CreateOrder)

	// 5. Run the HTTP server on port :8080
	log.Println("Server is listening on :8080...")
	log.Fatal(http.ListenAndServe(":8080", mux))
}
