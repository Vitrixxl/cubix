package main

import (
	"context"
	"database/sql"
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	_ "github.com/mattn/go-sqlite3"
)

//go:embed embed/schema.sql
var schemaSQL string

//go:embed embed/query-indexes.sql
var queryIndexesSQL string

var bg = context.Background()

// Conn is the one SQLite connection (rusqlite's Connection). A transaction runs on it too: `Begin`
// issues BEGIN, and every helper keeps taking the same *Conn.
type Conn struct {
	conn  *sql.Conn
	stmts map[string]*sql.Stmt
}

// Exec is Connection::execute: the number of rows changed.
func (c *Conn) Exec(query string, args ...any) (int64, error) {
	res, err := c.conn.ExecContext(bg, query, args...)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return n, nil
}

// ExecBatch is Connection::execute_batch: every statement of the text.
func (c *Conn) ExecBatch(query string) error {
	_, err := c.conn.ExecContext(bg, query)
	return err
}

func (c *Conn) LastInsertRowid() int64 {
	var id int64
	_ = c.conn.QueryRowContext(bg, "SELECT last_insert_rowid()").Scan(&id)
	return id
}

// Tx is rusqlite's Transaction: rolled back unless committed (call Rollback with defer).
type Tx struct {
	c    *Conn
	done bool
}

// Begin is Connection::transaction (a deferred transaction).
func (c *Conn) Begin() (*Tx, error) {
	if err := c.ExecBatch("BEGIN DEFERRED"); err != nil {
		return nil, err
	}
	return &Tx{c: c}, nil
}

func (t *Tx) Commit() error {
	t.done = true
	return t.c.ExecBatch("COMMIT")
}

func (t *Tx) Rollback() {
	if !t.done {
		t.done = true
		_ = t.c.ExecBatch("ROLLBACK")
	}
}

func (c *Conn) prepare(query string) (*sql.Stmt, error) {
	if s, ok := c.stmts[query]; ok {
		return s, nil
	}
	s, err := c.conn.PrepareContext(bg, query)
	if err != nil {
		return nil, err
	}
	c.stmts[query] = s
	return s, nil
}

// Db owns the connection: every Call runs alone, as every job of Rust's SQLite thread.
type Db struct {
	mu sync.Mutex
	c  *Conn
}

// Call is Db::call: fn has the connection to itself until it returns.
func (d *Db) Call(fn func(c *Conn) error) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	return fn(d.c)
}

// dbCall is Db::call for a closure returning a value.
func dbCall[T any](d *Db, fn func(c *Conn) (T, error)) (T, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	return fn(d.c)
}

func dbOpen(path string) (*Db, error) {
	if parent := filepath.Dir(path); parent != "." && parent != "" {
		if err := os.MkdirAll(parent, 0o777); err != nil {
			return nil, internal(err)
		}
	}
	pool, err := sql.Open("sqlite3", path)
	if err != nil {
		return nil, internal(err)
	}
	pool.SetMaxOpenConns(1)
	pool.SetMaxIdleConns(1)
	pool.SetConnMaxLifetime(0)
	raw, err := pool.Conn(bg)
	if err != nil {
		return nil, internal(err)
	}
	db := &Conn{conn: raw, stmts: map[string]*sql.Stmt{}}
	if err := dbMigrate(db); err != nil {
		return nil, toApiError(err)
	}
	return &Db{c: db}, nil
}

