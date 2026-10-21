# mrmarket-api

Go backend for the MrMarket trading portal (https://mrmarket-portal.vercel.app).

Stack: Go 1.25, chi router, SQLite (pure Go driver, no CGO), JWT auth, gorilla websocket.
Single static binary, single file database. Moves to Postgres by swapping the driver.

## Run

```sh
go run ./cmd/api
# or
go build -o bin/api ./cmd/api && ./bin/api
```

Env (all optional):

| Var | Default |
|---|---|
| `PORT` | `8080` |
| `DATABASE_PATH` | `mrmarket.db` |
| `JWT_SECRET` | `dev-secret-change-me` (set this in prod) |
| `CORS_ORIGINS` | localhost:3000, localhost:5173, mrmarket-portal.vercel.app |
| `SEED` | `true` loads the catalog + demo user on first start |

Demo login: `demo@mrmarket.com` / `demo1234`. Demo MT5 bridge token: `demo-bridge-token`.

## API

All JSON. Auth = `Authorization: Bearer <token>` (or `?token=` for the websocket).

### Public
| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/register` | `{email,password,name}` → `{token,user}` |
| POST | `/api/auth/login` | `{email,password}` → `{token,user}` |
| GET | `/api/catalog/courses?level=&q=` | |
| GET | `/api/catalog/live` | live sessions |
| GET | `/api/catalog/indicators?category=&q=` | |
| GET | `/api/catalog/strategies?risk=&sort=ret|dd|subs` | |
| GET | `/api/catalog/strategies/{id}` | + `equity_curve`, `monthly_returns`, `spark`, `plans`, `rules` |
| GET | `/api/catalog/brokers` · `/plans` · `/mentors` | |

### Authenticated
| Method | Path | Notes |
|---|---|---|
| GET | `/api/auth/me` | |
| GET | `/api/account` | subscriptions, plan, courses, live seats, bookings, orders, monthly_spend |
| POST | `/api/purchase` | `{kind: strategy\|indicator\|course\|live\|plan, id, plan?: Monthly\|Quarterly\|Yearly}` |
| DELETE | `/api/subscriptions/{kind}/{id}` | cancel strategy / indicator / plan |
| PUT | `/api/courses/{id}/progress` | `{progress: 0-100}` |
| GET/POST | `/api/bookings` | `{mentor_id, scheduled_at, note}` |
| GET/POST | `/api/tickets` | `{subject, body}` |
| GET | `/api/broker` | linked MT5 account |
| PUT | `/api/broker` | `{broker_id, mt5_login, mt5_server}` → returns `bridge_token` |
| GET | `/api/algo` | summary, strategies (run state), positions, orders, history, calendar, activity |
| PUT | `/api/algo/strategies/{id}` | `{running, lot_size?}` |
| POST | `/api/algo/pause-all` · `/resume-all` | |
| GET | `/api/ws` | events: `hello`, `strategy`, `strategies`, `activity`, `sync` |

### MT5 bridge
`POST /api/bridge/sync` with header `X-Bridge-Token: <token from PUT /api/broker>`:

```json
{"equity":27000,"balance":26500,
 "positions":[{"ticket":"123","symbol":"XAUUSD","side":"buy","lots":0.5,"open_price":2652.4,"current_price":2667.9,"strategy_id":"gold-breakout"}],
 "orders":[{"ticket":"124","placed_at":"2026-10-21 14:32:08","symbol":"XAUUSD","side":"buy","type":"Market","lots":0.5,"price":2652.4,"status":"Filled","strategy_id":"gold-breakout"}],
 "history":[{"ticket":"120","symbol":"EURUSD","side":"sell","lots":1.2,"open_price":1.0951,"close_price":1.0930,"pnl":252,"strategy_id":"euro-mean","closed_at":"2026-10-20 11:05:00"}],
 "daily_pnl":[{"day":"2026-10-21","pnl":431}]}
```

Positions are replaced each sync; orders and history are upserted by ticket. The browser gets a `sync` websocket event.
The sender is either an MQL5 Expert Advisor using `WebRequest` on a timer, or a MetaApi worker. Both are out of scope for this repo.

## Layout

```
cmd/api            main: config, db, seed, http server
internal/api       routes + handlers (auth, catalog, account, algo, bridge, ws)
internal/store     SQLite schema, models, queries, seed
internal/auth      bcrypt + JWT + middleware
internal/payments  Provider interface; Demo approves everything. Drop Stripe/Razorpay here.
internal/ws        per-user websocket hub
internal/curve     seeded random walk shared with the frontend charts
```

## Deploy

```sh
docker build -t mrmarket-api .
docker run -p 8080:8080 -e JWT_SECRET=... -v mrmarket-data:/data -e DATABASE_PATH=/data/mrmarket.db mrmarket-api
```

Put nginx in front for TLS, same as the BestBrain api box.
