// Package store is the SQLite-backed data layer. SQL is portable enough to move to Postgres later
// (swap the driver, change ? placeholders, keep the schema).
package store

import (
	"context"
	"database/sql"
	_ "embed"
	"encoding/json"
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
	st := &Store{db: db}
	// Columns added after the first release; safe to re-run.
	for _, c := range []struct{ table, col, def string }{
		{"strategies", "number", "INTEGER NOT NULL DEFAULT 0"}, {"strategies", "version", "TEXT NOT NULL DEFAULT ''"}, {"strategies", "category", "TEXT NOT NULL DEFAULT ''"},
		{"strategies", "inputs", "TEXT NOT NULL DEFAULT '[]'"}, {"strategies", "pair_id", "TEXT NOT NULL DEFAULT ''"}, {"strategies", "timeframes", "TEXT NOT NULL DEFAULT 'Any'"}, {"strategies", "size_kb", "INTEGER NOT NULL DEFAULT 0"},
		{"indicators", "number", "INTEGER NOT NULL DEFAULT 0"}, {"indicators", "version", "TEXT NOT NULL DEFAULT ''"}, {"indicators", "inputs", "TEXT NOT NULL DEFAULT '[]'"}, {"indicators", "plots", "TEXT NOT NULL DEFAULT '[]'"},
		{"indicators", "window", "TEXT NOT NULL DEFAULT 'chart'"}, {"indicators", "pair_id", "TEXT NOT NULL DEFAULT ''"}, {"indicators", "size_kb", "INTEGER NOT NULL DEFAULT 0"},
		{"lessons", "module", "TEXT NOT NULL DEFAULT ''"}, {"lessons", "summary", "TEXT NOT NULL DEFAULT ''"}, {"lessons", "resource_url", "TEXT NOT NULL DEFAULT ''"},
		{"courses", "description", "TEXT NOT NULL DEFAULT ''"}, {"courses", "disclaimer", "TEXT NOT NULL DEFAULT ''"},
	} {
		if err := st.ensureColumn(c.table, c.col, c.def); err != nil {
			return nil, err
		}
	}
	return st, nil
}

