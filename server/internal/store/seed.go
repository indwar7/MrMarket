package store

import (
	"context"
	"fmt"
	"time"
)

// Seed loads the catalog from the design and a demo trader, once.
func (s *Store) Seed(ctx context.Context, demoPasswordHash string) error {
	var n int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM courses`).Scan(&n); err != nil {
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

	for _, c := range []Course{
		{"price-action", "Price Action Mastery", "Aseem Singhal", "Beginner", 42, "9h 20m", 49, 4.9, 12840, 24},
		{"mt5-basics", "MT5 from Zero to Live", "Rohit Mehra", "Beginner", 28, "5h 10m", 0, 4.8, 20113, 210},
		{"risk", "Risk Management & Position Sizing", "Aseem Singhal", "Intermediate", 18, "3h 45m", 39, 4.9, 8402, 150},
		{"smc", "Smart Money Concepts", "Kavya Iyer", "Intermediate", 36, "8h 05m", 79, 4.7, 6120, 280},
		{"algo-mql5", "Build Your First EA in MQL5", "Neel Shah", "Advanced", 51, "12h 30m", 129, 4.8, 3390, 340},
		{"psychology", "Trading Psychology", "Dr. Meera Rao", "All levels", 14, "2h 50m", 29, 4.9, 9870, 45},
	} {
		exec(`INSERT INTO courses VALUES(?,?,?,?,?,?,?,?,?,?)`, c.ID, c.Title, c.Author, c.Level, c.Lessons, c.Duration, c.Price, c.Rating, c.Students, c.Hue)
	}
	for _, l := range []LiveSession{
		{1, 4, "Oct", "Gold (XAUUSD) Live Market Session", "Aseem Singhal", "7:00 PM IST", "90 min", 38, "Live trading", true},
		{2, 7, "Oct", "Q&A: Fixing Your Strategy Drawdown", "Neel Shah", "8:30 PM IST", "60 min", 112, "Webinar", false},
		{3, 12, "Oct", "6-Week Forex Bootcamp, Cohort 14", "Kavya Iyer", "Sat & Sun, 10 AM", "6 weeks", 9, "Cohort", false},
		{4, 18, "Oct", "Reading the Economic Calendar", "Rohit Mehra", "6:00 PM IST", "75 min", 64, "Webinar", false},
	} {
		exec(`INSERT INTO live_sessions VALUES(?,?,?,?,?,?,?,?,?,?)`, l.ID, l.Day, l.Month, l.Title, l.Author, l.Time, l.Length, l.Seats, l.Kind, l.IsLive)
	}
	for _, i := range []Indicator{
		{"trend-matrix", "Trend Matrix Pro", "Trend", "MT5", "Multi-timeframe trend dashboard that colours bias from M5 to D1 in one panel.", 19, 4.8, 4210, "ribbon"},
		{"smart-sr", "Smart S/R Zones", "Levels", "MT5", "Auto-draws supply and demand zones and fades them as price tests them.", 15, 4.7, 3880, "zones"},
		{"volume-delta", "Volume Delta Histogram", "Volume", "MT5", "Buying versus selling pressure per candle, with divergence alerts.", 12, 4.6, 2105, "hist"},
		{"session-box", "Session Range Box", "Levels", "MT5", "Asia, London and New York ranges boxed, with breakout arrows.", 0, 4.9, 9640, "box"},
		{"rsi-div", "RSI Divergence Scanner", "Oscillator", "MT5", "Scans 28 pairs for regular and hidden divergence and sends push alerts.", 14, 4.5, 1970, "osc"},
		{"atr-stop", "ATR Trailing Stop", "Trend", "MT5", "Volatility-adjusted stop line that flips colour on trend change.", 9, 4.7, 3312, "ribbon"},
	} {
		exec(`INSERT INTO indicators VALUES(?,?,?,?,?,?,?,?,?)`, i.ID, i.Title, i.Category, i.Platform, i.Description, i.Price, i.Rating, i.Subs, i.Kind)
	}
	desc := func(sym string) string {
		return fmt.Sprintf("Waits for the %s range to form, then enters on a confirmed break with a volatility-sized stop. Takes partial profit at 1R, trails the rest, and closes all positions before the weekend. No martingale, no grid.", sym)
	}
	for _, t := range []Strategy{
		{"gold-breakout", "Gold London Breakout", "XAUUSD", "M15", "Breakout", "Medium", 38.4, 9.8, 58, 1.92, 412, 1000, 49, 1840, 7, "Aseem Singhal", ""},
		{"euro-mean", "EURUSD Mean Reversion", "EURUSD", "H1", "Mean reversion", "Low", 18.2, 4.6, 66, 1.71, 688, 500, 29, 2410, 11, "Neel Shah", ""},
		{"nas-momentum", "NAS100 Momentum Rider", "NAS100", "M30", "Momentum", "High", 61.7, 17.3, 47, 2.08, 296, 2000, 79, 960, 23, "Kavya Iyer", ""},
		{"carry-grid", "Asian Session Scalper", "USDJPY", "M5", "Scalping", "Medium", 27.9, 8.1, 71, 1.55, 1930, 500, 39, 1325, 5, "Rohit Mehra", ""},
		{"gbp-swing", "GBP Swing Trend", "GBPUSD", "H4", "Trend following", "Low", 22.5, 6.2, 44, 1.88, 164, 1000, 29, 870, 31, "Aseem Singhal", ""},
		{"btc-range", "BTC Weekend Range", "BTCUSD", "H1", "Range", "High", 44.1, 15.4, 55, 1.67, 238, 1500, 59, 540, 43, "Neel Shah", ""},
	} {
		exec(`INSERT INTO strategies VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, t.ID, t.Title, t.Symbol, t.Timeframe, t.Style, t.Risk, t.Return, t.Drawdown, t.WinRate, t.PF, t.Trades, t.MinCapital, t.Price, t.Subs, t.Seed, t.Author, desc(t.Symbol))
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
		exec(`INSERT INTO brokers VALUES(?,?,?,?,?,?)`, b.ID, b.Name, b.Color, b.Regulation, b.Spread, b.MinDeposit)
	}
	exec(`INSERT INTO plans VALUES('community','Community',0),('mentor','Mentor plan',99),('pro','Pro desk',299)`)
	exec(`INSERT INTO mentors VALUES('aseem','Aseem Singhal','Founder, 15 yrs trading','AS'),('kavya','Kavya Iyer','Forex & SMC mentor','KI'),('neel','Neel Shah','Algo & MQL5 mentor','NS')`)

	// demo trader
	exec(`INSERT INTO users(id,email,password_hash,name,created_at) VALUES(1,'demo@mrmarket.com',?,'Demo Trader','2026-08-01 09:00:00')`, demoPasswordHash)
	sub := func(kind, id, title string, price int, since string) {
		exec(`INSERT INTO subscriptions(user_id,kind,item_id,plan,price,since) VALUES(1,?,?,'Monthly',?,?)`, kind, id, price, since)
		period := "/month"
		if price == 0 {
			period = ""
		}
		exec(`INSERT INTO orders(user_id,kind,item_id,item,amount,period,created_at) VALUES(1,?,?,?,?,?,?)`, kind, id, title, price, period, since)
		if kind == "strategy" {
			exec(`INSERT INTO strategy_runs(user_id,strategy_id,running,lot_size) VALUES(1,?,?,?)`, id, id != "nas-momentum", 0.2+float64(len(id)%5)*0.2)
		}
	}
	sub("strategy", "gold-breakout", "Gold London Breakout", 49, "2026-09-14 10:00:00")
	sub("strategy", "gbp-swing", "GBP Swing Trend", 29, "2026-09-10 10:00:00")
	sub("strategy", "carry-grid", "Asian Session Scalper", 39, "2026-09-02 10:00:00")
	sub("strategy", "nas-momentum", "NAS100 Momentum Rider", 79, "2026-08-28 10:00:00")
	sub("strategy", "euro-mean", "EURUSD Mean Reversion", 29, "2026-08-20 10:00:00")
	sub("indicator", "session-box", "Session Range Box", 0, "2026-08-18 10:00:00")
	enroll := func(id, title string, price, prog int, since string) {
		exec(`INSERT INTO enrollments(user_id,course_id,progress,since) VALUES(1,?,?,?)`, id, prog, since)
		exec(`INSERT INTO orders(user_id,kind,item_id,item,amount,period,created_at) VALUES(1,'course',?,?,?,'',?)`, id, title, price, since)
	}
	enroll("risk", "Risk Management & Position Sizing", 39, 20, "2026-08-12 10:00:00")
	enroll("price-action", "Price Action Mastery", 49, 64, "2026-08-05 10:00:00")
	enroll("mt5-basics", "MT5 from Zero to Live", 0, 100, "2026-08-01 10:00:00")

	exec(`INSERT INTO broker_accounts(user_id,broker_id,mt5_login,mt5_server,bridge_token,status,equity,balance,last_seen) VALUES(1,'exness','81234567','Exness-MT5Real','demo-bridge-token','connected',26190,25640,datetime('now'))`)

	today := time.Now().UTC().Format("2006-01-02")
	for _, p := range []Position{
		{"P1001", "XAUUSD", "buy", 0.5, 2652.4, 2667.9, 0, "gold-breakout", today + " 14:32:08"},
		{"P1002", "EURUSD", "sell", 1.2, 1.0912, 1.0897, 0, "euro-mean", today + " 13:58:41"},
		{"P1003", "NAS100", "buy", 0.3, 20140, 20098, 0, "nas-momentum", today + " 13:15:02"},
		{"P1004", "USDJPY", "buy", 0.8, 149.32, 149.51, 0, "carry-grid", today + " 11:20:55"},
		{"P1005", "GBPUSD", "sell", 0.6, 1.3088, 1.3102, 0, "gbp-swing", today + " 10:02:13"},
	} {
		exec(`INSERT INTO positions(user_id,ticket,symbol,side,lots,open_price,current_price,strategy_id,opened_at) VALUES(1,?,?,?,?,?,?,?,?)`, p.Ticket, p.Symbol, p.Side, p.Lots, p.OpenPrice, p.CurrentPrice, p.StrategyID, p.OpenedAt)
	}
	for _, o := range []TradeOrder{
		{"O2001", today + " 14:32:08", "XAUUSD", "buy", "Market", 0.5, 2652.4, "Filled", "gold-breakout"},
		{"O2002", today + " 13:58:41", "EURUSD", "sell", "Limit", 1.2, 1.0912, "Filled", "euro-mean"},
		{"O2003", today + " 13:15:02", "NAS100", "buy", "Stop", 0.3, 20140, "Filled", "nas-momentum"},
		{"O2004", today + " 12:47:19", "XAUUSD", "sell", "Limit", 0.5, 2689.0, "Pending", "gold-breakout"},
		{"O2005", today + " 11:20:55", "USDJPY", "buy", "Market", 0.8, 149.32, "Filled", "carry-grid"},
		{"O2006", today + " 10:02:13", "GBPUSD", "buy", "Stop", 0.6, 1.3150, "Cancelled", "gbp-swing"},
	} {
		exec(`INSERT INTO trade_orders(user_id,ticket,placed_at,symbol,side,type,lots,price,status,strategy_id) VALUES(1,?,?,?,?,?,?,?,?,?)`, o.Ticket, o.PlacedAt, o.Symbol, o.Side, o.Type, o.Lots, o.Price, o.Status, o.StrategyID)
	}
	y := time.Now().UTC().AddDate(0, 0, -1).Format("2006-01-02")
	for _, h := range []Trade{
		{"H3001", "XAUUSD", "buy", 0.5, 2631.2, 2644.8, 680, "gold-breakout", y + " 16:40:00"},
		{"H3002", "EURUSD", "sell", 1.2, 1.0951, 1.0930, 252, "euro-mean", y + " 11:05:00"},
		{"H3003", "NAS100", "buy", 0.3, 20210, 20155, -165, "nas-momentum", "2026-09-29 19:22:00"},
		{"H3004", "USDJPY", "sell", 0.8, 149.90, 149.61, 155, "carry-grid", "2026-09-29 03:14:00"},
		{"H3005", "GBPUSD", "buy", 0.6, 1.3021, 1.3069, 288, "gbp-swing", "2026-09-27 08:50:00"},
	} {
		exec(`INSERT INTO trade_history(user_id,ticket,symbol,side,lots,open_price,close_price,pnl,strategy_id,closed_at) VALUES(1,?,?,?,?,?,?,?,?,?)`, h.Ticket, h.Symbol, h.Side, h.Lots, h.OpenPrice, h.ClosePrice, h.PnL, h.StrategyID, h.ClosedAt)
	}
	// 30 weekdays of daily P&L ending today, same shape as the design's September calendar
	r := seededRNG(5)
	for i := 29; i >= 0; i-- {
		d := time.Now().UTC().AddDate(0, 0, -i)
		if wd := d.Weekday(); wd == time.Saturday || wd == time.Sunday {
			continue
		}
		exec(`INSERT INTO daily_pnl(user_id,day,pnl) VALUES(1,?,?)`, d.Format("2006-01-02"), float64(int((r()-0.38)*900)))
	}
	for _, a := range [][2]string{
		{"BUY", "Gold London Breakout opened 0.5 lots XAUUSD @ 2652.40"},
		{"SELL", "EURUSD Mean Reversion limit filled @ 1.0912"},
		{"NEWS", "Strategies paused 15 min around US jobless claims"},
		{"BUY", "NAS100 Momentum Rider stop triggered @ 20140"},
		{"TP", "Asian Session Scalper closed USDJPY, +$155"},
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
