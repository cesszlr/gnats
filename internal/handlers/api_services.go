package handlers

import (
	"encoding/json"
	"net/http"
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
