package main

import (
	"embed"
	"io/fs"
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

//go:embed ui/dist/*
var embeddedFiles embed.FS

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
	var staticFS http.FileSystem

	// Check if we should use local files (development) or embedded files (production)
	if os.Getenv("DEBUG") == "true" {
		log.Println("Development mode: serving static files from ui/dist")
		workDir, _ := os.Getwd()
		staticFS = http.Dir(filepath.Join(workDir, "ui/dist"))
	} else {
		// Use embedded files
		sub, err := fs.Sub(embeddedFiles, "ui/dist")
		if err != nil {
			log.Fatal(err)
		}
		staticFS = http.FS(sub)
	}

	// Create a file server
	fileServer := http.FileServer(staticFS)

	// Serve static files and fallback to index.html for React Router
	r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		// If the path has a file extension, try to serve the file
		if strings.Contains(filepath.Base(path), ".") {
			// Check if file exists in the file system
			f, err := staticFS.Open(path)
			if err == nil {
				f.Close()
				fileServer.ServeHTTP(w, r)
				return
			}
		}

		// Otherwise, serve index.html for React Router
		// We need to read index.html from staticFS
		index, err := staticFS.Open("index.html")
		if err != nil {
			http.Error(w, "index.html not found", http.StatusNotFound)
			return
		}
		defer index.Close()
		stat, _ := index.Stat()
		http.ServeContent(w, r, "index.html", stat.ModTime(), index)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Starting server on :%s\n", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
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
