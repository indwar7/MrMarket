package config

import (
	"os"
	"strings"
)

type Config struct {
	Addr        string
	DatabaseURL string // libsql://host?authToken=... for Turso, or a SQLite file path
	OnVercel    bool
	JWTSecret   string
	CORSOrigins []string
	Seed        bool
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func Load() Config {
	onVercel := os.Getenv("VERCEL") != ""
	defDB := "mrmarket.db"
	if onVercel {
		defDB = "/tmp/mrmarket.db" // only writable dir on Vercel; ephemeral per instance
	}
	dbURL := env("DATABASE_URL", "")
	if dbURL == "" {
		dbURL = env("DATABASE_PATH", defDB)
	}
	return Config{
		Addr:        ":" + env("PORT", "8080"),
		DatabaseURL: dbURL,
		OnVercel:    onVercel,
		JWTSecret:   env("JWT_SECRET", "dev-secret-change-me"),
		CORSOrigins: strings.Split(env("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173,https://mrmarket-portal.vercel.app"), ","),
		Seed:        env("SEED", "true") == "true",
	}
}
