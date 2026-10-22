package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/unfluke/mrmarket-api/app/api"
	"github.com/unfluke/mrmarket-api/app/auth"
	"github.com/unfluke/mrmarket-api/app/config"
	"github.com/unfluke/mrmarket-api/app/payments"
	"github.com/unfluke/mrmarket-api/app/store"
	"github.com/unfluke/mrmarket-api/app/ws"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stdout, nil))
	cfg := config.Load()

	st, err := store.Open(cfg.DatabaseURL)
	if err != nil {
		log.Error("open db", "err", err)
		os.Exit(1)
	}
	defer st.Close()

	if cfg.Seed {
		hash, _ := auth.HashPassword("demo1234")
		if err := st.SeedCatalog(context.Background()); err != nil {
			log.Error("seed catalog", "err", err)
			os.Exit(1)
		}
		if err := st.SeedDemo(context.Background(), hash); err != nil {
			log.Error("seed", "err", err)
			os.Exit(1)
		}
	}

	srv := api.New(st, auth.New(cfg.JWTSecret), payments.Demo{}, ws.NewHub(), log)
	httpSrv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           srv.Router(cfg.CORSOrigins),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Info("mrmarket-api listening", "addr", cfg.Addr, "db", cfg.DatabaseURL)
		if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("serve", "err", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = httpSrv.Shutdown(ctx)
}
