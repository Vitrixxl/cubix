
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


    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
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
