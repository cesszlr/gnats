package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/nats-io/nats.go/jetstream"
)

func (a *API) ListObjectStores(w http.ResponseWriter, r *http.Request) {
	client := a.getClient(r)
	result, err := a.obService.ListBuckets(r.Context(), client)
	if err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.sendJSON(w, result)
}

func (a *API) CreateObjectStore(w http.ResponseWriter, r *http.Request) {
	var cfg jetstream.ObjectStoreConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		a.sendError(w, err.Error(), http.StatusBadRequest)
		return
	}

	client := a.getClient(r)
	status, err := a.obService.CreateBucket(r.Context(), client, cfg)
	if err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.sendJSON(w, status)
}

func (a *API) DeleteObjectStore(w http.ResponseWriter, r *http.Request) {
	bucket := chi.URLParam(r, "bucket")
	client := a.getClient(r)

	if err := a.obService.DeleteBucket(r.Context(), client, bucket); err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.sendJSON(w, nil)
}

func (a *API) GetObjectStoreStatus(w http.ResponseWriter, r *http.Request) {
	bucket := chi.URLParam(r, "bucket")
	client := a.getClient(r)

	status, err := a.obService.GetStatus(r.Context(), client, bucket)
	if err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.sendJSON(w, status)
}

func (a *API) ListObjects(w http.ResponseWriter, r *http.Request) {
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
	result, err := a.obService.ListObjects(r.Context(), client, bucket, search, offset, limit)
	if err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.sendJSON(w, result)
}

func (a *API) DeleteObject(w http.ResponseWriter, r *http.Request) {
	bucket := chi.URLParam(r, "bucket")
	key := chi.URLParam(r, "key")
	client := a.getClient(r)

	if err := a.obService.DeleteObject(r.Context(), client, bucket, key); err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.sendJSON(w, nil)
}

func (a *API) DownloadObject(w http.ResponseWriter, r *http.Request) {
	bucket := chi.URLParam(r, "bucket")
	key := chi.URLParam(r, "key")
	client := a.getClient(r)

	result, err := a.obService.GetObject(r.Context(), client, bucket, key)
	if err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer result.Close()

	info, err := result.Info()
	if err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", info.Name))
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Length", fmt.Sprintf("%d", info.Size))

	if _, err := io.Copy(w, result); err != nil {
		return
	}
}
