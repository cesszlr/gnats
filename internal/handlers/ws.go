package handlers

import (
	"log"
	"net/http"
	"strconv"
	"sync"

	internalnats "gnats/internal/nats"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
	"github.com/nats-io/nats.go"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // For development
	},
}

type WSHandler struct {
	manager *internalnats.Manager
}

func NewWSHandler(manager *internalnats.Manager) *WSHandler {
	return &WSHandler{
		manager: manager,
	}
}

func (h *WSHandler) Subscribe(w http.ResponseWriter, r *http.Request) {
	connID := chi.URLParam(r, "id")
	subject := r.URL.Query().Get("subject")
	queue := r.URL.Query().Get("queue")
	maxMsgsStr := r.URL.Query().Get("max_msgs")
	pendingLimitStr := r.URL.Query().Get("pending_limit")

	if subject == "" {
		http.Error(w, "subject is required", http.StatusBadRequest)
		return
	}

	client, err := h.manager.EnsureClient(connID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("failed to upgrade to websocket: %v", err)
		return
	}
	defer ws.Close()

	// Parse max_msgs and pending_limit
	var maxMsgs int
	if maxMsgsStr != "" {
		if val, err := strconv.Atoi(maxMsgsStr); err == nil {
			maxMsgs = val
		}
	}

	var pendingLimit int
	if pendingLimitStr != "" {
		if val, err := strconv.Atoi(pendingLimitStr); err == nil {
			pendingLimit = val
		}
	}

	// Create channel to notify websocket loop when max messages are received
	doneChan := make(chan struct{})
	var count int
	var mu sync.Mutex

	msgHandler := func(msg *nats.Msg) {
		err := ws.WriteJSON(map[string]interface{}{
			"subject": msg.Subject,
			"reply":   msg.Reply,
			"data":    string(msg.Data),
			"headers": msg.Header,
		})
		if err != nil {
			log.Printf("failed to write to websocket: %v", err)
			return
		}

		if maxMsgs > 0 {
			mu.Lock()
			count++
			if count >= maxMsgs {
				select {
				case <-doneChan:
				default:
					close(doneChan)
				}
			}
			mu.Unlock()
		}
	}

	var sub *nats.Subscription
	if queue != "" {
		sub, err = client.Conn.QueueSubscribe(subject, queue, msgHandler)
	} else {
		sub, err = client.Conn.Subscribe(subject, msgHandler)
	}

	if err != nil {
		ws.WriteJSON(map[string]string{"error": err.Error()})
		return
	}
	defer sub.Unsubscribe()

	// Apply MaxMessages at NATS level if set
	if maxMsgs > 0 {
		sub.AutoUnsubscribe(maxMsgs)
	}

	// Apply Pending limits at NATS level if set
	if pendingLimit > 0 {
		sub.SetPendingLimits(pendingLimit, -1)
	}

	// Keep connection alive and wait for close, or exit when max messages received
	readDone := make(chan error, 1)
	go func() {
		for {
			if _, _, err := ws.ReadMessage(); err != nil {
				readDone <- err
				return
			}
		}
	}()

	select {
	case <-readDone:
	case <-doneChan:
		ws.WriteJSON(map[string]interface{}{
			"info": "auto_unsubscribed",
		})
	}
}
