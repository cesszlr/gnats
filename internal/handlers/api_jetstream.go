package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/nats-io/nats.go/jetstream"
)

func (a *API) ListStreams(w http.ResponseWriter, r *http.Request) {
	client := a.getClient(r)
	result, err := a.jsService.ListStreams(r.Context(), client)
	if err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.sendJSON(w, result)
}

func (a *API) CreateStream(w http.ResponseWriter, r *http.Request) {
	var cfg jetstream.StreamConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		a.sendError(w, err.Error(), http.StatusBadRequest)
		return
	}

	client := a.getClient(r)
	info, err := a.jsService.CreateStream(r.Context(), client, cfg)
	if err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.sendJSON(w, info)
}

func (a *API) DeleteStream(w http.ResponseWriter, r *http.Request) {
	streamName := chi.URLParam(r, "stream")
	client := a.getClient(r)

	if err := a.jsService.DeleteStream(r.Context(), client, streamName); err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.sendJSON(w, nil)
}

func (a *API) ListConsumers(w http.ResponseWriter, r *http.Request) {
	streamName := chi.URLParam(r, "stream")
	client := a.getClient(r)

	result, err := a.jsService.ListConsumers(r.Context(), client, streamName)
	if err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.sendJSON(w, result)
}

func (a *API) GetStreamMessages(w http.ResponseWriter, r *http.Request) {
	streamName := chi.URLParam(r, "stream")
	client := a.getClient(r)

	limitStr := r.URL.Query().Get("limit")
	limit := 50
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
		limit = l
	}

	result, err := a.jsService.GetMessages(r.Context(), client, streamName, limit)
	if err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.sendJSON(w, result)
}

func (a *API) PurgeStream(w http.ResponseWriter, r *http.Request) {
	streamName := chi.URLParam(r, "stream")
	client := a.getClient(r)

	if err := a.jsService.PurgeStream(r.Context(), client, streamName); err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.sendJSON(w, nil)
}
