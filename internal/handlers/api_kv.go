package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/nats-io/nats.go/jetstream"
)

func (a *API) ListKV(w http.ResponseWriter, r *http.Request) {
	client := a.getClient(r)
	result, err := a.kvService.ListBuckets(r.Context(), client)
	if err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.sendJSON(w, result)
}

func (a *API) CreateKV(w http.ResponseWriter, r *http.Request) {
	var cfg jetstream.KeyValueConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		a.sendError(w, err.Error(), http.StatusBadRequest)
		return
	}

	client := a.getClient(r)
	status, err := a.kvService.CreateBucket(r.Context(), client, cfg)
	if err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.sendJSON(w, status)
}

func (a *API) DeleteKV(w http.ResponseWriter, r *http.Request) {
	bucket := chi.URLParam(r, "bucket")
	client := a.getClient(r)

	if err := a.kvService.DeleteBucket(r.Context(), client, bucket); err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.sendJSON(w, nil)
}

func (a *API) GetKVStatus(w http.ResponseWriter, r *http.Request) {
	bucket := chi.URLParam(r, "bucket")
	client := a.getClient(r)

	status, err := a.kvService.GetStatus(r.Context(), client, bucket)
	if err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.sendJSON(w, status)
}

func (a *API) ListKVKeys(w http.ResponseWriter, r *http.Request) {
	bucket := chi.URLParam(r, "bucket")
	search := r.URL.Query().Get("search")
	offsetStr := r.URL.Query().Get("offset")
	limitStr := r.URL.Query().Get("limit")

	offset := 0
	if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
		offset = o
	}
	limit := 100
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
		limit = l
	}

	client := a.getClient(r)
	result, err := a.kvService.ListKeys(r.Context(), client, bucket, search, offset, limit)
	if err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.sendJSON(w, result)
}

func (a *API) GetKVKey(w http.ResponseWriter, r *http.Request) {
	bucket := chi.URLParam(r, "bucket")
	key := chi.URLParam(r, "key")
	client := a.getClient(r)

	result, err := a.kvService.GetKey(r.Context(), client, bucket, key)
	if err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.sendJSON(w, result)
}

func (a *API) PutKVKey(w http.ResponseWriter, r *http.Request) {
	bucket := chi.URLParam(r, "bucket")
	key := chi.URLParam(r, "key")

	var req struct {
		Value string `json:"value"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		a.sendError(w, err.Error(), http.StatusBadRequest)
		return
	}

	client := a.getClient(r)
	if err := a.kvService.PutKey(r.Context(), client, bucket, key, req.Value); err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.sendJSON(w, nil)
}

func (a *API) DeleteKVKey(w http.ResponseWriter, r *http.Request) {
	bucket := chi.URLParam(r, "bucket")
	key := chi.URLParam(r, "key")
	client := a.getClient(r)

	if err := a.kvService.DeleteKey(r.Context(), client, bucket, key); err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.sendJSON(w, nil)
}
