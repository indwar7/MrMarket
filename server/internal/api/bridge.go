package api

import (
	"context"
	"net/http"

	"github.com/unfluke/mrmarket-api/internal/store"
)

type bridgeKey struct{}

// bridgeAuth authenticates the MT5 bridge with the per-account token issued by PUT /api/broker.
func (s *Server) bridgeAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		uid, err := s.store.UserByBridgeToken(r.Context(), r.Header.Get("X-Bridge-Token"))
		if err != nil {
			writeErr(w, 401, "invalid bridge token")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), bridgeKey{}, uid)))
	})
}

// bridgeSync receives a snapshot from the terminal and broadcasts the fresh state to the browser.
func (s *Server) bridgeSync(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(bridgeKey{}).(int64)
	var in store.BridgeSync
	if err := decode(r, &in); err != nil {
		writeErr(w, 400, "bad json: "+err.Error())
		return
	}
	if err := s.store.ApplyBridgeSync(r.Context(), uid, in); err != nil {
		fail(w, err)
		return
	}
	positions, _ := s.store.Positions(r.Context(), uid)
	open := 0.0
	for _, p := range positions {
		open += p.PnL
	}
	s.hub.Send(uid, "sync", map[string]any{"equity": in.Equity, "balance": in.Balance, "open_pnl": open, "positions": positions})
	writeJSON(w, 200, map[string]any{"ok": true, "positions": len(positions)})
}
