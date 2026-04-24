package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"gnats/internal/handlers"
	"gnats/internal/nats"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func main() {
	manager := nats.NewManager()
	api := handlers.NewAPI(manager)
	ws := handlers.NewWSHandler(manager)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware)

	// API and WS routes
	r.Mount("/api", api.Routes())
	r.Get("/ws/{id}/subscribe", ws.Subscribe)

	// Static files serving
	workDir, _ := os.Getwd()
	distPath := filepath.Join(workDir, "ui/dist")

	// Create a file server for the dist directory
	fs := http.FileServer(http.Dir(distPath))

	// Serve static files and fallback to index.html for React Router
	r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		// If the path has a file extension, serve it directly
		if strings.Contains(filepath.Base(path), ".") {
			fs.ServeHTTP(w, r)
			return
		}

		// Otherwise, serve index.html for React Router
		http.ServeFile(w, r, filepath.Join(distPath, "index.html"))
	})

	log.Println("Starting server on :8080")
	if err := http.ListenAndServe(":8080", r); err != nil {
		log.Fatal(err)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
