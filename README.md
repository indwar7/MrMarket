# MrMarket

Trading portal: learning, MT5 indicators and strategies, broker setup, algo dashboard, mentoring.

| Folder | What | Deploy |
|---|---|---|
| `web/` | Static frontend (vanilla JS, hash router) | Vercel project `mrmarket-portal` → https://mrmarket-portal.vercel.app |
| `server/` | Go API (chi, SQLite/Turso, JWT) | Vercel project `mrmarket-api` (Go serverless function) |

Run the API locally: `cd server && go run ./cmd/api` (see `server/README.md` for the endpoint list).
Open `web/index.html` with any static server, e.g. `npx serve web`.
