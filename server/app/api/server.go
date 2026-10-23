// Package api wires HTTP routes to the store.
package api

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/unfluke/mrmarket-api/app/auth"
	"github.com/unfluke/mrmarket-api/app/payments"
	"github.com/unfluke/mrmarket-api/app/store"
	"github.com/unfluke/mrmarket-api/app/ws"
)

type Server struct {
	store    *store.Store
	auth     *auth.Service
	pay      payments.Provider
	hub      *ws.Hub
	log      *slog.Logger
	tokenTTL time.Duration
	adminKey string
}

func New(st *store.Store, au *auth.Service, pay payments.Provider, hub *ws.Hub, log *slog.Logger, adminKey string) *Server {
	return &Server{store: st, auth: au, pay: pay, hub: hub, log: log, tokenTTL: 30 * 24 * time.Hour, adminKey: adminKey}
}

func (s *Server) Router(origins []string) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.RealIP, middleware.Recoverer, middleware.Timeout(30*time.Second))
	r.Use(requestLogger(s.log))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   origins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type", "X-Bridge-Token", "X-Admin-Key"},
		ExposedHeaders:   []string{"Content-Disposition"},
		AllowCredentials: true,
		MaxAge:           600,
	}))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) { writeJSON(w, 200, map[string]string{"status": "ok"}) })

	r.Route("/api", func(r chi.Router) {
		// No self-registration: logins are created by the admin after payment.
		r.Post("/auth/login", s.login)
		r.Post("/requests", s.createRequest)

		r.Route("/admin", func(r chi.Router) {
			r.Use(s.adminAuth)
			r.Get("/ping", s.adminPing)
			r.Get("/leads", s.adminLeads)
			r.Put("/leads/{id}", s.adminLeadStatus)
			r.Get("/users", s.adminUsers)
			r.Post("/users", s.adminCreateUser)
			r.Post("/grant", s.adminGrant)
			r.Delete("/grant", s.adminGrant)
		})

		r.Route("/catalog", func(r chi.Router) {
			r.Get("/courses", s.courses)
			r.Get("/courses/{id}", s.course)
			r.Get("/live", s.live)
			r.Get("/indicators", s.indicators)
			r.Get("/indicators/{id}", s.indicator)
			r.Get("/strategies", s.strategies)
			r.Get("/strategies/{id}", s.strategy)
			r.Get("/scripts", s.scripts)
			r.Get("/brokers", s.brokers)
			r.Get("/plans", s.plans)
			r.Get("/mentors", s.mentors)
		})

		// MT5 bridge pushes account state with its own token.
		r.With(s.bridgeAuth).Post("/bridge/sync", s.bridgeSync)

		r.Group(func(r chi.Router) {
			r.Use(s.auth.Middleware)
			r.Get("/auth/me", s.me)
			r.Get("/account", s.account)
			r.Post("/purchase", s.purchase)
			r.Delete("/subscriptions/{kind}/{id}", s.cancelSubscription)
			r.Put("/courses/{id}/progress", s.setProgress)
			r.Post("/courses/{id}/lessons/{lid}/complete", s.completeLesson)
			r.Post("/waitlist", s.waitlist)
			r.Get("/downloads/{kind}/{id}", s.download)
			r.Get("/bookings", s.bookings)
			r.Post("/bookings", s.createBooking)
			r.Get("/tickets", s.tickets)
			r.Post("/tickets", s.createTicket)
			r.Get("/broker", s.brokerAccount)
			r.Put("/broker", s.linkBroker)
			r.Get("/algo", s.algo)
			r.Put("/algo/strategies/{id}", s.setRunning)
			r.Post("/algo/pause-all", s.pauseAll)
			r.Post("/algo/resume-all", s.resumeAll)
			r.Get("/ws", s.websocket)
		})
	})
	return r
}

// ---- helpers ----

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

func decode(r *http.Request, v any) error {
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20))
	dec.DisallowUnknownFields()
	return dec.Decode(v)
}

func fail(w http.ResponseWriter, err error) {
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, 404, "not found")
		return
	}
	writeErr(w, 500, "internal error: "+err.Error())
}

func requestLogger(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(ww, r)
			log.Info("http", "method", r.Method, "path", r.URL.Path, "status", ww.Status(), "ms", time.Since(start).Milliseconds())
		})
	}
}

func lower(s string) string { return strings.ToLower(strings.TrimSpace(s)) }
