package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	internalnats "gnats/internal/nats"
	"gnats/internal/service"

	"github.com/go-chi/chi/v5"
)

type contextKey string

const natsClientKey contextKey = "nats_client"

type API struct {
	manager   *internalnats.Manager
	jsService *service.JetStreamService
	kvService *service.KVService
	obService *service.ObjectService
	svService *service.ServicesService
}

type JSONResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

func (a *API) sendJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(JSONResponse{Success: true, Data: data})
}

func (a *API) sendError(w http.ResponseWriter, err string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(JSONResponse{Success: false, Error: err})
}

func NewAPI(manager *internalnats.Manager) *API {
	return &API{
		manager:   manager,
		jsService: service.NewJetStreamService(),
		kvService: service.NewKVService(),
		obService: service.NewObjectService(),
		svService: service.NewServicesService(),
	}
}

// WithNATSClient is a middleware that injects the NATS client into the request context
func (a *API) WithNATSClient(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if id == "" {
			next.ServeHTTP(w, r)
			return
		}

		client, err := a.manager.EnsureClient(id)
		if err != nil {
			http.Error(w, "connection not found: "+err.Error(), http.StatusNotFound)
			return
		}

		ctx := context.WithValue(r.Context(), natsClientKey, client)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// getClient retrieves the NATS client from the request context
func (a *API) getClient(r *http.Request) *internalnats.Client {
	if client, ok := r.Context().Value(natsClientKey).(*internalnats.Client); ok {
		return client
	}
	return nil
}

func (a *API) Routes() chi.Router {
	r := chi.NewRouter()

	r.Get("/connections", a.ListConnections)
	r.Post("/connections", a.Connect)

	// Group routes that require a NATS client
	r.Group(func(r chi.Router) {
		r.Use(a.WithNATSClient)

		r.Put("/connections/{id}", a.UpdateConnection)
		r.Delete("/connections/{id}", a.Disconnect)
		r.Delete("/connections/{id}/forget", a.DeleteConnection)
		r.Post("/connections/{id}/publish", a.Publish)

		r.Get("/connections/{id}/streams", a.ListStreams)
		r.Post("/connections/{id}/streams", a.CreateStream)
		r.Delete("/connections/{id}/streams/{stream}", a.DeleteStream)
		r.Get("/connections/{id}/streams/{stream}/messages", a.GetStreamMessages)
		r.Post("/connections/{id}/streams/{stream}/purge", a.PurgeStream)
		r.Get("/connections/{id}/streams/{stream}/consumers", a.ListConsumers)

		r.Get("/connections/{id}/kv", a.ListKV)
		r.Post("/connections/{id}/kv", a.CreateKV)
		r.Delete("/connections/{id}/kv/{bucket}", a.DeleteKV)
		r.Get("/connections/{id}/kv/{bucket}/status", a.GetKVStatus)
		r.Get("/connections/{id}/kv/{bucket}/keys", a.ListKVKeys)
		r.Get("/connections/{id}/kv/{bucket}/keys/{key}", a.GetKVKey)
		r.Put("/connections/{id}/kv/{bucket}/keys/{key}", a.PutKVKey)
		r.Delete("/connections/{id}/kv/{bucket}/keys/{key}", a.DeleteKVKey)

		r.Get("/connections/{id}/object-store", a.ListObjectStores)
		r.Post("/connections/{id}/object-store", a.CreateObjectStore)
		r.Delete("/connections/{id}/object-store/{bucket}", a.DeleteObjectStore)
		r.Get("/connections/{id}/object-store/{bucket}/status", a.GetObjectStoreStatus)
		r.Get("/connections/{id}/object-store/{bucket}/objects", a.ListObjects)
		r.Delete("/connections/{id}/object-store/{bucket}/objects/{key}", a.DeleteObject)

		r.Get("/connections/{id}/services", a.ListServices)
		r.Get("/connections/{id}/stats", a.GetStats)
	})

	return r
}

func fetchJSON(url string, target interface{}) error {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return json.NewDecoder(resp.Body).Decode(target)
}
