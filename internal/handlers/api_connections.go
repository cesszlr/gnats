package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"

	internalnats "gnats/internal/nats"

	"github.com/go-chi/chi/v5"
)

func (a *API) ListConnections(w http.ResponseWriter, r *http.Request) {
	activeID := r.URL.Query().Get("active_id")
	if activeID != "" {
		// Active check: ensure the client is connected if it's the active one
		_, _ = a.manager.EnsureClient(activeID)
	}

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

	// If ID has changed, delete the old one
	if id != "" && id != cfg.ID {
		a.manager.DeleteConfig(id)
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
		baseURL := strings.TrimSuffix(monitorURL, "/")

		// 1. Fetch Account Stats
		var monitorData struct {
			AccountStatz []map[string]interface{} `json:"account_statz"`
		}
		if err := fetchJSON(baseURL+"/accstatz?unused=true", &monitorData); err == nil {
			// Sort accounts by name for stability
			sort.Slice(monitorData.AccountStatz, func(i, j int) bool {
				nameI, _ := monitorData.AccountStatz[i]["acc"].(string)
				nameJ, _ := monitorData.AccountStatz[j]["acc"].(string)
				return nameI < nameJ
			})
			stats["monitoring"] = monitorData
		} else {
			stats["monitoring_error"] = err.Error()
		}

		stats["monitoring_url"] = baseURL
	}

	a.sendJSON(w, stats)
}

func (a *API) GetMonitoringConnections(w http.ResponseWriter, r *http.Request) {
	client := a.getClient(r)

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

	if monitorURL == "" {
		a.sendJSON(w, map[string]interface{}{"connections": []interface{}{}})
		return
	}

	baseURL := strings.TrimSuffix(monitorURL, "/")
	sortBy := r.URL.Query().Get("sort")
	if sortBy == "" || sortBy == "msgs_pending" {
		sortBy = "pending" // Default is pending bytes
	}

	var connzData struct {
		Conns []map[string]interface{} `json:"connections"`
	}
	// Sort by selected parameter descending, limit to 10
	if err := fetchJSON(fmt.Sprintf("%s/connz?sort=%s&limit=10", baseURL, sortBy), &connzData); err == nil {
		a.sendJSON(w, map[string]interface{}{"connections": connzData.Conns})
	} else {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
	}
}

func (a *API) GetClusterTopology(w http.ResponseWriter, r *http.Request) {
	client := a.getClient(r)

	monitorURL := client.Config.MonitoringURL
	if monitorURL == "" {
		if u, err := url.Parse(client.Config.URL); err == nil {
			host := u.Hostname()
			if host == "" {
				host = "localhost"
			}
			monitorURL = fmt.Sprintf("http://%s:8222", host)
		}
	}

	if monitorURL == "" {
		a.sendError(w, "monitoring url could not be determined", http.StatusBadRequest)
		return
	}

	baseURL := strings.TrimSuffix(monitorURL, "/")

	var varzData struct {
		ServerID    string      `json:"server_id"`
		ServerName  string      `json:"server_name"`
		ClusterName interface{} `json:"cluster"`
	}
	var routezData struct {
		Routes []map[string]interface{} `json:"routes"`
	}
	var leafzData struct {
		Leafs []map[string]interface{} `json:"leafs"`
	}

	_ = fetchJSON(baseURL+"/varz", &varzData)
	_ = fetchJSON(baseURL+"/routez", &routezData)
	_ = fetchJSON(baseURL+"/leafz", &leafzData)

	clusterName := ""
	if varzData.ClusterName != nil {
		if str, ok := varzData.ClusterName.(string); ok {
			clusterName = str
		} else if m, ok := varzData.ClusterName.(map[string]interface{}); ok {
			if name, ok := m["name"].(string); ok {
				clusterName = name
			}
		}
	}

	result := map[string]interface{}{
		"server_id":    varzData.ServerID,
		"server_name":  varzData.ServerName,
		"cluster_name": clusterName,
		"routes":       routezData.Routes,
		"leafnodes":    leafzData.Leafs,
	}

	a.sendJSON(w, result)
}

func (a *API) GetClusterNodesStats(w http.ResponseWriter, r *http.Request) {
	client := a.getClient(r)

	monitorURL := client.Config.MonitoringURL
	if monitorURL == "" {
		if u, err := url.Parse(client.Config.URL); err == nil {
			host := u.Hostname()
			if host == "" {
				host = "localhost"
			}
			monitorURL = fmt.Sprintf("http://%s:8222", host)
		}
	}

	if monitorURL == "" {
		a.sendError(w, "monitoring url could not be determined", http.StatusBadRequest)
		return
	}

	baseURL := strings.TrimSuffix(monitorURL, "/")

	var localVarz map[string]interface{}
	if err := fetchJSON(baseURL+"/varz", &localVarz); err != nil {
		a.sendError(w, "failed to fetch local varz: "+err.Error(), http.StatusInternalServerError)
		return
	}

	var routezData struct {
		Routes []map[string]interface{} `json:"routes"`
	}
	_ = fetchJSON(baseURL+"/routez", &routezData)

	port := "8222"
	if u, err := url.Parse(monitorURL); err == nil && u.Port() != "" {
		port = u.Port()
	}

	type nodeJob struct {
		name string
		url  string
	}
	var jobs []nodeJob
	jobs = append(jobs, nodeJob{name: "local", url: baseURL + "/varz"})

	seenIPs := make(map[string]bool)
	if u, err := url.Parse(baseURL); err == nil {
		if host := u.Hostname(); host != "" {
			seenIPs[host] = true
		}
	}

	for _, route := range routezData.Routes {
		if ip, ok := route["ip"].(string); ok && ip != "" {
			if seenIPs[ip] {
				continue
			}
			seenIPs[ip] = true
			jobs = append(jobs, nodeJob{
				name: ip,
				url:  fmt.Sprintf("http://%s:%s/varz", ip, port),
			})
		}
	}

	type nodeResult struct {
		url  string
		data map[string]interface{}
		err  error
	}

	resultsChan := make(chan nodeResult, len(jobs))
	var wg sync.WaitGroup

	for _, job := range jobs {
		wg.Add(1)
		go func(j nodeJob) {
			defer wg.Done()
			var data map[string]interface{}
			err := fetchJSON(j.url, &data)
			resultsChan <- nodeResult{url: j.url, data: data, err: err}
		}(job)
	}

	wg.Wait()
	close(resultsChan)

	var nodes []map[string]interface{}
	seenNodes := make(map[string]bool)
	for res := range resultsChan {
		if res.err == nil && res.data != nil {
			sID, _ := res.data["server_id"].(string)
			if sID != "" {
				if seenNodes[sID] {
					continue
				}
				seenNodes[sID] = true
			}
			nodes = append(nodes, res.data)
		} else {
			log.Printf("failed to fetch cluster node stats from %s: %v", res.url, res.err)
		}
	}

	if len(nodes) == 0 && localVarz != nil {
		nodes = append(nodes, localVarz)
	}

	sort.Slice(nodes, func(i, j int) bool {
		nameI, _ := nodes[i]["server_name"].(string)
		nameJ, _ := nodes[j]["server_name"].(string)
		return nameI < nameJ
	})

	a.sendJSON(w, map[string]interface{}{"nodes": nodes})
}
