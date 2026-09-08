
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
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_solves_case ON solves(case_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_solves_session ON solves(session_id);


    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      bio TEXT NOT NULL DEFAULT '',
      password_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS auth_tokens (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_auth_expiry ON auth_tokens(expires_at);


    CREATE TABLE IF NOT EXISTS friendships (
      id INTEGER PRIMARY KEY,
      user_a TEXT NOT NULL REFERENCES users(id),
      user_b TEXT NOT NULL REFERENCES users(id),
      requested_by TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted')),
      UNIQUE(user_a, user_b), CHECK(user_a < user_b)
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY,
      sender_id TEXT NOT NULL REFERENCES users(id),
      recipient_id TEXT NOT NULL REFERENCES users(id),
      text TEXT NOT NULL,
      solve_snapshot TEXT,
      client_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(sender_id, client_id)
    );
    CREATE INDEX IF NOT EXISTS idx_chat_pair ON chat_messages(sender_id, recipient_id, id);