func (s *Store) ensureColumn(table, col, def string) error {
	rows, err := s.db.Query(fmt.Sprintf("PRAGMA table_info(%s)", table))
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name, typ string
		var notnull, pk int
		var dflt any
		if err := rows.Scan(&cid, &name, &typ, &notnull, &dflt, &pk); err != nil {
			return err
		}
		if name == col {
			return nil
		}
	}
	_, err = s.db.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", table, col, def))
	return err
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
	rows, err := s.db.QueryContext(ctx, `SELECT id,title,author,level,lessons,duration,price,rating,students,hue,description,disclaimer FROM courses ORDER BY rowid`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Course{}
	for rows.Next() {
		var c Course
		if err := rows.Scan(&c.ID, &c.Title, &c.Author, &c.Level, &c.Lessons, &c.Duration, &c.Price, &c.Rating, &c.Students, &c.Hue, &c.Description, &c.Disclaimer); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) Course(ctx context.Context, id string) (Course, error) {
	var c Course
	err := s.db.QueryRowContext(ctx, `SELECT id,title,author,level,lessons,duration,price,rating,students,hue,description,disclaimer FROM courses WHERE id=?`, id).
		Scan(&c.ID, &c.Title, &c.Author, &c.Level, &c.Lessons, &c.Duration, &c.Price, &c.Rating, &c.Students, &c.Hue, &c.Description, &c.Disclaimer)
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

const indicatorCols = `id,title,category,platform,description,price,rating,subs,kind,number,version,inputs,plots,window,pair_id,size_kb`

func scanIndicator(sc interface{ Scan(...any) error }) (Indicator, error) {
	var i Indicator
	var inputs, plots string
	err := sc.Scan(&i.ID, &i.Title, &i.Category, &i.Platform, &i.Description, &i.Price, &i.Rating, &i.Subs, &i.Kind, &i.Number, &i.Version, &inputs, &plots, &i.Window, &i.PairID, &i.SizeKB)
	i.Inputs, i.Plots = json.RawMessage(inputs), json.RawMessage(plots)
	return i, err
}

func (s *Store) Indicators(ctx context.Context) ([]Indicator, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+indicatorCols+` FROM indicators ORDER BY number, rowid`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Indicator{}
	for rows.Next() {
		i, err := scanIndicator(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, i)
	}
	return out, rows.Err()
}

func (s *Store) Indicator(ctx context.Context, id string) (Indicator, error) {
	i, err := scanIndicator(s.db.QueryRowContext(ctx, `SELECT `+indicatorCols+` FROM indicators WHERE id=?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return i, ErrNotFound
	}
	return i, err
}

const strategyCols = `id,title,symbol,timeframe,style,risk,ret,dd,win,pf,trades,min_capital,price,subs,seed,author,description,number,version,category,inputs,pair_id,timeframes,size_kb`

func scanStrategy(sc interface{ Scan(...any) error }) (Strategy, error) {
	var t Strategy
	var inputs string
	err := sc.Scan(&t.ID, &t.Title, &t.Symbol, &t.Timeframe, &t.Style, &t.Risk, &t.Return, &t.Drawdown, &t.WinRate, &t.PF, &t.Trades, &t.MinCapital, &t.Price, &t.Subs, &t.Seed, &t.Author, &t.Description,
		&t.Number, &t.Version, &t.Category, &inputs, &t.PairID, &t.Timeframes, &t.SizeKB)
	t.Inputs = json.RawMessage(inputs)
	return t, err
}

func (s *Store) Strategies(ctx context.Context) ([]Strategy, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+strategyCols+` FROM strategies ORDER BY number, rowid`)
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

// ---- lessons (videos) ----

func (s *Store) Lessons(ctx context.Context, courseID string) ([]Lesson, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,course_id,idx,title,duration,video_url,free_preview,module,summary,resource_url FROM lessons WHERE course_id=? ORDER BY idx`, courseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Lesson{}
	for rows.Next() {
		var l Lesson
		if err := rows.Scan(&l.ID, &l.CourseID, &l.Idx, &l.Title, &l.Duration, &l.VideoURL, &l.FreePreview, &l.Module, &l.Summary, &l.ResourceURL); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (s *Store) CompletedLessons(ctx context.Context, uid int64, courseID string) ([]int64, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT p.lesson_id FROM lesson_progress p JOIN lessons l ON l.id=p.lesson_id WHERE p.user_id=? AND l.course_id=?`, uid, courseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// CompleteLesson marks a lesson done and recomputes the enrollment's progress percentage.
func (s *Store) CompleteLesson(ctx context.Context, uid int64, courseID string, lessonID int64, done bool) (int, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	var n int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM enrollments WHERE user_id=? AND course_id=?`, uid, courseID).Scan(&n); err != nil {
		return 0, err
	}
	if n == 0 {
		return 0, ErrNotFound
	}
	if done {
		_, err = tx.ExecContext(ctx, `INSERT OR IGNORE INTO lesson_progress(user_id,lesson_id) SELECT ?, id FROM lessons WHERE id=? AND course_id=?`, uid, lessonID, courseID)
	} else {
		_, err = tx.ExecContext(ctx, `DELETE FROM lesson_progress WHERE user_id=? AND lesson_id=?`, uid, lessonID)
	}
	if err != nil {
		return 0, err
	}
	var total, doneN int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*), (SELECT COUNT(*) FROM lesson_progress p JOIN lessons l ON l.id=p.lesson_id WHERE p.user_id=? AND l.course_id=?) FROM lessons WHERE course_id=?`, uid, courseID, courseID).Scan(&total, &doneN); err != nil {
		return 0, err
	}
	progress := 0
	if total > 0 {
		progress = doneN * 100 / total
	}
	if _, err := tx.ExecContext(ctx, `UPDATE enrollments SET progress=? WHERE user_id=? AND course_id=?`, progress, uid, courseID); err != nil {
		return 0, err
	}
	return progress, tx.Commit()
}

// ---- python scripts ----

const scriptCols = `id,title,category,status,price,version,description,requirements,tags`

func scanScript(sc interface{ Scan(...any) error }) (Script, error) {
	var x Script
	var tags string
	err := sc.Scan(&x.ID, &x.Title, &x.Category, &x.Status, &x.Price, &x.Version, &x.Description, &x.Requirements, &tags)
	x.Tags = json.RawMessage(tags)
	return x, err
}

func (s *Store) Scripts(ctx context.Context) ([]Script, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+scriptCols+` FROM scripts ORDER BY rowid`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Script{}
	for rows.Next() {
		x, err := scanScript(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

func (s *Store) Script(ctx context.Context, id string) (Script, error) {
	x, err := scanScript(s.db.QueryRowContext(ctx, `SELECT `+scriptCols+` FROM scripts WHERE id=?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return x, ErrNotFound
	}
	return x, err
}
