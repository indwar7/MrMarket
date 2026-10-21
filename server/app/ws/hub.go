// Package ws fans server events out to each user's open websocket connections.
package ws

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Event struct {
	Type string `json:"type"`
	Data any    `json:"data"`
	At   string `json:"at"`
}

type Hub struct {
	mu    sync.RWMutex
	conns map[int64]map[*websocket.Conn]struct{}
}

func NewHub() *Hub { return &Hub{conns: map[int64]map[*websocket.Conn]struct{}{}} }

func (h *Hub) Add(uid int64, c *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.conns[uid] == nil {
		h.conns[uid] = map[*websocket.Conn]struct{}{}
	}
	h.conns[uid][c] = struct{}{}
}

func (h *Hub) Remove(uid int64, c *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.conns[uid], c)
	if len(h.conns[uid]) == 0 {
		delete(h.conns, uid)
	}
	_ = c.Close()
}

func (h *Hub) Send(uid int64, typ string, data any) {
	b, err := json.Marshal(Event{Type: typ, Data: data, At: time.Now().UTC().Format(time.RFC3339)})
	if err != nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.conns[uid] {
		_ = c.SetWriteDeadline(time.Now().Add(5 * time.Second))
		_ = c.WriteMessage(websocket.TextMessage, b)
	}
}
