package api

import (
	"archive/zip"
	"bytes"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/unfluke/mrmarket-api/app/auth"
	"github.com/unfluke/mrmarket-api/app/store"
)

// download delivers purchased items: Python scripts as a zip built from the embedded sources,
// and MT5 EAs/indicators from MT5_FILES_DIR (compiled .ex5 files kept outside the public repo).
func (s *Server) download(w http.ResponseWriter, r *http.Request) {
	kind, id := chi.URLParam(r, "kind"), chi.URLParam(r, "id")
	uid := auth.UserID(r.Context())
	if strings.ContainsAny(id, "/\\.") {
		writeErr(w, 400, "bad id")
		return
	}
	switch kind {
	case "script":
		x, err := s.store.Script(r.Context(), id)
		if err != nil {
			fail(w, err)
			return
		}
		if has, _ := s.store.HasSubscription(r.Context(), uid, "script", id); !has {
			writeErr(w, 403, "buy this script first")
			return
		}
		sub, err := fs.Sub(store.ScriptFiles, "seed/scripts/"+id)
		if err != nil {
			fail(w, err)
			return
		}
		var buf bytes.Buffer
		zw := zip.NewWriter(&buf)
		werr := fs.WalkDir(sub, ".", func(p string, d fs.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return err
			}
			b, err := fs.ReadFile(sub, p)
			if err != nil {
				return err
			}
			f, err := zw.Create(id + "/" + p)
			if err != nil {
				return err
			}
			_, err = f.Write(b)
			return err
		})
		if werr != nil || zw.Close() != nil {
			writeErr(w, 500, "could not build archive")
			return
		}
		w.Header().Set("Content-Type", "application/zip")
		w.Header().Set("Content-Disposition", `attachment; filename="`+id+`-v`+x.Version+`.zip"`)
		_, _ = w.Write(buf.Bytes())
	case "strategy", "indicator":
		if has, _ := s.store.HasSubscription(r.Context(), uid, kind, id); !has {
			writeErr(w, 403, "subscribe first")
			return
		}
		dir := os.Getenv("MT5_FILES_DIR")
		if dir == "" {
			writeErr(w, 503, "File delivery is being set up. Your mentor will send the MT5 file by email in the meantime.")
			return
		}
		path := filepath.Join(dir, id+".ex5")
		if _, err := os.Stat(path); err != nil {
			writeErr(w, 503, "This file is not uploaded yet. Your mentor will send it by email.")
			return
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Disposition", `attachment; filename="`+id+`.ex5"`)
		http.ServeFile(w, r, path)
	default:
		writeErr(w, 400, "kind must be script, strategy or indicator")
	}
}
