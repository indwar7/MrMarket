package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/unfluke/mrmarket-api/internal/auth"
	"github.com/unfluke/mrmarket-api/internal/store"
)

type credentials struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name,omitempty"`
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var in credentials
	if err := decode(r, &in); err != nil {
		writeErr(w, 400, "bad json")
		return
	}
	in.Email = lower(in.Email)
	if !strings.Contains(in.Email, "@") || len(in.Password) < 8 {
		writeErr(w, 400, "valid email and a password of 8+ characters are required")
		return
	}
	if in.Name == "" {
		in.Name = strings.Split(in.Email, "@")[0]
	}
	if _, err := s.store.UserByEmail(r.Context(), in.Email); err == nil {
		writeErr(w, 409, "email already registered")
		return
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		fail(w, err)
		return
	}
	u, err := s.store.CreateUser(r.Context(), in.Email, hash, in.Name)
	if err != nil {
		fail(w, err)
		return
	}
	s.issue(w, u, 201)
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var in credentials
	if err := decode(r, &in); err != nil {
		writeErr(w, 400, "bad json")
		return
	}
	u, err := s.store.UserByEmail(r.Context(), lower(in.Email))
	if errors.Is(err, store.ErrNotFound) || (err == nil && !auth.CheckPassword(u.Password, in.Password)) {
		writeErr(w, 401, "email or password is incorrect")
		return
	}
	if err != nil {
		fail(w, err)
		return
	}
	s.issue(w, u, 200)
}

func (s *Server) issue(w http.ResponseWriter, u store.User, code int) {
	tok, err := s.auth.Issue(u.ID, u.Email, s.tokenTTL)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, code, map[string]any{"token": tok, "user": u})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	u, err := s.store.UserByID(r.Context(), auth.UserID(r.Context()))
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, u)
}
