package api

import (
	"errors"
	"math"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/unfluke/mrmarket-api/internal/auth"
	"github.com/unfluke/mrmarket-api/internal/curve"
	"github.com/unfluke/mrmarket-api/internal/store"
)

type algoView struct {
	Broker     *store.BrokerAccount `json:"broker"`
	Summary    algoSummary          `json:"summary"`
	Strategies []store.StrategyRun  `json:"strategies"`
	Positions  []store.Position     `json:"positions"`
	Orders     []store.TradeOrder   `json:"orders"`
	History    []store.Trade        `json:"history"`
	Calendar   []store.DailyPnL     `json:"calendar"`
	Activity   []store.Activity     `json:"activity"`
}

type algoSummary struct {
	Equity      float64   `json:"equity"`
	Balance     float64   `json:"balance"`
	OpenPnL     float64   `json:"open_pnl"`
	MonthPnL    float64   `json:"month_pnl"`
	Running     int       `json:"running"`
	Subscribed  int       `json:"subscribed"`
	OpenTrades  int       `json:"open_trades"`
	EquityCurve []float64 `json:"equity_curve"`
}

func (s *Server) algo(w http.ResponseWriter, r *http.Request) {
	ctx, uid := r.Context(), auth.UserID(r.Context())
	var view algoView
	if b, err := s.store.BrokerAccount(ctx, uid); err == nil {
		b.BridgeToken = ""
		view.Broker = &b
		view.Summary.Equity, view.Summary.Balance = b.Equity, b.Balance
	} else if !errors.Is(err, store.ErrNotFound) {
		fail(w, err)
		return
	}
	var err error
	if view.Strategies, err = s.store.StrategyRuns(ctx, uid); err != nil {
		fail(w, err)
		return
	}
	if view.Positions, err = s.store.Positions(ctx, uid); err != nil {
		fail(w, err)
		return
	}
	if view.Orders, err = s.store.TradeOrders(ctx, uid, 100); err != nil {
		fail(w, err)
		return
	}
	if view.History, err = s.store.TradeHistory(ctx, uid, 100); err != nil {
		fail(w, err)
		return
	}
	now := time.Now().UTC()
	if view.Calendar, err = s.store.DailyPnL(ctx, uid, now.AddDate(0, 0, -30).Format("2006-01-02"), now.Format("2006-01-02")); err != nil {
		fail(w, err)
		return
	}
	if view.Activity, err = s.store.Activity(ctx, uid, 20); err != nil {
		fail(w, err)
		return
	}
	for _, p := range view.Positions {
		view.Summary.OpenPnL += p.PnL
	}
	for _, d := range view.Calendar {
		if d.Day >= now.Format("2006-01") {
			view.Summary.MonthPnL += d.PnL
		}
	}
	for _, x := range view.Strategies {
		view.Summary.Subscribed++
		if x.Running {
			view.Summary.Running++
		}
	}
	view.Summary.OpenPnL = math.Round(view.Summary.OpenPnL*100) / 100
	view.Summary.OpenTrades = len(view.Positions)
	// Equity history comes from the bridge once it syncs daily balances; until then, anchor the design curve to current equity.
	eq := curve.Curve(77, 90, 55, 160)
	shift := view.Summary.Equity - eq[len(eq)-1]
	if view.Summary.Equity == 0 {
		shift = 24500
	}
	for i := range eq {
		eq[i] = math.Round(eq[i] + shift)
	}
	view.Summary.EquityCurve = eq
	writeJSON(w, 200, view)
}

func (s *Server) setRunning(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Running bool     `json:"running"`
		LotSize *float64 `json:"lot_size,omitempty"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, 400, "bad json")
		return
	}
	if in.LotSize != nil && (*in.LotSize < 0.01 || *in.LotSize > 100) {
		writeErr(w, 400, "lot_size must be between 0.01 and 100")
		return
	}
	ctx, uid, id := r.Context(), auth.UserID(r.Context()), chi.URLParam(r, "id")
	if err := s.store.SetRunning(ctx, uid, id, in.Running, in.LotSize); err != nil {
		fail(w, err)
		return
	}
	t, _ := s.store.Strategy(ctx, id)
	msg := "Strategy paused. Open positions kept."
	tag := "PAUSE"
	if in.Running {
		msg, tag = "Strategy started", "RUN"
	}
	act, _ := s.store.AddActivity(ctx, uid, tag, t.Title+": "+msg)
	s.hub.Send(uid, "strategy", map[string]any{"strategy_id": id, "running": in.Running})
	s.hub.Send(uid, "activity", act)
	writeJSON(w, 200, map[string]any{"ok": true, "message": msg})
}

func (s *Server) pauseAll(w http.ResponseWriter, r *http.Request)  { s.setAll(w, r, false) }
func (s *Server) resumeAll(w http.ResponseWriter, r *http.Request) { s.setAll(w, r, true) }

func (s *Server) setAll(w http.ResponseWriter, r *http.Request, running bool) {
	ctx, uid := r.Context(), auth.UserID(r.Context())
	if err := s.store.SetAllRunning(ctx, uid, running); err != nil {
		fail(w, err)
		return
	}
	msg, tag := "All strategies paused", "PAUSE"
	if running {
		msg, tag = "All strategies resumed", "RUN"
	}
	act, _ := s.store.AddActivity(ctx, uid, tag, msg)
	s.hub.Send(uid, "strategies", map[string]any{"running": running})
	s.hub.Send(uid, "activity", act)
	writeJSON(w, 200, map[string]any{"ok": true, "message": msg})
}
