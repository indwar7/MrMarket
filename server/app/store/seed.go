package store

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"
)

//go:embed seed/mt5_catalog.json
var mt5CatalogJSON []byte

//go:embed seed/lessons.json
var lessonsJSON []byte

//go:embed seed/scripts.json
var scriptsJSON []byte

type mt5Input struct {
	Group   string `json:"group"`
	Name    string `json:"name"`
	Type    string `json:"type"`
	Default string `json:"default"`
	Label   string `json:"label"`
}

type mt5Catalog struct {
	CommonInputs []mt5Input `json:"common_inputs"`
	Items        []struct {
		Number   int    `json:"number"`
		Key      string `json:"key"`
		Name     string `json:"name"`
		Category string `json:"category"`
		EA       struct {
			ID          string     `json:"id"`
			Version     string     `json:"version"`
			Description string     `json:"description"`
			Inputs      []mt5Input `json:"inputs"`
			SizeKB      int        `json:"size_kb"`
		} `json:"ea"`
		Indicator struct {
			ID          string     `json:"id"`
			Version     string     `json:"version"`
			Description string     `json:"description"`
			Inputs      []mt5Input `json:"inputs"`
			Plots       []string   `json:"plots"`
			Window      string     `json:"window"`
			SizeKB      int        `json:"size_kb"`
		} `json:"indicator"`
	} `json:"items"`
}

// CommonInputs are the risk/exit/filter parameters every MrMarket EA shares (from Common.mqh).
var CommonInputs json.RawMessage

var tfRe = regexp.MustCompile(`(?i)\b(?:use|best on|on)\s+((?:M|H|D)\d+(?:\s*(?:to|-|–)\s*(?:M|H|D)\d+)?)`)

func eaTimeframes(desc, category string) string {
	if m := tfRe.FindStringSubmatch(desc); m != nil {
		return strings.ReplaceAll(strings.ReplaceAll(m[1], " to ", "–"), "-", "–")
	}
	switch category {
	case "Scalping":
		return "M1–M5"
	case "Session", "Gap", "Volume":
		return "M5–M15"
	default:
		return "M15–H4"
	}
}

func eaRisk(category string) string {
	switch category {
	case "Scalping":
		return "High"
	case "Trend", "Levels", "Time":
		return "Low"
	default:
		return "Medium"
	}
}

func eaPrice(category string) int {
	switch category {
	case "Scalping", "Smart money", "Pattern", "Price action":
		return 49
	default:
		return 39
	}
}

func indPrice(category string) int {
	if category == "Pattern" || category == "Smart money" {
		return 15
	}
	return 12
}

func indKind(category string) string {
	switch category {
	case "Momentum", "Mean reversion":
		return "osc"
	case "Levels", "Supply", "Smart money", "Session", "Gap":
		return "zones"
	case "Pattern", "Price action":
		return "box"
	case "Volume":
		return "hist"
	default:
		return "ribbon"
	}
}

