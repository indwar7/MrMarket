package api

import (
	"net/http"
	"os"
	"time"

	"github.com/gorilla/websocket"

	"github.com/unfluke/mrmarket-api/app/auth"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 4096,
	CheckOrigin:     func(r *http.Request) bool { return true }, // CORS middleware already gates origins for the handshake
}

// websocket streams per-user events: strategy toggles, activity, bridge syncs.
func (s *Server) websocket(w http.ResponseWriter, r *http.Request) {
	uid := auth.UserID(r.Context())
	if os.Getenv("VERCEL") != "" {
		writeErr(w, http.StatusNotImplemented, "websockets are not available on Vercel functions; poll GET /api/algo instead")
		return
	}
	c, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	s.hub.Add(uid, c)
	defer s.hub.Remove(uid, c)
	s.hub.Send(uid, "hello", map[string]any{"user_id": uid})

	c.SetReadLimit(4096)
	_ = c.SetReadDeadline(time.Now().Add(90 * time.Second))
	c.SetPongHandler(func(string) error { return c.SetReadDeadline(time.Now().Add(90 * time.Second)) })
	done := make(chan struct{})
	go func() {
		t := time.NewTicker(30 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-done:
				return
			case <-t.C:
				if err := c.WriteControl(websocket.PingMessage, nil, time.Now().Add(5*time.Second)); err != nil {
					return
				}
			}
		}
	}()
	for {
		if _, _, err := c.ReadMessage(); err != nil {
			close(done)
			return
		}
	}
}
