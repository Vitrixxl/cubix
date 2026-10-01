
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mode TEXT NOT NULL,
      case_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS solves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
      case_id TEXT,
      time_ms INTEGER NOT NULL,
      penalty TEXT NOT NULL DEFAULT 'none',
      scramble TEXT,
      comment TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_solves_case ON solves(case_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_solves_session ON solves(session_id);
    CREATE TABLE IF NOT EXISTS learned_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL,
      learned INTEGER NOT NULL DEFAULT 1 CHECK(learned IN (0, 1)),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(user_id, case_id)
    );

    CREATE TABLE IF NOT EXISTS learning_group_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      track TEXT NOT NULL CHECK(track IN ('F2L', 'OLL', 'PLL')),
      groups TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(user_id, track)
    );


    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS personal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(user_id, key)
    );
    CREATE TABLE IF NOT EXISTS auth_tokens (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_auth_expiry ON auth_tokens(expires_at);


CREATE TABLE IF NOT EXISTS admin_tokens (
 token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, password_version TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_expiry ON admin_tokens(expires_at);
-- The single admin token (`cubix-api admin-token`): its SHA-256 only, and the version admin
-- sessions are bound to.
CREATE TABLE IF NOT EXISTS admin_access (
 id INTEGER PRIMARY KEY CHECK(id=1), digest TEXT NOT NULL, version TEXT NOT NULL, created_at INTEGER NOT NULL
);

-- Coaching (coaching.rs). Every time is milliseconds since the Unix epoch.
-- A request to become a coach, with the e-mail address the team answers on.
CREATE TABLE IF NOT EXISTS coach_applications (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 email TEXT NOT NULL,
 events TEXT NOT NULL DEFAULT '[]',
 experience TEXT NOT NULL DEFAULT '',
 message TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 created_at INTEGER NOT NULL,
 decided_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_coach_applications_user ON coach_applications(user_id, created_at);
-- A coach's public profile and weekly availability: `windows` is a JSON list of
-- {weekday (0 = Monday), start, end} in minutes of the day, in the coach's `timezone`.
CREATE TABLE IF NOT EXISTS coaches (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
 accepting INTEGER NOT NULL DEFAULT 1 CHECK(accepting IN (0, 1)),
 headline TEXT NOT NULL DEFAULT '',
 bio TEXT NOT NULL DEFAULT '',
 events TEXT NOT NULL DEFAULT '[]',
 languages TEXT NOT NULL DEFAULT '[]',
 price_cents INTEGER NOT NULL DEFAULT 0,
 session_minutes INTEGER NOT NULL DEFAULT 60,
 timezone TEXT NOT NULL DEFAULT 'UTC',
 windows TEXT NOT NULL DEFAULT '[]',
 days_off TEXT NOT NULL DEFAULT '[]',
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS coach_bookings (
 id TEXT PRIMARY KEY,
 coach_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 starts_at INTEGER NOT NULL,
 ends_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'booked' CHECK(status IN ('booked','cancelled')),
 note TEXT NOT NULL DEFAULT '',
 price_cents INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL,
 cancelled_at INTEGER,
 cancelled_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_coach_bookings_coach ON coach_bookings(coach_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_coach_bookings_student ON coach_bookings(student_id, starts_at);
CREATE TABLE IF NOT EXISTS coach_reviews (
 booking_id TEXT PRIMARY KEY REFERENCES coach_bookings(id) ON DELETE CASCADE,
 coach_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
 comment TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_coach_reviews_coach ON coach_reviews(coach_id, created_at);
-- One conversation per coach and student; `note` is the coach's private notes on the student.
CREATE TABLE IF NOT EXISTS coach_conversations (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 coach_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 note TEXT NOT NULL DEFAULT '',
 updated_at INTEGER NOT NULL,
 UNIQUE(coach_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_coach_conversations_student ON coach_conversations(student_id);
CREATE TABLE IF NOT EXISTS coach_messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 conversation_id INTEGER NOT NULL REFERENCES coach_conversations(id) ON DELETE CASCADE,
 sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 body TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 read_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_coach_messages_conversation ON coach_messages(conversation_id, id);
