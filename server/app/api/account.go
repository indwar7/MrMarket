package api

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/unfluke/mrmarket-api/app/auth"
	"github.com/unfluke/mrmarket-api/app/store"
)

type accountView struct {
	User          store.User           `json:"user"`
	Subscriptions []store.Subscription `json:"subscriptions"`
	Plan          *store.Subscription  `json:"plan"`
	Courses       []store.Enrollment   `json:"courses"`
	Live          []store.LiveSession  `json:"live"`
	Bookings      []store.Booking      `json:"bookings"`
	Orders        []store.Order        `json:"orders"`
	MonthlySpend  float64              `json:"monthly_spend"`
}

func (s *Server) account(w http.ResponseWriter, r *http.Request) {
	ctx, uid := r.Context(), auth.UserID(r.Context())
	u, err := s.store.UserByID(ctx, uid)
	if err != nil {
		fail(w, err)
		return
	}
	subs, err := s.store.Subscriptions(ctx, uid)
	if err != nil {
		fail(w, err)
		return
	}
	courses, err := s.store.Enrollments(ctx, uid)
	if err != nil {
		fail(w, err)
		return
	}
	live, err := s.store.Reservations(ctx, uid)
	if err != nil {
		fail(w, err)
		return
	}
	bookings, err := s.store.Bookings(ctx, uid)
	if err != nil {
		fail(w, err)
		return
	}
	orders, err := s.store.Orders(ctx, uid)
	if err != nil {
		fail(w, err)
		return
	}
	view := accountView{User: u, Subscriptions: []store.Subscription{}, Courses: courses, Live: live, Bookings: bookings, Orders: orders}
	for _, x := range subs {
		if x.Kind == "plan" {
			x := x
			view.Plan = &x
			view.MonthlySpend += float64(x.Price)
			continue
		}
		view.Subscriptions = append(view.Subscriptions, x)
		switch x.Plan {
		case "Quarterly":
			view.MonthlySpend += float64(x.Price) / 3
		case "Yearly":
			view.MonthlySpend += float64(x.Price) / 12
		default:
			view.MonthlySpend += float64(x.Price)
		}
	}
	view.MonthlySpend = math.Round(view.MonthlySpend*100) / 100
	writeJSON(w, 200, view)
}

type purchaseReq struct {
	Kind string `json:"kind"` // strategy | indicator | course | live | plan
	ID   string `json:"id"`
	Plan string `json:"plan,omitempty"` // Monthly | Quarterly | Yearly (strategies only)
}

// purchase charges the user (via the payments provider) and activates the item.
func (s *Server) purchase(w http.ResponseWriter, r *http.Request) {
	var in purchaseReq
	if err := decode(r, &in); err != nil {
		writeErr(w, 400, "bad json")
		return
	}
	ctx, uid := r.Context(), auth.UserID(r.Context())
	if in.Plan == "" {
		in.Plan = "Monthly"
	}
	charge := func(amount int, desc string) (string, bool) {
		if amount == 0 {
			return "", true
		}
		ref, err := s.pay.Charge(ctx, uid, amount, desc)
		if err != nil {
			writeErr(w, 402, "payment failed: "+err.Error())
			return "", false
		}
		return ref, true
	}
	switch in.Kind {
	case "strategy":
		t, err := s.store.Strategy(ctx, in.ID)
		if err != nil {
			fail(w, err)
			return
		}
		if has, _ := s.store.HasSubscription(ctx, uid, "strategy", t.ID); has {
			writeErr(w, 409, "already subscribed")
			return
		}
		price, period := t.Price, "/month"
		switch in.Plan {
		case "Quarterly":
			price, period = int(math.Round(float64(t.Price)*3*0.85)), "/quarter"
		case "Yearly":
			price, period = int(math.Round(float64(t.Price)*12*0.7)), "/year"
		case "Monthly":
		default:
			writeErr(w, 400, "plan must be Monthly, Quarterly or Yearly")
			return
		}
		ref, ok := charge(price, t.Title)
		if !ok {
			return
		}
		if err := s.store.Subscribe(ctx, uid, "strategy", t.ID, t.Title, in.Plan, price, period, ref); err != nil {
			fail(w, err)
			return
		}
		_, _ = s.store.AddActivity(ctx, uid, "SUB", fmt.Sprintf("Subscribed to %s and switched it on", t.Title))
		writeJSON(w, 201, map[string]any{"ok": true, "message": "Subscribed. Switch it on in the Algo dashboard."})
	case "indicator":
		i, err := s.store.Indicator(ctx, in.ID)
		if err != nil {
			fail(w, err)
			return
		}
		if has, _ := s.store.HasSubscription(ctx, uid, "indicator", i.ID); has {
			writeErr(w, 409, "already subscribed")
			return
		}
		ref, ok := charge(i.Price, i.Title)
		if !ok {
			return
		}
		period := "/month"
		if i.Price == 0 {
			period = ""
		}
		if err := s.store.Subscribe(ctx, uid, "indicator", i.ID, i.Title, "Monthly", i.Price, period, ref); err != nil {
			fail(w, err)
			return
		}
		writeJSON(w, 201, map[string]any{"ok": true, "message": "Subscribed. Restart MT5 to see it in Navigator."})
	case "course":
		c, err := s.store.Course(ctx, in.ID)
		if err != nil {
			fail(w, err)
			return
		}
		ref, ok := charge(c.Price, c.Title)
		if !ok {
			return
		}
		if err := s.store.Enroll(ctx, uid, c, ref); err != nil {
			fail(w, err)
			return
		}
		writeJSON(w, 201, map[string]any{"ok": true, "message": "Enrolled. Find it under My account → Courses."})
	case "live":
		id, _ := strconv.ParseInt(in.ID, 10, 64)
		l, err := s.store.LiveSession(ctx, id)
		if err != nil {
			fail(w, err)
			return
		}
		if l.Seats <= 0 {
			writeErr(w, 409, "no seats left")
			return
		}
		if err := s.store.Reserve(ctx, uid, l); err != nil {
			fail(w, err)
			return
		}
		writeJSON(w, 201, map[string]any{"ok": true, "message": "Seat reserved. Added to My account."})
	case "plan":
		p, err := s.store.Plan(ctx, in.ID)
		if err != nil {
			fail(w, err)
			return
		}
		if has, _ := s.store.HasSubscription(ctx, uid, "plan", p.ID); has {
			writeErr(w, 409, "already on this plan")
			return
		}
		ref, ok := charge(p.Price, p.Name)
		if !ok {
			return
		}
		if err := s.store.Subscribe(ctx, uid, "plan", p.ID, p.Name, "Monthly", p.Price, "/month", ref); err != nil {
			fail(w, err)
			return
		}
		writeJSON(w, 201, map[string]any{"ok": true, "message": "Plan active. See My account."})
	default:
		writeErr(w, 400, "kind must be strategy, indicator, course, live or plan")
	}
}

