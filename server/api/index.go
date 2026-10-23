// Package handler is the Vercel entrypoint. Every route is rewritten here (see vercel.json)
// and served by the same chi router the binary uses.
package handler

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"sync"

	"github.com/unfluke/mrmarket-api/app/api"
	"github.com/unfluke/mrmarket-api/app/auth"
	"github.com/unfluke/mrmarket-api/app/config"
	"github.com/unfluke/mrmarket-api/app/payments"
	"github.com/unfluke/mrmarket-api/app/store"
	"github.com/unfluke/mrmarket-api/app/ws"
)

var (
	once    sync.Once
	router  http.Handler
	initErr error
)

func setup() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg := config.Load()
	st, err := store.Open(cfg.DatabaseURL)
	if err != nil {
		initErr = err
		return
	}
	if cfg.Seed {
		hash, _ := auth.HashPassword("demo1234")
		if err := st.SeedCatalog(context.Background()); err != nil {
			initErr = err
			return
		}
		if err := st.SeedDemo(context.Background(), hash); err != nil {
			initErr = err
			return
		}
	}
	router = api.New(st, auth.New(cfg.JWTSecret), payments.Demo{}, ws.NewHub(), log, cfg.AdminKey).Router(cfg.CORSOrigins)
}

func Handler(w http.ResponseWriter, r *http.Request) {
	once.Do(setup)
	if initErr != nil {
		http.Error(w, `{"error":"startup: `+initErr.Error()+`"}`, http.StatusInternalServerError)
		return
	}
	router.ServeHTTP(w, r)
}
