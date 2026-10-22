package store

import (
	"context"
	"database/sql"
	"errors"
)

// Subscriptions returns the user's active strategy/indicator/plan subscriptions with titles resolved.
func (s *Store) Subscriptions(ctx context.Context, uid int64) ([]Subscription, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT sub.id, sub.kind, sub.item_id, sub.plan, sub.price, sub.since,
		       COALESCE(st.title, ind.title, pl.name, sc.title, '') AS title
		FROM subscriptions sub
		LEFT JOIN strategies st ON sub.kind='strategy' AND st.id=sub.item_id
		LEFT JOIN indicators ind ON sub.kind='indicator' AND ind.id=sub.item_id
		LEFT JOIN plans pl ON sub.kind='plan' AND pl.id=sub.item_id
		LEFT JOIN scripts sc ON sub.kind='script' AND sc.id=sub.item_id
		WHERE sub.user_id=? AND sub.status='active' ORDER BY sub.since DESC, sub.id DESC`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Subscription{}
	for rows.Next() {
		var x Subscription
		if err := rows.Scan(&x.ID, &x.Kind, &x.ItemID, &x.Plan, &x.Price, &x.Since, &x.Title); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

func (s *Store) HasSubscription(ctx context.Context, uid int64, kind, itemID string) (bool, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM subscriptions WHERE user_id=? AND kind=? AND item_id=? AND status='active'`, uid, kind, itemID).Scan(&n)
	return n > 0, err
}

