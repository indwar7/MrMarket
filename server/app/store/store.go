// Package store is the SQLite-backed data layer. SQL is portable enough to move to Postgres later
// (swap the driver, change ? placeholders, keep the schema).
package store

import (
	"context"
	"database/sql"
	_ "embed"
	"errors"
	"fmt"
	"strings"

	_ "github.com/tursodatabase/libsql-client-go/libsql"
	_ "modernc.org/sqlite"
)

//go:embed schema.sql
var schema string

var ErrNotFound = errors.New("not found")

type Store struct{ db *sql.DB }

// Open accepts a Turso/libSQL URL (libsql://db-name.turso.io?authToken=...) or a local SQLite path.
func Open(url string) (*Store, error) {
	var db *sql.DB
	var err error
	if strings.HasPrefix(url, "libsql://") || strings.HasPrefix(url, "https://") {
		db, err = sql.Open("libsql", url)
	} else {
		dsn := fmt.Sprintf("file:%s?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)", url)
		db, err = sql.Open("sqlite", dsn)
	}
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(4)
	// libSQL over HTTP runs one statement per Exec, so apply the schema statement by statement.
	for _, stmt := range strings.Split(schema, ";\n") {
		if strings.TrimSpace(stmt) == "" {
			continue
		}
		if _, err := db.Exec(stmt); err != nil {
			return nil, fmt.Errorf("migrate: %w", err)
		}
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

// ---- users ----

func (s *Store) CreateUser(ctx context.Context, email, hash, name string) (User, error) {
	res, err := s.db.ExecContext(ctx, `INSERT INTO users(email,password_hash,name) VALUES(?,?,?)`, email, hash, name)
	if err != nil {
		return User{}, err
	}
	id, _ := res.LastInsertId()
	return s.UserByID(ctx, id)
}

func (s *Store) UserByEmail(ctx context.Context, email string) (User, error) {
	var u User
	err := s.db.QueryRowContext(ctx, `SELECT id,email,name,created_at,password_hash FROM users WHERE email=?`, email).
		Scan(&u.ID, &u.Email, &u.Name, &u.CreatedAt, &u.Password)
	if errors.Is(err, sql.ErrNoRows) {
		return u, ErrNotFound
	}
	return u, err
}

func (s *Store) UserByID(ctx context.Context, id int64) (User, error) {
	var u User
	err := s.db.QueryRowContext(ctx, `SELECT id,email,name,created_at,password_hash FROM users WHERE id=?`, id).
		Scan(&u.ID, &u.Email, &u.Name, &u.CreatedAt, &u.Password)
	if errors.Is(err, sql.ErrNoRows) {
		return u, ErrNotFound
	}
	return u, err
}

// ---- catalog ----

func (s *Store) Courses(ctx context.Context) ([]Course, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,title,author,level,lessons,duration,price,rating,students,hue FROM courses ORDER BY rowid`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Course{}
	for rows.Next() {
		var c Course
		if err := rows.Scan(&c.ID, &c.Title, &c.Author, &c.Level, &c.Lessons, &c.Duration, &c.Price, &c.Rating, &c.Students, &c.Hue); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) Course(ctx context.Context, id string) (Course, error) {
	var c Course
	err := s.db.QueryRowContext(ctx, `SELECT id,title,author,level,lessons,duration,price,rating,students,hue FROM courses WHERE id=?`, id).
		Scan(&c.ID, &c.Title, &c.Author, &c.Level, &c.Lessons, &c.Duration, &c.Price, &c.Rating, &c.Students, &c.Hue)
	if errors.Is(err, sql.ErrNoRows) {
		return c, ErrNotFound
	}
	return c, err
}

func (s *Store) LiveSessions(ctx context.Context) ([]LiveSession, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,day,month,title,author,time,length,seats,kind,is_live FROM live_sessions ORDER BY id`)
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

func (s *Store) LiveSession(ctx context.Context, id int64) (LiveSession, error) {
	var l LiveSession
	err := s.db.QueryRowContext(ctx, `SELECT id,day,month,title,author,time,length,seats,kind,is_live FROM live_sessions WHERE id=?`, id).
		Scan(&l.ID, &l.Day, &l.Month, &l.Title, &l.Author, &l.Time, &l.Length, &l.Seats, &l.Kind, &l.IsLive)
	if errors.Is(err, sql.ErrNoRows) {
		return l, ErrNotFound
	}
	return l, err
}

func (s *Store) Indicators(ctx context.Context) ([]Indicator, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,title,category,platform,description,price,rating,subs,kind FROM indicators ORDER BY rowid`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Indicator{}
	for rows.Next() {
		var i Indicator
		if err := rows.Scan(&i.ID, &i.Title, &i.Category, &i.Platform, &i.Description, &i.Price, &i.Rating, &i.Subs, &i.Kind); err != nil {
			return nil, err
		}
		out = append(out, i)
	}
	return out, rows.Err()
}

func (s *Store) Indicator(ctx context.Context, id string) (Indicator, error) {
	var i Indicator
	err := s.db.QueryRowContext(ctx, `SELECT id,title,category,platform,description,price,rating,subs,kind FROM indicators WHERE id=?`, id).
		Scan(&i.ID, &i.Title, &i.Category, &i.Platform, &i.Description, &i.Price, &i.Rating, &i.Subs, &i.Kind)
	if errors.Is(err, sql.ErrNoRows) {
		return i, ErrNotFound
	}
	return i, err
}

const strategyCols = `id,title,symbol,timeframe,style,risk,ret,dd,win,pf,trades,min_capital,price,subs,seed,author,description`

func scanStrategy(sc interface{ Scan(...any) error }) (Strategy, error) {
	var t Strategy
	err := sc.Scan(&t.ID, &t.Title, &t.Symbol, &t.Timeframe, &t.Style, &t.Risk, &t.Return, &t.Drawdown, &t.WinRate, &t.PF, &t.Trades, &t.MinCapital, &t.Price, &t.Subs, &t.Seed, &t.Author, &t.Description)
	return t, err
}

func (s *Store) Strategies(ctx context.Context) ([]Strategy, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+strategyCols+` FROM strategies ORDER BY rowid`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Strategy{}
	for rows.Next() {
		t, err := scanStrategy(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) Strategy(ctx context.Context, id string) (Strategy, error) {
	t, err := scanStrategy(s.db.QueryRowContext(ctx, `SELECT `+strategyCols+` FROM strategies WHERE id=?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return t, ErrNotFound
	}
	return t, err
}

func (s *Store) Brokers(ctx context.Context) ([]Broker, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,name,color,regulation,spread,min_deposit FROM brokers ORDER BY rowid`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Broker{}
	for rows.Next() {
		var b Broker
		if err := rows.Scan(&b.ID, &b.Name, &b.Color, &b.Regulation, &b.Spread, &b.MinDeposit); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (s *Store) Plans(ctx context.Context) ([]Plan, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,name,price FROM plans ORDER BY price`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Plan{}
	for rows.Next() {
		var p Plan
		if err := rows.Scan(&p.ID, &p.Name, &p.Price); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) Plan(ctx context.Context, id string) (Plan, error) {
	var p Plan
	err := s.db.QueryRowContext(ctx, `SELECT id,name,price FROM plans WHERE id=?`, id).Scan(&p.ID, &p.Name, &p.Price)
	if errors.Is(err, sql.ErrNoRows) {
		return p, ErrNotFound
	}
	return p, err
}

func (s *Store) Mentors(ctx context.Context) ([]Mentor, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,name,role,initials FROM mentors ORDER BY rowid`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Mentor{}
	for rows.Next() {
		var m Mentor
		if err := rows.Scan(&m.ID, &m.Name, &m.Role, &m.Initials); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}
