package handlers

import (
	"log"
	"net/http"

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

	sub, err := client.Conn.Subscribe(subject, func(msg *nats.Msg) {
		// Send message to websocket
		err := ws.WriteJSON(map[string]interface{}{
			"subject": msg.Subject,
			"data":    string(msg.Data),
			"headers": msg.Header,
		})
		if err != nil {
			log.Printf("failed to write to websocket: %v", err)
		}
	})
	if err != nil {
		ws.WriteJSON(map[string]string{"error": err.Error()})
		return
	}
	defer sub.Unsubscribe()

	// Keep connection alive and wait for close
	for {
		if _, _, err := ws.ReadMessage(); err != nil {
			break
		}
	}
}