func dbMigrate(db *Conn) error {
	if err := db.ExecBatch("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;"); err != nil {
		return err
	}
	if err := db.ExecBatch(schemaSQL); err != nil {
		return err
	}
	// Profile and social features were retired: accounts only sync practice data now.
	for _, name := range []string{"is_private", "display_name", "bio"} {
		has, err := hasColumn(db, "users", name)
		if err != nil {
			return err
		}
		if has {
			if err := db.ExecBatch("ALTER TABLE users DROP COLUMN " + name); err != nil {
				return err
			}
		}
	}
	if err := db.ExecBatch("DROP TABLE IF EXISTS chat_messages; DROP TABLE IF EXISTS friendships;"); err != nil {
		return err
	}
	for _, table := range []string{"sessions", "solves"} {
		if err := addColumnIfMissing(db, table, "user_id", "TEXT REFERENCES users(id)"); err != nil {
			return err
		}
		if err := db.ExecBatch(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_%s_owner ON %s(user_id)", table, table)); err != nil {
			return err
		}
	}
	for _, table := range []string{"sessions", "solves"} {
		if err := addColumnIfMissing(db, table, "cube_size", "INTEGER NOT NULL DEFAULT 3 CHECK(cube_size BETWEEN 2 AND 7)"); err != nil {
			return err
		}
		if err := db.ExecBatch(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_%s_cube ON %s(user_id,cube_size,created_at)", table, table)); err != nil {
			return err
		}
	}
	steps := []func() error{
		// Free-text notes on a solve arrived after the first accounts.
		func() error { return addColumnIfMissing(db, "solves", "comment", "TEXT") },
		// The turns of a solve, as a smart cube records them, arrived with smart cubes.
		func() error { return addColumnIfMissing(db, "solves", "solution", "TEXT") },
		// A solve shared by a link carries the link's token.
		func() error { return addColumnIfMissing(db, "solves", "share_token", "TEXT") },
		func() error {
			return db.ExecBatch("CREATE UNIQUE INDEX IF NOT EXISTS idx_solves_share ON solves(share_token) WHERE share_token IS NOT NULL")
		},
		// One day's extra hours or hours taken back arrived after the weekly hours.
		func() error { return addColumnIfMissing(db, "coaches", "overrides", "TEXT NOT NULL DEFAULT '[]'") },
		// Coaches may keep to the students they have; accounts may show a picture.
		func() error { return addColumnIfMissing(db, "coaches", "new_students", "INTEGER NOT NULL DEFAULT 1") },
		func() error { return addColumnIfMissing(db, "users", "avatar", "TEXT") },
		// The algorithm a case was learned with arrived after learned cases.
		func() error { return addColumnIfMissing(db, "learned_cases", "alg", "TEXT") },
		// Several algorithms per case arrived after one: the single choice becomes a list of one.
		func() error {
			has, err := hasColumn(db, "learned_cases", "algs")
			if err != nil || has {
				return err
			}
			return db.ExecBatch("ALTER TABLE learned_cases ADD COLUMN algs TEXT; UPDATE learned_cases SET algs=json_array(alg) WHERE alg IS NOT NULL;")
		},
		// A coach may offer to move a session.
		func() error { return addColumnIfMissing(db, "coach_bookings", "proposed_start", "INTEGER") },
		func() error { return addColumnIfMissing(db, "coach_bookings", "proposed_end", "INTEGER") },
		// The policy and acceptance time are recorded only for bookings made with explicit consent.
		func() error { return addColumnIfMissing(db, "coach_bookings", "cancellation_policy", "TEXT") },
		func() error {
			return addColumnIfMissing(db, "coach_bookings", "cancellation_policy_accepted_at", "INTEGER")
		},
		// Battles and tournaments shown as cards in the community's conversations.
		func() error {
			return addColumnIfMissing(db, "social_messages", "match_id", "INTEGER REFERENCES matches(id) ON DELETE CASCADE")
		},
		func() error {
			return addColumnIfMissing(db, "social_messages", "tournament_id", "INTEGER REFERENCES tournaments(id) ON DELETE CASCADE")
		},
		// Giving up a tournament under way arrived with the tournament's own screen.
		func() error {
			return addColumnIfMissing(db, "tournament_players", "withdrawn", "INTEGER NOT NULL DEFAULT 0")
		},
		// Every tournament has a limit of at most 100 players; older ones had none or up to 256. ponytail: the old
		// column keeps its looser CHECK and NULL, rebuild the table if that ever matters; the API validates new values.
		func() error {
			_, err := db.Exec("UPDATE tournaments SET max_players=100 WHERE max_players IS NULL OR max_players>100")
			return err
		},
		func() error {
			return db.ExecBatch("CREATE INDEX IF NOT EXISTS idx_social_messages_match ON social_messages(match_id) WHERE match_id IS NOT NULL")
		},
		// Pictures and videos in coaching conversations arrived after the first messages.
		func() error {
			for _, c := range [][2]string{{"media_id", "TEXT"}, {"media_type", "TEXT"}, {"media_size", "INTEGER"}, {"media_name", "TEXT"}} {
				if err := addColumnIfMissing(db, "coach_messages", c[0], c[1]); err != nil {
					return err
				}
			}
			return nil
		},
		func() error {
			return db.ExecBatch("CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_messages_media ON coach_messages(media_id) WHERE media_id IS NOT NULL")
		},
		func() error { return coachingSweepMedia(db) },
		func() error { return practiceMigrate(db) },
		func() error { return syncMigrate(db) },
		func() error { return activityMigrate(db) },
		// Installed after context migrations so existing databases get the same indexes.
		func() error { return db.ExecBatch(queryIndexesSQL) },
		func() error { return db.ExecBatch("PRAGMA optimize=0x10002;") },
		// Personal goals and guest accounts were retired: what is left of them goes.
		func() error {
			_, err := db.Exec("DELETE FROM personal_entries WHERE key!='profile'")
			return err
		},
		func() error { _, err := adminDataPurgeGuests(db); return err },
	}
	for _, step := range steps {
		if err := step(); err != nil {
			return err
		}
	}
	return nil
}

// dbAll is db::all: every row as an object; blobs read as null.
func dbAll(c *Conn, query string, args ...any) ([]M, error) {
	stmt, err := c.prepare(query)
	if err != nil {
		return nil, err
	}
	rows, err := stmt.QueryContext(bg, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	names, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	values := make([]any, len(names))
	pointers := make([]any, len(names))
	for i := range values {
		pointers[i] = &values[i]
	}
	out := []M{}
	for rows.Next() {
		if err := rows.Scan(pointers...); err != nil {
			return nil, err
		}
		row := make(M, len(names))
		for i, name := range names {
			switch v := values[i].(type) {
			case []byte:
				row[name] = nil
			default:
				row[name] = v
			}
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

// dbOne is db::one: the first row, or nil.
func dbOne(c *Conn, query string, args ...any) (M, error) {
	rows, err := dbAll(c, query, args...)
	if err != nil || len(rows) == 0 {
		return nil, err
	}
	return rows[0], nil
}

// dbRequired is db::required: the first row, or a 404 with this message. The parameters come last.
func dbRequired(c *Conn, query string, message string, args ...any) (M, error) {
	row, err := dbOne(c, query, args...)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, apiErr(404, message)
	}
	return row, nil
}

func hasColumn(c *Conn, table, column string) (bool, error) {
	rows, err := dbAll(c, fmt.Sprintf("PRAGMA table_info(%s)", table))
	if err != nil {
		return false, err
	}
	for _, r := range rows {
		if eqStr(r["name"], column) {
			return true, nil
		}
	}
	return false, nil
}

// addColumnIfMissing adds a column that older databases lack; `definition` is its type and constraints.
func addColumnIfMissing(c *Conn, table, column, definition string) error {
	has, err := hasColumn(c, table, column)
	if err != nil || has {
		return err
	}
	return c.ExecBatch(fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", table, column, definition))
}