func (s *Server) cancelSubscription(w http.ResponseWriter, r *http.Request) {
	kind, id := chi.URLParam(r, "kind"), chi.URLParam(r, "id")
	if kind != "strategy" && kind != "indicator" && kind != "plan" {
		writeErr(w, 400, "kind must be strategy, indicator or plan")
		return
	}
	if err := s.store.CancelSubscription(r.Context(), auth.UserID(r.Context()), kind, id); err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "message": "Subscription cancelled"})
}

func (s *Server) setProgress(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Progress int `json:"progress"`
	}
	if err := decode(r, &in); err != nil || in.Progress < 0 || in.Progress > 100 {
		writeErr(w, 400, "progress must be 0-100")
		return
	}
	if err := s.store.SetProgress(r.Context(), auth.UserID(r.Context()), chi.URLParam(r, "id"), in.Progress); err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) bookings(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.Bookings(r.Context(), auth.UserID(r.Context()))
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, list)
}

func (s *Server) createBooking(w http.ResponseWriter, r *http.Request) {
	var in struct {
		MentorID    string `json:"mentor_id"`
		ScheduledAt string `json:"scheduled_at"`
		Note        string `json:"note"`
	}
	if err := decode(r, &in); err != nil || in.ScheduledAt == "" {
		writeErr(w, 400, "scheduled_at is required")
		return
	}
	b, err := s.store.CreateBooking(r.Context(), auth.UserID(r.Context()), in.MentorID, in.ScheduledAt, in.Note)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 201, b)
}

func (s *Server) tickets(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.Tickets(r.Context(), auth.UserID(r.Context()))
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, list)
}

func (s *Server) createTicket(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Subject string `json:"subject"`
		Body    string `json:"body"`
	}
	if err := decode(r, &in); err != nil || in.Subject == "" || in.Body == "" {
		writeErr(w, 400, "subject and body are required")
		return
	}
	t, err := s.store.CreateTicket(r.Context(), auth.UserID(r.Context()), in.Subject, in.Body)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 201, t)
}

func (s *Server) brokerAccount(w http.ResponseWriter, r *http.Request) {
	b, err := s.store.BrokerAccount(r.Context(), auth.UserID(r.Context()))
	if errors.Is(err, store.ErrNotFound) {
		writeJSON(w, 200, map[string]any{"linked": false})
		return
	}
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"linked": true, "account": b})
}

// linkBroker records the user's broker + MT5 login and returns the bridge token the EA uses to sync.
func (s *Server) linkBroker(w http.ResponseWriter, r *http.Request) {
	var in struct {
		BrokerID  string `json:"broker_id"`
		MT5Login  string `json:"mt5_login"`
		MT5Server string `json:"mt5_server"`
	}
	if err := decode(r, &in); err != nil || in.BrokerID == "" {
		writeErr(w, 400, "broker_id is required")
		return
	}
	ctx, uid := r.Context(), auth.UserID(r.Context())
	token := ""
	if existing, err := s.store.BrokerAccount(ctx, uid); err == nil {
		token = existing.BridgeToken
	} else {
		buf := make([]byte, 24)
		if _, err := rand.Read(buf); err != nil {
			fail(w, err)
			return
		}
		token = hex.EncodeToString(buf)
	}
	if err := s.store.UpsertBrokerAccount(ctx, uid, in.BrokerID, in.MT5Login, in.MT5Server, token); err != nil {
		fail(w, err)
		return
	}
	b, err := s.store.BrokerAccount(ctx, uid)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"linked": true, "account": b})
}