// SeedCatalog upserts all catalogue content (courses, lessons, EAs, indicators, scripts, brokers, plans, mentors).
// It runs on every start so edits to the seed JSON reach the database.
func (s *Store) SeedCatalog(ctx context.Context) error {
	var cat mt5Catalog
	if err := json.Unmarshal(mt5CatalogJSON, &cat); err != nil {
		return fmt.Errorf("mt5 catalog: %w", err)
	}
	CommonInputs, _ = json.Marshal(cat.CommonInputs)
	var lessons map[string][]string
	if err := json.Unmarshal(lessonsJSON, &lessons); err != nil {
		return fmt.Errorf("lessons: %w", err)
	}
	var scripts []Script
	if err := json.Unmarshal(scriptsJSON, &scripts); err != nil {
		return fmt.Errorf("scripts: %w", err)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	exec := func(q string, args ...any) {
		if err == nil {
			_, err = tx.ExecContext(ctx, q, args...)
		}
	}

	for _, c := range []Course{
		{"price-action", "Price Action Mastery", "Aseem Singhal", "Beginner", 42, "9h 20m", 49, 4.9, 12840, 24},
		{"mt5-basics", "MT5 from Zero to Live", "Rohit Mehra", "Beginner", 28, "5h 10m", 0, 4.8, 20113, 210},
		{"risk", "Risk Management & Position Sizing", "Aseem Singhal", "Intermediate", 18, "3h 45m", 39, 4.9, 8402, 150},
		{"smc", "Smart Money Concepts", "Kavya Iyer", "Intermediate", 36, "8h 05m", 79, 4.7, 6120, 280},
		{"algo-mql5", "Build Your First EA in MQL5", "Neel Shah", "Advanced", 51, "12h 30m", 129, 4.8, 3390, 340},
		{"psychology", "Trading Psychology", "Dr. Meera Rao", "All levels", 14, "2h 50m", 29, 4.9, 9870, 45},
	} {
		exec(`INSERT INTO courses VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, author=excluded.author, level=excluded.level, lessons=excluded.lessons, duration=excluded.duration, price=excluded.price, rating=excluded.rating, students=excluded.students, hue=excluded.hue`,
			c.ID, c.Title, c.Author, c.Level, c.Lessons, c.Duration, c.Price, c.Rating, c.Students, c.Hue)
		for i, title := range lessons[c.ID] {
			exec(`INSERT INTO lessons(course_id,idx,title,duration,free_preview) VALUES(?,?,?,?,?) ON CONFLICT(course_id,idx) DO UPDATE SET title=excluded.title`,
				c.ID, i+1, title, fmt.Sprintf("%d min", 8+(i*7)%11), i == 0)
		}
		exec(`UPDATE courses SET lessons=(SELECT COUNT(*) FROM lessons WHERE course_id=?) WHERE id=? AND EXISTS (SELECT 1 FROM lessons WHERE course_id=?)`, c.ID, c.ID, c.ID)
	}
	for _, l := range []LiveSession{
		{1, 4, "Oct", "Gold (XAUUSD) Live Market Session", "Aseem Singhal", "7:00 PM IST", "90 min", 38, "Live trading", true},
		{2, 7, "Oct", "Q&A: Fixing Your Strategy Drawdown", "Neel Shah", "8:30 PM IST", "60 min", 112, "Webinar", false},
		{3, 12, "Oct", "6-Week Forex Bootcamp, Cohort 14", "Kavya Iyer", "Sat & Sun, 10 AM", "6 weeks", 9, "Cohort", false},
		{4, 18, "Oct", "Reading the Economic Calendar", "Rohit Mehra", "6:00 PM IST", "75 min", 64, "Webinar", false},
	} {
		exec(`INSERT OR IGNORE INTO live_sessions VALUES(?,?,?,?,?,?,?,?,?,?)`, l.ID, l.Day, l.Month, l.Title, l.Author, l.Time, l.Length, l.Seats, l.Kind, l.IsLive)
	}

	// MT5 Expert Advisors -> strategies, their signal indicators -> indicators. Metadata only: no source or binaries here.
	for _, it := range cat.Items {
		eaInputs, _ := json.Marshal(it.EA.Inputs)
		indInputs, _ := json.Marshal(it.Indicator.Inputs)
		plots, _ := json.Marshal(it.Indicator.Plots)
		desc := strings.TrimSpace(it.EA.Description)
		if desc == "" {
			desc = it.Name + " Expert Advisor"
		}
		exec(`INSERT INTO strategies(id,title,symbol,timeframe,style,risk,ret,dd,win,pf,trades,min_capital,price,subs,seed,author,description,number,version,category,inputs,pair_id,timeframes,size_kb)
		      VALUES(?,?,?,?,?,?,0,0,0,0,0,?,?,0,?,?,?,?,?,?,?,?,?,?)
		      ON CONFLICT(id) DO UPDATE SET title=excluded.title, timeframe=excluded.timeframe, style=excluded.style, risk=excluded.risk, price=excluded.price, description=excluded.description,
		        number=excluded.number, version=excluded.version, category=excluded.category, inputs=excluded.inputs, pair_id=excluded.pair_id, timeframes=excluded.timeframes, size_kb=excluded.size_kb`,
			it.EA.ID, it.Name+" EA", "Any MT5 symbol", eaTimeframes(desc, it.Category), it.Category, eaRisk(it.Category), 500, eaPrice(it.Category), it.Number*7+3, "MrMarket", desc,
			it.Number, it.EA.Version, it.Category, string(eaInputs), it.Indicator.ID, eaTimeframes(desc, it.Category), it.EA.SizeKB)
		idesc := strings.TrimSpace(it.Indicator.Description)
		idesc = strings.TrimPrefix(idesc, "(")
		if idesc == "" || len(idesc) < 12 {
			idesc = fmt.Sprintf("Plots %s on the chart.", strings.ToLower(strings.Join(it.Indicator.Plots, ", ")))
		}
		idesc = fmt.Sprintf("On-chart signal view for the %s EA. %s", it.Name, strings.ToUpper(idesc[:1])+idesc[1:])
		exec(`INSERT INTO indicators(id,title,category,platform,description,price,rating,subs,kind,number,version,inputs,plots,window,pair_id,size_kb)
		      VALUES(?,?,?,?,?,?,0,0,?,?,?,?,?,?,?,?)
		      ON CONFLICT(id) DO UPDATE SET title=excluded.title, category=excluded.category, description=excluded.description, price=excluded.price, kind=excluded.kind,
		        number=excluded.number, version=excluded.version, inputs=excluded.inputs, plots=excluded.plots, window=excluded.window, pair_id=excluded.pair_id, size_kb=excluded.size_kb`,
			it.Indicator.ID, it.Name+" Signals", it.Category, "MT5", idesc, indPrice(it.Category), indKind(it.Category),
			it.Number, it.Indicator.Version, string(indInputs), string(plots), it.Indicator.Window, it.EA.ID, it.Indicator.SizeKB)
	}
	// drop design-era demo items that are not in the catalogue
	exec(`DELETE FROM strategies WHERE number=0`)
	exec(`DELETE FROM indicators WHERE number=0`)

	for _, x := range scripts {
		tags := string(x.Tags)
		if tags == "" {
			tags = "[]"
		}
		exec(`INSERT INTO scripts(id,title,category,status,price,version,description,requirements,tags) VALUES(?,?,?,?,?,?,?,?,?)
		      ON CONFLICT(id) DO UPDATE SET title=excluded.title, category=excluded.category, status=excluded.status, price=excluded.price, version=excluded.version, description=excluded.description, requirements=excluded.requirements, tags=excluded.tags`,
			x.ID, x.Title, x.Category, x.Status, x.Price, x.Version, x.Description, x.Requirements, tags)
	}

	for _, b := range []Broker{
		{"exness", "Exness", "#1a1a1a", "FSCA, CySEC", "from 0.0 pips", "$10"},
		{"icmarkets", "IC Markets", "#1f6fd1", "ASIC, CySEC", "from 0.0 pips", "$200"},
		{"xm", "XM", "#c0392b", "CySEC, ASIC", "from 0.6 pips", "$5"},
		{"pepperstone", "Pepperstone", "#2c3e50", "FCA, ASIC", "from 0.0 pips", "$0"},
		{"vantage", "Vantage", "#0e7c86", "ASIC, FCA", "from 0.0 pips", "$50"},
		{"fbs", "FBS", "#2e9e4f", "CySEC, ASIC", "from 0.7 pips", "$5"},
		{"octa", "Octa", "#6c3fc5", "CySEC", "from 0.6 pips", "$25"},
		{"tickmill", "Tickmill", "#d4650a", "FCA, CySEC", "from 0.0 pips", "$100"},
	} {
		exec(`INSERT OR IGNORE INTO brokers VALUES(?,?,?,?,?,?)`, b.ID, b.Name, b.Color, b.Regulation, b.Spread, b.MinDeposit)
	}
	exec(`INSERT OR IGNORE INTO plans VALUES('community','Community',0),('mentor','Mentor plan',99),('pro','Pro desk',299)`)
	exec(`INSERT OR IGNORE INTO mentors VALUES('aseem','Aseem Singhal','Founder, 15 yrs trading','AS'),('kavya','Kavya Iyer','Forex & SMC mentor','KI'),('neel','Neel Shah','Algo & MQL5 mentor','NS')`)
	if err != nil {
		return err
	}
	return tx.Commit()
}

// SeedDemo creates the demo trader with subscriptions and a linked MT5 account, once.
func (s *Store) SeedDemo(ctx context.Context, demoPasswordHash string) error {
	var n int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE email='demo@mrmarket.com'`).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	exec := func(q string, args ...any) {
		if err == nil {
			_, err = tx.ExecContext(ctx, q, args...)
		}
	}
	exec(`INSERT INTO users(id,email,password_hash,name,created_at) VALUES(1,'demo@mrmarket.com',?,'Demo Trader','2026-08-01 09:00:00')`, demoPasswordHash)
	sub := func(kind, id, title string, price int, since string, lot float64) {
		exec(`INSERT INTO subscriptions(user_id,kind,item_id,plan,price,since) VALUES(1,?,?,'Monthly',?,?)`, kind, id, price, since)
		period := "/month"
		if price == 0 {
			period = ""
		}
		exec(`INSERT INTO orders(user_id,kind,item_id,item,amount,period,created_at) VALUES(1,?,?,?,?,?,?)`, kind, id, title, price, period, since)
		if kind == "strategy" {
			exec(`INSERT INTO strategy_runs(user_id,strategy_id,running,lot_size) VALUES(1,?,?,?)`, id, id != "ea-31-scalper", lot)
		}
	}
	const (
		eaORB   = "ea-05-orb"
		eaSess  = "ea-08-session-breakout"
		eaTrend = "ea-06-supertrend"
		eaVWAP  = "ea-17-vwap"
		eaScalp = "ea-31-scalper"
	)
	sub("strategy", eaORB, "Opening Range Breakout EA", 39, "2026-09-14 10:00:00", 0.5)
	sub("strategy", eaSess, "Session Breakout EA", 39, "2026-09-10 10:00:00", 0.6)
	sub("strategy", eaTrend, "Supertrend EA", 39, "2026-09-02 10:00:00", 0.3)
	sub("strategy", eaVWAP, "VWAP EA", 39, "2026-08-28 10:00:00", 0.8)
	sub("strategy", eaScalp, "Scalper EA", 49, "2026-08-20 10:00:00", 1.2)
	sub("indicator", "ind-05-orb", "Opening Range Breakout Signals", 12, "2026-08-18 10:00:00", 0)
	enroll := func(id, title string, price, prog int, since string) {
		exec(`INSERT INTO enrollments(user_id,course_id,progress,since) VALUES(1,?,?,?)`, id, prog, since)
		exec(`INSERT INTO orders(user_id,kind,item_id,item,amount,period,created_at) VALUES(1,'course',?,?,?,'',?)`, id, title, price, since)
		exec(`INSERT OR IGNORE INTO lesson_progress(user_id,lesson_id) SELECT 1, id FROM lessons WHERE course_id=? AND idx <= (SELECT COUNT(*) FROM lessons WHERE course_id=?) * ? / 100`, id, id, prog)
	}
	enroll("risk", "Risk Management & Position Sizing", 39, 20, "2026-08-12 10:00:00")
	enroll("price-action", "Price Action Mastery", 49, 64, "2026-08-05 10:00:00")
	enroll("mt5-basics", "MT5 from Zero to Live", 0, 100, "2026-08-01 10:00:00")

	exec(`INSERT INTO broker_accounts(user_id,broker_id,mt5_login,mt5_server,bridge_token,status,equity,balance,last_seen) VALUES(1,'exness','81234567','Exness-MT5Real','demo-bridge-token','connected',26190,25640,datetime('now'))`)

	today := time.Now().UTC().Format("2006-01-02")
	for _, p := range []Position{
		{"P1001", "XAUUSD", "buy", 0.5, 2652.4, 2667.9, 0, eaORB, today + " 14:32:08"},
		{"P1002", "EURUSD", "sell", 1.2, 1.0912, 1.0897, 0, eaScalp, today + " 13:58:41"},
		{"P1003", "NAS100", "buy", 0.3, 20140, 20098, 0, eaTrend, today + " 13:15:02"},
		{"P1004", "USDJPY", "buy", 0.8, 149.32, 149.51, 0, eaVWAP, today + " 11:20:55"},
		{"P1005", "GBPUSD", "sell", 0.6, 1.3088, 1.3102, 0, eaSess, today + " 10:02:13"},
	} {
		exec(`INSERT INTO positions(user_id,ticket,symbol,side,lots,open_price,current_price,strategy_id,opened_at) VALUES(1,?,?,?,?,?,?,?,?)`, p.Ticket, p.Symbol, p.Side, p.Lots, p.OpenPrice, p.CurrentPrice, p.StrategyID, p.OpenedAt)
	}
	for _, o := range []TradeOrder{
		{"O2001", today + " 14:32:08", "XAUUSD", "buy", "Market", 0.5, 2652.4, "Filled", eaORB},
		{"O2002", today + " 13:58:41", "EURUSD", "sell", "Limit", 1.2, 1.0912, "Filled", eaScalp},
		{"O2003", today + " 13:15:02", "NAS100", "buy", "Stop", 0.3, 20140, "Filled", eaTrend},
		{"O2004", today + " 12:47:19", "XAUUSD", "sell", "Limit", 0.5, 2689.0, "Pending", eaORB},
		{"O2005", today + " 11:20:55", "USDJPY", "buy", "Market", 0.8, 149.32, "Filled", eaVWAP},
		{"O2006", today + " 10:02:13", "GBPUSD", "buy", "Stop", 0.6, 1.3150, "Cancelled", eaSess},
	} {
		exec(`INSERT INTO trade_orders(user_id,ticket,placed_at,symbol,side,type,lots,price,status,strategy_id) VALUES(1,?,?,?,?,?,?,?,?,?)`, o.Ticket, o.PlacedAt, o.Symbol, o.Side, o.Type, o.Lots, o.Price, o.Status, o.StrategyID)
	}
	y := time.Now().UTC().AddDate(0, 0, -1).Format("2006-01-02")
	for _, h := range []Trade{
		{"H3001", "XAUUSD", "buy", 0.5, 2631.2, 2644.8, 680, eaORB, y + " 16:40:00"},
		{"H3002", "EURUSD", "sell", 1.2, 1.0951, 1.0930, 252, eaScalp, y + " 11:05:00"},
		{"H3003", "NAS100", "buy", 0.3, 20210, 20155, -165, eaTrend, "2026-09-29 19:22:00"},
		{"H3004", "USDJPY", "sell", 0.8, 149.90, 149.61, 155, eaVWAP, "2026-09-29 03:14:00"},
		{"H3005", "GBPUSD", "buy", 0.6, 1.3021, 1.3069, 288, eaSess, "2026-09-27 08:50:00"},
	} {
		exec(`INSERT INTO trade_history(user_id,ticket,symbol,side,lots,open_price,close_price,pnl,strategy_id,closed_at) VALUES(1,?,?,?,?,?,?,?,?,?)`, h.Ticket, h.Symbol, h.Side, h.Lots, h.OpenPrice, h.ClosePrice, h.PnL, h.StrategyID, h.ClosedAt)
	}
	r := seededRNG(5)
	for i := 29; i >= 0; i-- {
		d := time.Now().UTC().AddDate(0, 0, -i)
		if wd := d.Weekday(); wd == time.Saturday || wd == time.Sunday {
			continue
		}
		exec(`INSERT INTO daily_pnl(user_id,day,pnl) VALUES(1,?,?)`, d.Format("2006-01-02"), float64(int((r()-0.38)*900)))
	}
	for _, a := range [][2]string{
		{"BUY", "Opening Range Breakout EA opened 0.5 lots XAUUSD @ 2652.40"},
		{"SELL", "Scalper EA limit filled @ 1.0912"},
		{"NEWS", "Strategies paused 15 min around US jobless claims"},
		{"BUY", "Supertrend EA stop triggered @ 20140"},
		{"TP", "VWAP EA closed USDJPY, +$155"},
	} {
		exec(`INSERT INTO activity(user_id,tag,text,at) VALUES(1,?,?,datetime('now', ?))`, a[0], a[1], fmt.Sprintf("-%d minutes", 5*(len(a[1])%7+1)))
	}
	if err != nil {
		return err
	}
	return tx.Commit()
}

func seededRNG(seed uint32) func() float64 {
	s := seed
	return func() float64 {
		s = s*1664525 + 1013904223
		return float64(s) / 4294967296
	}
}
