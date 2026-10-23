package api

import (
	"encoding/json"
	"math"
	"net/http"
	"sort"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/unfluke/mrmarket-api/app/auth"
	"github.com/unfluke/mrmarket-api/app/curve"
	"github.com/unfluke/mrmarket-api/app/store"
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
	risk, cat, q, sortBy := r.URL.Query().Get("risk"), r.URL.Query().Get("category"), lower(r.URL.Query().Get("q")), r.URL.Query().Get("sort")
	out := list[:0]
	for _, t := range list {
		if (risk == "" || risk == "All" || strings.EqualFold(t.Risk, risk)) && (cat == "" || cat == "All" || strings.EqualFold(t.Category, cat)) && strings.Contains(strings.ToLower(t.Title+" "+t.Description), q) {
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
	HasTrackRecord bool             `json:"has_track_record"`
	Equity         []float64        `json:"equity_curve,omitempty"`
	Monthly        []monthlyReturn  `json:"monthly_returns,omitempty"`
	Spark          []float64        `json:"spark,omitempty"`
	Plans          map[string]int   `json:"plans"`
	Rules          []string         `json:"rules"`
	CommonInputs   json.RawMessage  `json:"common_inputs"`
	PairIndicator  *store.Indicator `json:"pair_indicator"`
	Included       []string         `json:"included"`
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
	d := strategyDetail{
		Strategy:       t,
		HasTrackRecord: t.Trades > 0,
		Plans:          map[string]int{"Monthly": t.Price, "Quarterly": int(math.Round(float64(t.Price) * 3 * 0.85)), "Yearly": int(math.Round(float64(t.Price) * 12 * 0.7))},
		Rules:          []string{"ATR-sized stop loss on every trade", "Risk per trade as % of equity (default 1%)", "Break-even, trailing stop and partial close built in", "Spread, session and higher-timeframe filters", "Works on any MT5 broker, hedging or netting"},
		CommonInputs:   store.CommonInputs,
		Included:       []string{"Compiled Expert Advisor (.ex5) for MetaTrader 5", "On-chart signal indicator embedded in the EA", "Default settings file and install guide", "Updates for the life of the subscription"},
	}
	if d.HasTrackRecord {
		seed := uint32(t.Seed)
		eq := curve.Curve(seed, 120, t.Return/120, 2.2)
		for i := range eq {
			eq[i] = math.Round(eq[i]*100*100) / 100
		}
		rnd := curve.RNG(seed + 9)
		for _, m := range months {
			d.Monthly = append(d.Monthly, monthlyReturn{m, math.Round((rnd()-0.25)*t.Return/4*10) / 10})
		}
		d.Equity, d.Spark = eq, curve.Curve(seed, 60, t.Return/60, 2.5)
	}
	if t.PairID != "" {
		if ind, err := s.store.Indicator(r.Context(), t.PairID); err == nil {
			d.PairIndicator = &ind
		}
	}
	writeJSON(w, 200, d)
}

type indicatorDetail struct {
	store.Indicator
	PairStrategy *store.Strategy `json:"pair_strategy"`
	Included     []string        `json:"included"`
}

func (s *Server) indicator(w http.ResponseWriter, r *http.Request) {
	i, err := s.store.Indicator(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		fail(w, err)
		return
	}
	d := indicatorDetail{Indicator: i, Included: []string{"Compiled indicator (.ex5) for MetaTrader 5", "Same inputs as the matching EA, so chart and robot never disagree", "Install guide for Windows and macOS"}}
	if i.PairID != "" {
		if t, err := s.store.Strategy(r.Context(), i.PairID); err == nil {
			d.PairStrategy = &t
		}
	}
	writeJSON(w, 200, d)
}

type courseDetail struct {
	store.Course
	Lessons   []store.Lesson `json:"lessons"`
	Enrolled  bool           `json:"enrolled"`
	Progress  int            `json:"progress"`
	Completed []int64        `json:"completed"`
}

// course returns the lesson list; video URLs are included only for free previews or enrolled users.
func (s *Server) course(w http.ResponseWriter, r *http.Request) {
	c, err := s.store.Course(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		fail(w, err)
		return
	}
	lessons, err := s.store.Lessons(r.Context(), c.ID)
	if err != nil {
		fail(w, err)
		return
	}
	d := courseDetail{Course: c, Lessons: lessons, Completed: []int64{}}
	uid, _ := s.auth.Parse(auth.TokenFromRequest(r))
	if uid != 0 {
		for _, e := range mustEnrollments(s, r, uid) {
			if e.Course.ID == c.ID {
				d.Enrolled, d.Progress = true, e.Progress
			}
		}
		if d.Enrolled {
			d.Completed, _ = s.store.CompletedLessons(r.Context(), uid, c.ID)
		}
	}
	done := map[int64]bool{}
	for _, id := range d.Completed {
		done[id] = true
	}
	for i := range d.Lessons {
		l := &d.Lessons[i]
		l.Done = done[l.ID]
		l.Locked = !d.Enrolled && !l.FreePreview
		if l.Locked {
			l.VideoURL, l.ResourceURL = "", ""
		}
	}
	writeJSON(w, 200, d)
}

func mustEnrollments(s *Server, r *http.Request, uid int64) []store.Enrollment {
	list, _ := s.store.Enrollments(r.Context(), uid)
	return list
}

func (s *Server) scripts(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.Scripts(r.Context())
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, list)
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
