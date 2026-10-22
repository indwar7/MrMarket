package store

import (
	"context"
	"encoding/json"
	"time"
)

func (s *Store) StrategyRuns(ctx context.Context, uid int64) ([]StrategyRun, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT `+prefixed("st", strategyCols)+`, r.running, r.lot_size,
		  COALESCE((SELECT SUM(pnl) FROM trade_history h WHERE h.user_id=r.user_id AND h.strategy_id=st.id AND h.closed_at >= date('now','start of month')),0),
		  (SELECT COUNT(*) FROM trade_orders o WHERE o.user_id=r.user_id AND o.strategy_id=st.id AND o.placed_at >= date('now'))
		FROM strategy_runs r JOIN strategies st ON st.id=r.strategy_id
		WHERE r.user_id=? ORDER BY st.rowid`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []StrategyRun{}
	for rows.Next() {
		var r StrategyRun
		t := &r.Strategy
		var inputs string
		if err := rows.Scan(&t.ID, &t.Title, &t.Symbol, &t.Timeframe, &t.Style, &t.Risk, &t.Return, &t.Drawdown, &t.WinRate, &t.PF, &t.Trades, &t.MinCapital, &t.Price, &t.Subs, &t.Seed, &t.Author, &t.Description,
			&t.Number, &t.Version, &t.Category, &inputs, &t.PairID, &t.Timeframes, &t.SizeKB,
			&r.Running, &r.LotSize, &r.MonthPnL, &r.Trades); err != nil {
			return nil, err
		}
		t.Inputs = json.RawMessage(inputs)
		out = append(out, r)
	}
	return out, rows.Err()
}

func prefixed(alias, cols string) string {
	out := ""
	for i, c := range splitCSV(cols) {
		if i > 0 {
			out += ","
		}
		out += alias + "." + c
	}
	return out
}

func splitCSV(s string) []string {
	var out []string
	cur := ""
	for _, ch := range s {
		if ch == ',' {
			out = append(out, cur)
			cur = ""
			continue
		}
		cur += string(ch)
	}
	return append(out, cur)
}

func (s *Store) SetRunning(ctx context.Context, uid int64, strategyID string, running bool, lotSize *float64) error {
	q := `UPDATE strategy_runs SET running=?, updated_at=datetime('now') WHERE user_id=? AND strategy_id=?`
	args := []any{running, uid, strategyID}
	if lotSize != nil {
		q = `UPDATE strategy_runs SET running=?, lot_size=?, updated_at=datetime('now') WHERE user_id=? AND strategy_id=?`
		args = []any{running, *lotSize, uid, strategyID}
	}
	res, err := s.db.ExecContext(ctx, q, args...)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) SetAllRunning(ctx context.Context, uid int64, running bool) error {
	_, err := s.db.ExecContext(ctx, `UPDATE strategy_runs SET running=?, updated_at=datetime('now') WHERE user_id=?`, running, uid)
	return err
}

func (s *Store) Positions(ctx context.Context, uid int64) ([]Position, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT ticket,symbol,side,lots,open_price,current_price,strategy_id,opened_at FROM positions WHERE user_id=? ORDER BY opened_at DESC`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Position{}
	for rows.Next() {
		var p Position
		if err := rows.Scan(&p.Ticket, &p.Symbol, &p.Side, &p.Lots, &p.OpenPrice, &p.CurrentPrice, &p.StrategyID, &p.OpenedAt); err != nil {
			return nil, err
		}
		p.PnL = PositionPnL(p)
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) TradeOrders(ctx context.Context, uid int64, limit int) ([]TradeOrder, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT ticket,placed_at,symbol,side,type,lots,price,status,strategy_id FROM trade_orders WHERE user_id=? ORDER BY placed_at DESC LIMIT ?`, uid, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TradeOrder{}
	for rows.Next() {
		var o TradeOrder
		if err := rows.Scan(&o.Ticket, &o.PlacedAt, &o.Symbol, &o.Side, &o.Type, &o.Lots, &o.Price, &o.Status, &o.StrategyID); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

func (s *Store) TradeHistory(ctx context.Context, uid int64, limit int) ([]Trade, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT ticket,symbol,side,lots,open_price,close_price,pnl,strategy_id,closed_at FROM trade_history WHERE user_id=? ORDER BY closed_at DESC LIMIT ?`, uid, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Trade{}
	for rows.Next() {
		var t Trade
		if err := rows.Scan(&t.Ticket, &t.Symbol, &t.Side, &t.Lots, &t.OpenPrice, &t.ClosePrice, &t.PnL, &t.StrategyID, &t.ClosedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) DailyPnL(ctx context.Context, uid int64, from, to string) ([]DailyPnL, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT day,pnl FROM daily_pnl WHERE user_id=? AND day BETWEEN ? AND ? ORDER BY day`, uid, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []DailyPnL{}
	for rows.Next() {
		var d DailyPnL
		if err := rows.Scan(&d.Day, &d.PnL); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (s *Store) Activity(ctx context.Context, uid int64, limit int) ([]Activity, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,tag,text,at FROM activity WHERE user_id=? ORDER BY at DESC, id DESC LIMIT ?`, uid, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Activity{}
	for rows.Next() {
		var a Activity
		if err := rows.Scan(&a.ID, &a.Tag, &a.Text, &a.At); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Store) AddActivity(ctx context.Context, uid int64, tag, text string) (Activity, error) {
	at := time.Now().UTC().Format("2006-01-02 15:04:05")
	res, err := s.db.ExecContext(ctx, `INSERT INTO activity(user_id,tag,text,at) VALUES(?,?,?,?)`, uid, tag, text, at)
	if err != nil {
		return Activity{}, err
	}
	id, _ := res.LastInsertId()
	return Activity{ID: id, Tag: tag, Text: text, At: at}, nil
}

// BridgeSync is what the MT5 bridge (an Expert Advisor calling WebRequest, or a MetaApi worker) posts.
type BridgeSync struct {
	Equity    float64      `json:"equity"`
	Balance   float64      `json:"balance"`
	Positions []Position   `json:"positions"`
	Orders    []TradeOrder `json:"orders"`
	History   []Trade      `json:"history"`
	DailyPnL  []DailyPnL   `json:"daily_pnl"`
}

// ApplyBridgeSync replaces open positions, upserts orders and closed trades, and stamps the account.
func (s *Store) ApplyBridgeSync(ctx context.Context, uid int64, in BridgeSync) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE broker_accounts SET equity=?, balance=?, status='connected', last_seen=datetime('now') WHERE user_id=?`, in.Equity, in.Balance, uid); err != nil {
		return err
	}
	if in.Positions != nil {
		if _, err := tx.ExecContext(ctx, `DELETE FROM positions WHERE user_id=?`, uid); err != nil {
			return err
		}
		for _, p := range in.Positions {
			if p.OpenedAt == "" {
				p.OpenedAt = time.Now().UTC().Format("2006-01-02 15:04:05")
			}
			if _, err := tx.ExecContext(ctx, `INSERT INTO positions(user_id,ticket,symbol,side,lots,open_price,current_price,strategy_id,opened_at) VALUES(?,?,?,?,?,?,?,?,?)`,
				uid, p.Ticket, p.Symbol, p.Side, p.Lots, p.OpenPrice, p.CurrentPrice, p.StrategyID, p.OpenedAt); err != nil {
				return err
			}
		}
	}
	for _, o := range in.Orders {
		if _, err := tx.ExecContext(ctx, `INSERT INTO trade_orders(user_id,ticket,placed_at,symbol,side,type,lots,price,status,strategy_id) VALUES(?,?,?,?,?,?,?,?,?,?)
			ON CONFLICT(user_id,ticket) DO UPDATE SET status=excluded.status, price=excluded.price, lots=excluded.lots`,
			uid, o.Ticket, o.PlacedAt, o.Symbol, o.Side, o.Type, o.Lots, o.Price, o.Status, o.StrategyID); err != nil {
			return err
		}
	}
	for _, h := range in.History {
		if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO trade_history(user_id,ticket,symbol,side,lots,open_price,close_price,pnl,strategy_id,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,
			uid, h.Ticket, h.Symbol, h.Side, h.Lots, h.OpenPrice, h.ClosePrice, h.PnL, h.StrategyID, h.ClosedAt); err != nil {
			return err
		}
	}
	for _, d := range in.DailyPnL {
		if _, err := tx.ExecContext(ctx, `INSERT INTO daily_pnl(user_id,day,pnl) VALUES(?,?,?) ON CONFLICT(user_id,day) DO UPDATE SET pnl=excluded.pnl`, uid, d.Day, d.PnL); err != nil {
			return err
		}
	}
	return tx.Commit()
}
