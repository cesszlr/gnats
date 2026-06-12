package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"
)

func (a *API) ListServices(w http.ResponseWriter, r *http.Request) {
	client := a.getClient(r)
	result, err := a.svService.ListServices(r.Context(), client)
	if err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.sendJSON(w, result)
}

func (a *API) Publish(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Subject string            `json:"subject"`
		Data    string            `json:"data"`
		Reply   string            `json:"reply"`
		Headers map[string]string `json:"headers"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		a.sendError(w, err.Error(), http.StatusBadRequest)
		return
	}

	client := a.getClient(r)
	if err := a.svService.Publish(client, req.Subject, req.Reply, req.Data, req.Headers); err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.sendJSON(w, nil)
}

func (a *API) Request(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Subject string            `json:"subject"`
		Reply   string            `json:"reply"`
		Data    string            `json:"data"`
		Headers map[string]string `json:"headers"`
		Timeout int               `json:"timeout"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		a.sendError(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.Timeout <= 0 {
		req.Timeout = 5000
	}

	timeout := time.Duration(req.Timeout) * time.Millisecond
	client := a.getClient(r)

	// Derive a timeout context from request context to support client cancel (Abort)
	ctx, cancel := context.WithTimeout(r.Context(), timeout)
	defer cancel()

	resp, duration, err := a.svService.RequestWithContext(ctx, client, req.Subject, req.Reply, req.Data, req.Headers, timeout)
	if err != nil {
		if r.Context().Err() == context.Canceled {
			// Request was aborted by client, return silently
			return
		}
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	headers := make(map[string]string)
	for k, v := range resp.Header {
		if len(v) > 0 {
			headers[k] = v[0]
		}
	}

	a.sendJSON(w, map[string]interface{}{
		"subject":    resp.Subject,
		"data":       string(resp.Data),
		"headers":    headers,
		"latency_ms": float64(duration.Microseconds()) / 1000.0,
	})
}
