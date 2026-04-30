package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"

	internalnats "gnats/internal/nats"

	"github.com/go-chi/chi/v5"
)

func (a *API) ListConnections(w http.ResponseWriter, r *http.Request) {
	connections := a.manager.ListClients()
	a.sendJSON(w, connections)
}

func (a *API) Connect(w http.ResponseWriter, r *http.Request) {
	var cfg internalnats.ConnectionConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		a.sendError(w, err.Error(), http.StatusBadRequest)
		return
	}

	if cfg.ID == "" {
		a.sendError(w, "ID is required", http.StatusBadRequest)
		return
	}

	client, err := a.manager.Connect(cfg)
	if err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	res := client.Config
	res.Status = strings.ToUpper(client.Conn.Status().String())
	a.sendJSON(w, res)
}

func (a *API) UpdateConnection(w http.ResponseWriter, r *http.Request) {
	var cfg internalnats.ConnectionConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		a.sendError(w, err.Error(), http.StatusBadRequest)
		return
	}

	id := chi.URLParam(r, "id")
	if cfg.ID == "" {
		cfg.ID = id
	}

	a.manager.UpdateConfig(cfg)
	a.sendJSON(w, nil)
}

func (a *API) Disconnect(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := a.manager.Disconnect(id); err != nil {
		a.sendError(w, err.Error(), http.StatusNotFound)
		return
	}
	a.sendJSON(w, nil)
}

func (a *API) DeleteConnection(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := a.manager.DeleteConfig(id); err != nil {
		a.sendError(w, err.Error(), http.StatusNotFound)
		return
	}
	a.sendJSON(w, nil)
}

func (a *API) GetStats(w http.ResponseWriter, r *http.Request) {
	client := a.getClient(r)

	stats := map[string]interface{}{
		"server_info": client.Conn.ConnectedAddr(),
		"rtt":         0,
		"status":      strings.ToUpper(client.Conn.Status().String()),
	}

	rtt, _ := client.Conn.RTT()
	stats["rtt"] = rtt.String()

	// Connection stats
	cStats := client.Conn.Stats()
	stats["connection"] = map[string]interface{}{
		"in_msgs":       cStats.InMsgs,
		"out_msgs":      cStats.OutMsgs,
		"in_bytes":      cStats.InBytes,
		"out_bytes":     cStats.OutBytes,
		"reconnects":    cStats.Reconnects,
		"subscriptions": client.Conn.NumSubscriptions(),
	}

	// JetStream stats
	jsInfo, err := client.JS.AccountInfo(r.Context())
	if err == nil {
		stats["jetstream"] = jsInfo
	}

	// Monitoring data
	monitorURL := client.Config.MonitoringURL
	if monitorURL == "" {
		// Try to derive from NATS URL
		if u, err := url.Parse(client.Config.URL); err == nil {
			host := u.Hostname()
			if host == "" {
				host = "localhost"
			}
			monitorURL = fmt.Sprintf("http://%s:8222", host)
		}
	}

	if monitorURL != "" {
		monitorURL = strings.TrimSuffix(monitorURL, "/") + "/accstatz?unused=true"
		var monitorData struct {
			AccountStatz []map[string]interface{} `json:"account_statz"`
		}
		if err := fetchJSON(monitorURL, &monitorData); err == nil {
			// Sort accounts by name for stability
			sort.Slice(monitorData.AccountStatz, func(i, j int) bool {
				nameI, _ := monitorData.AccountStatz[i]["acc"].(string)
				nameJ, _ := monitorData.AccountStatz[j]["acc"].(string)
				return nameI < nameJ
			})
			stats["monitoring"] = monitorData
		} else {
			stats["monitoring_error"] = err.Error()
			stats["monitoring_url"] = monitorURL
		}
	}

	a.sendJSON(w, stats)
}
