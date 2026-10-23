package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

func fmtSscan(str string, a ...any) (int, error) { return fmt.Sscan(str, a...) }

func (s *Store) CreateLead(ctx context.Context, l Lead) (Lead, error) {
	res, err := s.db.ExecContext(ctx, `INSERT INTO leads(name,email,phone,kind,item_id,item,plan,note,user_id) VALUES(?,?,?,?,?,?,?,?,?)`,
		l.Name, l.Email, l.Phone, l.Kind, l.ItemID, l.Item, l.Plan, l.Note, l.UserID)
	if err != nil {
		return l, err
	}
	l.ID, _ = res.LastInsertId()
	l.Status = "new"
	return l, nil
}

func (s *Store) Leads(ctx context.Context) ([]Lead, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,name,email,phone,kind,item_id,item,plan,note,user_id,status,created_at FROM leads ORDER BY id DESC LIMIT 500`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Lead{}
	for rows.Next() {
		var l Lead
		var uid sql.NullInt64
		if err := rows.Scan(&l.ID, &l.Name, &l.Email, &l.Phone, &l.Kind, &l.ItemID, &l.Item, &l.Plan, &l.Note, &uid, &l.Status, &l.CreatedAt); err != nil {
			return nil, err
		}
		if uid.Valid {
			l.UserID = &uid.Int64
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (s *Store) SetLeadStatus(ctx context.Context, id int64, status string) error {
	res, err := s.db.ExecContext(ctx, `UPDATE leads SET status=? WHERE id=?`, status, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) SetPassword(ctx context.Context, uid int64, hash string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE users SET password_hash=? WHERE id=?`, hash, uid)
	return err
}

func (s *Store) Users(ctx context.Context) ([]AdminUser, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,email,name,created_at FROM users ORDER BY id DESC LIMIT 500`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AdminUser{}
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Email, &u.Name, &u.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, AdminUser{User: u})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range out {
		out[i].Subscriptions, _ = s.Subscriptions(ctx, out[i].User.ID)
		out[i].Courses, _ = s.Enrollments(ctx, out[i].User.ID)
	}
	return out, nil
}

// Grant gives a user an item without payment (admin assigns after a manual payment).
func (s *Store) Grant(ctx context.Context, uid int64, kind, itemID, title, plan string) error {
	switch kind {
	case "course":
		c, err := s.Course(ctx, itemID)
		if err != nil {
			return err
		}
		return s.Enroll(ctx, uid, c, "manual")
	case "live":
		var id int64
		if _, err := fmtSscan(itemID, &id); err != nil {
			return ErrNotFound
		}
		l, err := s.LiveSession(ctx, id)
		if err != nil {
			return err
		}
		return s.Reserve(ctx, uid, l)
	case "strategy", "indicator", "plan", "script":
		if has, _ := s.HasSubscription(ctx, uid, kind, itemID); has {
			return nil
		}
		if plan == "" {
			plan = "Monthly"
			if kind == "script" {
				plan = "One-time"
			}
		}
		return s.Subscribe(ctx, uid, kind, itemID, title, plan, 0, "", "manual")
	}
	return errors.New("unknown kind")
}

func (s *Store) Revoke(ctx context.Context, uid int64, kind, itemID string) error {
	switch kind {
	case "course":
		_, err := s.db.ExecContext(ctx, `DELETE FROM enrollments WHERE user_id=? AND course_id=?`, uid, itemID)
		return err
	case "live":
		_, err := s.db.ExecContext(ctx, `DELETE FROM reservations WHERE user_id=? AND live_id=?`, uid, itemID)
		return err
	default:
		err := s.CancelSubscription(ctx, uid, kind, itemID)
		if errors.Is(err, ErrNotFound) {
			return nil
		}
		return err
	}
}
