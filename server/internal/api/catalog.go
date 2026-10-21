package api

import (
	"math"
	"net/http"
	"sort"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/unfluke/mrmarket-api/internal/curve"
	"github.com/unfluke/mrmarket-api/internal/store"
)

func (s *Server) courses(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.Courses(r.Context())
	if err != nil {
		fail(w, err)
		return
	}
	level, q := r.URL.Query().Get("level"), lower(r.URL.Query().Get("q"))
	out := list[:0]
	for _, c := range list {
		if (level == "" || level == "All" || c.Level == level) && strings.Contains(strings.ToLower(c.Title), q) {
			out = append(out, c)
		}
	}
	writeJSON(w, 200, out)
}

func (s *Server) live(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.LiveSessions(r.Context())
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, list)
}

func (s *Server) indicators(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.Indicators(r.Context())
	if err != nil {
		fail(w, err)
		return
	}
	cat, q := r.URL.Query().Get("category"), lower(r.URL.Query().Get("q"))
	out := list[:0]
	for _, i := range list {
		if (cat == "" || cat == "All" || i.Category == cat) && strings.Contains(strings.ToLower(i.Title), q) {
			out = append(out, i)
		}
	}
	writeJSON(w, 200, out)
}

func (s *Server) strategies(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.Strategies(r.Context())
	if err != nil {
		fail(w, err)
		return
	}
	risk, sortBy := r.URL.Query().Get("risk"), r.URL.Query().Get("sort")
	out := list[:0]
	for _, t := range list {
		if risk == "" || risk == "All" || strings.EqualFold(t.Risk, risk) {
			out = append(out, t)
		}
	}
	switch sortBy {
	case "dd", "drawdown":
		sort.SliceStable(out, func(i, j int) bool { return out[i].Drawdown < out[j].Drawdown })
	case "subs", "popular":
		sort.SliceStable(out, func(i, j int) bool { return out[i].Subs > out[j].Subs })
	case "ret", "return":
		sort.SliceStable(out, func(i, j int) bool { return out[i].Return > out[j].Return })
	}
	writeJSON(w, 200, out)
}

type strategyDetail struct {
	store.Strategy
	Equity  []float64       `json:"equity_curve"`
	Monthly []monthlyReturn `json:"monthly_returns"`
	Spark   []float64       `json:"spark"`
	Plans   map[string]int  `json:"plans"`
	Rules   []string        `json:"rules"`
}

type monthlyReturn struct {
	Month string  `json:"month"`
	Pct   float64 `json:"pct"`
}

var months = []string{"Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"}

func (s *Server) strategy(w http.ResponseWriter, r *http.Request) {
	t, err := s.store.Strategy(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		fail(w, err)
		return
	}
	seed := uint32(t.Seed)
	eq := curve.Curve(seed, 120, t.Return/120, 2.2)
	for i := range eq {
		eq[i] = math.Round(eq[i]*100*100) / 100
	}
	rnd := curve.RNG(seed + 9)
	monthly := make([]monthlyReturn, 0, 12)
	for _, m := range months {
		monthly = append(monthly, monthlyReturn{m, math.Round((rnd()-0.25)*t.Return/4*10) / 10})
	}
	writeJSON(w, 200, strategyDetail{
		Strategy: t,
		Equity:   eq,
		Monthly:  monthly,
		Spark:    curve.Curve(seed, 60, t.Return/60, 2.5),
		Plans:    map[string]int{"Monthly": t.Price, "Quarterly": int(math.Round(float64(t.Price) * 3 * 0.85)), "Yearly": int(math.Round(float64(t.Price) * 12 * 0.7))},
		Rules:    []string{"Stop loss on every trade", "Max 1% account risk per trade by default", "Pauses during high-impact news", "Works on any MT5 broker"},
	})
}

func (s *Server) brokers(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.Brokers(r.Context())
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, list)
}

func (s *Server) plans(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.Plans(r.Context())
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, list)
}

func (s *Server) mentors(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.Mentors(r.Context())
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, list)
}
