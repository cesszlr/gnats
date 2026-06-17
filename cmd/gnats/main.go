package main

import (
	"bufio"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"gnats/internal/handlers"
	"gnats/internal/nats"
	"gnats/ui"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func loadEnv() {
	// Try current directory
	if loadEnvFile(".env") {
		return
	}
	// Try project root (two levels up if run from cmd/gnats)
	loadEnvFile("../../.env")
}

func loadEnvFile(path string) bool {
	file, err := os.Open(path)
	if err != nil {
		return false
	}
	defer file.Close()

	log.Printf("Loading environment variables from %s", path)
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			val := strings.TrimSpace(parts[1])
			val = strings.Trim(val, `"'`)
			// Only set if not already set by environment
			if os.Getenv(key) == "" {
				os.Setenv(key, val)
			}
		}
	}
	return true
}

func main() {
	loadEnv()

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
		workDir, _ := os.Getwd()
		path := filepath.Join(workDir, "ui/dist")
		if _, err := os.Stat(path); err != nil {
			// Try parent directory (e.g. if running from cmd/gnats)
			altPath := filepath.Join(workDir, "../../ui/dist")
			if _, err := os.Stat(altPath); err == nil {
				path = altPath
			}
		}
		log.Printf("Development mode: serving static files from %s\n", path)
		staticFS = http.Dir(path)
	} else {
		// Use embedded files
		sub, err := fs.Sub(ui.EmbeddedFiles, "dist")
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

	address := os.Getenv("ADDRESS")
	if address == "" {
		address = ":8080"
	} else if !strings.Contains(address, ":") {
		address = ":" + address
	}

	log.Printf("Starting server on %s\n", address)
	if err := http.ListenAndServe(address, r); err != nil {
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