// Subscribe activates a subscription and records the order. A plan replaces any existing plan.
func (s *Store) Subscribe(ctx context.Context, uid int64, kind, itemID, title, plan string, price int, period, paymentRef string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if kind == "plan" {
		if _, err := tx.ExecContext(ctx, `UPDATE subscriptions SET status='cancelled', cancelled_at=datetime('now') WHERE user_id=? AND kind='plan' AND status='active'`, uid); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO subscriptions(user_id,kind,item_id,plan,price) VALUES(?,?,?,?,?)`, uid, kind, itemID, plan, price); err != nil {
		return err
	}
	if kind == "strategy" {
		if _, err := tx.ExecContext(ctx, `INSERT INTO strategy_runs(user_id,strategy_id,running) VALUES(?,?,1) ON CONFLICT(user_id,strategy_id) DO UPDATE SET running=1, updated_at=datetime('now')`, uid, itemID); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO orders(user_id,kind,item_id,item,amount,period,payment_ref) VALUES(?,?,?,?,?,?,?)`, uid, kind, itemID, title, price, period, paymentRef); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) CancelSubscription(ctx context.Context, uid int64, kind, itemID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx, `UPDATE subscriptions SET status='cancelled', cancelled_at=datetime('now') WHERE user_id=? AND kind=? AND item_id=? AND status='active'`, uid, kind, itemID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	if kind == "strategy" {
		if _, err := tx.ExecContext(ctx, `DELETE FROM strategy_runs WHERE user_id=? AND strategy_id=?`, uid, itemID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) Enrollments(ctx context.Context, uid int64) ([]Enrollment, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT c.id,c.title,c.author,c.level,c.lessons,c.duration,c.price,c.rating,c.students,c.hue,c.description,c.disclaimer, e.progress, e.since
		FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.user_id=? ORDER BY e.since DESC`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Enrollment{}
	for rows.Next() {
		var e Enrollment
		c := &e.Course
		if err := rows.Scan(&c.ID, &c.Title, &c.Author, &c.Level, &c.Lessons, &c.Duration, &c.Price, &c.Rating, &c.Students, &c.Hue, &c.Description, &c.Disclaimer, &e.Progress, &e.Since); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (s *Store) Enroll(ctx context.Context, uid int64, c Course, paymentRef string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO enrollments(user_id,course_id) VALUES(?,?)`, uid, c.ID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return tx.Commit() // already enrolled, no double charge
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO orders(user_id,kind,item_id,item,amount,period,payment_ref) VALUES(?,?,?,?,?,?,?)`, uid, "course", c.ID, c.Title, c.Price, "", paymentRef); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) SetProgress(ctx context.Context, uid int64, courseID string, progress int) error {
	res, err := s.db.ExecContext(ctx, `UPDATE enrollments SET progress=? WHERE user_id=? AND course_id=?`, progress, uid, courseID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) Reservations(ctx context.Context, uid int64) ([]LiveSession, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT l.id,l.day,l.month,l.title,l.author,l.time,l.length,l.seats,l.kind,l.is_live
		FROM reservations r JOIN live_sessions l ON l.id=r.live_id WHERE r.user_id=? ORDER BY l.id`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []LiveSession{}
	for rows.Next() {
		var l LiveSession
		if err := rows.Scan(&l.ID, &l.Day, &l.Month, &l.Title, &l.Author, &l.Time, &l.Length, &l.Seats, &l.Kind, &l.IsLive); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (s *Store) Reserve(ctx context.Context, uid int64, l LiveSession) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO reservations(user_id,live_id) VALUES(?,?)`, uid, l.ID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return tx.Commit()
	}
	if _, err := tx.ExecContext(ctx, `UPDATE live_sessions SET seats=MAX(seats-1,0) WHERE id=?`, l.ID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO orders(user_id,kind,item_id,item,amount,period) VALUES(?,?,?,?,?,?)`, uid, "live", l.ID, l.Title, 0, ""); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) Bookings(ctx context.Context, uid int64) ([]Booking, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,mentor_id,scheduled_at,what,note,created_at FROM bookings WHERE user_id=? ORDER BY created_at DESC`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Booking{}
	for rows.Next() {
		var b Booking
		if err := rows.Scan(&b.ID, &b.MentorID, &b.ScheduledAt, &b.What, &b.Note, &b.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (s *Store) CreateBooking(ctx context.Context, uid int64, mentorID, scheduledAt, note string) (Booking, error) {
	res, err := s.db.ExecContext(ctx, `INSERT INTO bookings(user_id,mentor_id,scheduled_at,note) VALUES(?,?,?,?)`, uid, mentorID, scheduledAt, note)
	if err != nil {
		return Booking{}, err
	}
	id, _ := res.LastInsertId()
	var b Booking
	err = s.db.QueryRowContext(ctx, `SELECT id,mentor_id,scheduled_at,what,note,created_at FROM bookings WHERE id=?`, id).
		Scan(&b.ID, &b.MentorID, &b.ScheduledAt, &b.What, &b.Note, &b.CreatedAt)
	return b, err
}

func (s *Store) Orders(ctx context.Context, uid int64) ([]Order, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,kind,item_id,item,amount,period,status,payment_ref,created_at FROM orders WHERE user_id=? ORDER BY created_at DESC, id DESC`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Order{}
	for rows.Next() {
		var o Order
		if err := rows.Scan(&o.ID, &o.Kind, &o.ItemID, &o.Item, &o.Amount, &o.Period, &o.Status, &o.PaymentRef, &o.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

func (s *Store) Tickets(ctx context.Context, uid int64) ([]Ticket, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,subject,body,status,created_at FROM tickets WHERE user_id=? ORDER BY created_at DESC`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Ticket{}
	for rows.Next() {
		var t Ticket
		if err := rows.Scan(&t.ID, &t.Subject, &t.Body, &t.Status, &t.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) CreateTicket(ctx context.Context, uid int64, subject, body string) (Ticket, error) {
	res, err := s.db.ExecContext(ctx, `INSERT INTO tickets(user_id,subject,body) VALUES(?,?,?)`, uid, subject, body)
	if err != nil {
		return Ticket{}, err
	}
	id, _ := res.LastInsertId()
	var t Ticket
	err = s.db.QueryRowContext(ctx, `SELECT id,subject,body,status,created_at FROM tickets WHERE id=?`, id).Scan(&t.ID, &t.Subject, &t.Body, &t.Status, &t.CreatedAt)
	return t, err
}

// ---- broker / MT5 link ----

func (s *Store) BrokerAccount(ctx context.Context, uid int64) (BrokerAccount, error) {
	var b BrokerAccount
	var last sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT broker_id,mt5_login,mt5_server,bridge_token,status,equity,balance,last_seen FROM broker_accounts WHERE user_id=?`, uid).
		Scan(&b.BrokerID, &b.MT5Login, &b.MT5Server, &b.BridgeToken, &b.Status, &b.Equity, &b.Balance, &last)
	if errors.Is(err, sql.ErrNoRows) {
		return b, ErrNotFound
	}
	b.LastSeen = last.String
	return b, err
}

func (s *Store) UpsertBrokerAccount(ctx context.Context, uid int64, brokerID, login, server, token string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO broker_accounts(user_id,broker_id,mt5_login,mt5_server,bridge_token) VALUES(?,?,?,?,?)
		ON CONFLICT(user_id) DO UPDATE SET broker_id=excluded.broker_id, mt5_login=excluded.mt5_login, mt5_server=excluded.mt5_server, status='pending'`,
		uid, brokerID, login, server, token)
	return err
}

func (s *Store) UserByBridgeToken(ctx context.Context, token string) (int64, error) {
	var uid int64
	err := s.db.QueryRowContext(ctx, `SELECT user_id FROM broker_accounts WHERE bridge_token=?`, token).Scan(&uid)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrNotFound
	}
	return uid, err
}
