package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

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

func (a *API) PurgeStream(w http.ResponseWriter, r *http.Request) {
	streamName := chi.URLParam(r, "stream")
	client := a.getClient(r)

	if err := a.jsService.PurgeStream(r.Context(), client, streamName); err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.sendJSON(w, nil)
}

func (a *API) GetConsumer(w http.ResponseWriter, r *http.Request) {
	streamName := chi.URLParam(r, "stream")
	consumerName := chi.URLParam(r, "consumer")
	client := a.getClient(r)

	info, err := a.jsService.GetConsumer(r.Context(), client, streamName, consumerName)
	if err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.sendJSON(w, info)
}

func (a *API) CreateConsumer(w http.ResponseWriter, r *http.Request) {
	streamName := chi.URLParam(r, "stream")
	client := a.getClient(r)

	var req struct {
		Durable        string   `json:"durable_name"`
		Description    string   `json:"description,omitempty"`
		DeliverPolicy  string   `json:"deliver_policy"`
		AckPolicy      string   `json:"ack_policy"`
		AckWaitSeconds int      `json:"ack_wait,omitempty"`
		MaxDeliver     int      `json:"max_deliver,omitempty"`
		FilterSubjects []string `json:"filter_subjects,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		a.sendError(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.Durable == "" {
		a.sendError(w, "durable_name is required", http.StatusBadRequest)
		return
	}

	cfg := jetstream.ConsumerConfig{
		Durable:     req.Durable,
		Description: req.Description,
	}

	switch req.DeliverPolicy {
	case "all":
		cfg.DeliverPolicy = jetstream.DeliverAllPolicy
	case "last":
		cfg.DeliverPolicy = jetstream.DeliverLastPolicy
	case "new":
		cfg.DeliverPolicy = jetstream.DeliverNewPolicy
	case "last_per_subject":
		cfg.DeliverPolicy = jetstream.DeliverLastPerSubjectPolicy
	default:
		cfg.DeliverPolicy = jetstream.DeliverAllPolicy
	}

	switch req.AckPolicy {
	case "explicit":
		cfg.AckPolicy = jetstream.AckExplicitPolicy
	case "none":
		cfg.AckPolicy = jetstream.AckNonePolicy
	case "all":
		cfg.AckPolicy = jetstream.AckAllPolicy
	default:
		cfg.AckPolicy = jetstream.AckExplicitPolicy
	}

	if req.AckWaitSeconds > 0 {
		cfg.AckWait = time.Duration(req.AckWaitSeconds) * time.Second
	}
	if req.MaxDeliver > 0 {
		cfg.MaxDeliver = req.MaxDeliver
	}
	if len(req.FilterSubjects) > 0 {
		cfg.FilterSubjects = req.FilterSubjects
	}

	info, err := a.jsService.CreateConsumer(r.Context(), client, streamName, cfg)
	if err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.sendJSON(w, info)
}

func (a *API) DeleteConsumer(w http.ResponseWriter, r *http.Request) {
	streamName := chi.URLParam(r, "stream")
	consumerName := chi.URLParam(r, "consumer")
	client := a.getClient(r)

	if err := a.jsService.DeleteConsumer(r.Context(), client, streamName, consumerName); err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	a.sendJSON(w, nil)
}

func (a *API) GetStreamMessagesSSE(w http.ResponseWriter, r *http.Request) {
	streamName := chi.URLParam(r, "stream")
	client := a.getClient(r)

	sinceSeqStr := r.URL.Query().Get("since_seq")
	var sinceSeq uint64
	if s, err := strconv.ParseUint(sinceSeqStr, 10, 64); err == nil {
		sinceSeq = s
	}

	stream, err := client.JS.Stream(r.Context(), streamName)
	if err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	info, err := stream.Info(r.Context())
	if err != nil {
		a.sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	currentSeq := sinceSeq
	if currentSeq == 0 {
		currentSeq = info.State.LastSeq
	}

	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	// Initial message to establish connection
	fmt.Fprintf(w, ": ok\n\n")
	flusher.Flush()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			info, err := stream.Info(r.Context())
			if err != nil {
				continue
			}

			if info.State.LastSeq > currentSeq {
				limit := uint64(100)
				scanStart := currentSeq + 1
				scanEnd := info.State.LastSeq
				if scanEnd-scanStart >= limit {
					scanStart = scanEnd - limit + 1
				}

				for seq := scanStart; seq <= scanEnd; seq++ {
					msg, err := stream.GetMsg(r.Context(), seq)
					if err != nil {
						continue
					}
					if msg == nil {
						continue
					}

					msgMap := map[string]interface{}{
						"subject":  msg.Subject,
						"data":     string(msg.Data),
						"sequence": msg.Sequence,
						"time":     msg.Time,
					}
					jsonData, err := json.Marshal(msgMap)
					if err != nil {
						continue
					}

					fmt.Fprintf(w, "data: %s\n\n", string(jsonData))
				}
				flusher.Flush()
				currentSeq = info.State.LastSeq
			}
		}
	}
}
