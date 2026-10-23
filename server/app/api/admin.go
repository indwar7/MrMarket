package api

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/unfluke/mrmarket-api/app/auth"
	"github.com/unfluke/mrmarket-api/app/store"
)

// adminAuth gates /api/admin with a shared key (ADMIN_KEY). Empty key disables the admin API.
func (s *Server) adminAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.adminKey == "" {
			writeErr(w, 503, "admin API is not configured (set ADMIN_KEY)")
			return
		}
		if r.Header.Get("X-Admin-Key") != s.adminKey {
			writeErr(w, 401, "invalid admin key")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) adminPing(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, 200, map[string]any{"ok": true})
}

// createRequest is the public "request access" form: a lead the admin turns into a login after payment.
func (s *Server) createRequest(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name  string `json:"name"`
		Email string `json:"email"`
		Phone string `json:"phone"`
		Kind  string `json:"kind"`
		ID    string `json:"id"`
		Plan  string `json:"plan"`
		Note  string `json:"note"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, 400, "bad json")
		return
	}
	in.Email = lower(in.Email)
	if in.Name == "" || !strings.Contains(in.Email, "@") || in.Kind == "" || in.ID == "" {
		writeErr(w, 400, "name, email, kind and id are required")
		return
	}
	lead := store.Lead{Name: in.Name, Email: in.Email, Phone: in.Phone, Kind: in.Kind, ItemID: in.ID, Plan: in.Plan, Note: in.Note, Item: s.itemTitle(r, in.Kind, in.ID)}
	if uid, err := s.auth.Parse(auth.TokenFromRequest(r)); err == nil && uid != 0 {
		lead.UserID = &uid
	}
	l, err := s.store.CreateLead(r.Context(), lead)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 201, map[string]any{"ok": true, "id": l.ID, "message": "Request received. We will send payment details and your login by email or WhatsApp."})
}

func (s *Server) itemTitle(r *http.Request, kind, id string) string {
	ctx := r.Context()
	switch kind {
	case "strategy":
		if x, err := s.store.Strategy(ctx, id); err == nil {
			return x.Title
		}
	case "indicator":
		if x, err := s.store.Indicator(ctx, id); err == nil {
			return x.Title
		}
	case "course":
		if x, err := s.store.Course(ctx, id); err == nil {
			return x.Title
		}
	case "script":
		if x, err := s.store.Script(ctx, id); err == nil {
			return x.Title
		}
	case "plan":
		if x, err := s.store.Plan(ctx, id); err == nil {
			return x.Name
		}
	case "live":
		if n, err := strconv.ParseInt(id, 10, 64); err == nil {
			if x, err := s.store.LiveSession(ctx, n); err == nil {
				return x.Title
			}
		}
	}
	return id
}

func (s *Server) adminLeads(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.Leads(r.Context())
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, list)
}

func (s *Server) adminLeadStatus(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Status string `json:"status"`
	}
	if err := decode(r, &in); err != nil || in.Status == "" {
		writeErr(w, 400, "status is required")
		return
	}
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err := s.store.SetLeadStatus(r.Context(), id, in.Status); err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) adminUsers(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.Users(r.Context())
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, list)
}

// adminCreateUser creates a login (or resets the password of an existing one).
func (s *Server) adminCreateUser(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Name     string `json:"name"`
		Password string `json:"password"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, 400, "bad json")
		return
	}
	in.Email = lower(in.Email)
	if !strings.Contains(in.Email, "@") || len(in.Password) < 8 {
		writeErr(w, 400, "valid email and a password of 8+ characters are required")
		return
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		fail(w, err)
		return
	}
	u, err := s.store.UserByEmail(r.Context(), in.Email)
	switch {
	case err == nil:
		if err := s.store.SetPassword(r.Context(), u.ID, hash); err != nil {
			fail(w, err)
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true, "user": u, "message": "password updated"})
	case errors.Is(err, store.ErrNotFound):
		if in.Name == "" {
			in.Name = strings.Split(in.Email, "@")[0]
		}
		u, err = s.store.CreateUser(r.Context(), in.Email, hash, in.Name)
		if err != nil {
			fail(w, err)
			return
		}
		writeJSON(w, 201, map[string]any{"ok": true, "user": u, "message": "user created"})
	default:
		fail(w, err)
	}
}

func (s *Server) adminGrant(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email string `json:"email"`
		Kind  string `json:"kind"`
		ID    string `json:"id"`
		Plan  string `json:"plan"`
	}
	if err := decode(r, &in); err != nil || in.Email == "" || in.Kind == "" || in.ID == "" {
		writeErr(w, 400, "email, kind and id are required")
		return
	}
	u, err := s.store.UserByEmail(r.Context(), lower(in.Email))
	if err != nil {
		fail(w, err)
		return
	}
	if r.Method == http.MethodDelete {
		if err := s.store.Revoke(r.Context(), u.ID, in.Kind, in.ID); err != nil {
			fail(w, err)
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true, "message": "revoked"})
		return
	}
	if err := s.store.Grant(r.Context(), u.ID, in.Kind, in.ID, s.itemTitle(r, in.Kind, in.ID), in.Plan); err != nil {
		fail(w, err)
		return
	}
	if in.Kind == "strategy" {
		_, _ = s.store.AddActivity(r.Context(), u.ID, "SUB", s.itemTitle(r, in.Kind, in.ID)+" assigned to your account")
	}
	writeJSON(w, 200, map[string]any{"ok": true, "message": "assigned"})
}
