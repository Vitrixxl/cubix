
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
      solution TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_solves_case ON solves(case_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_solves_session ON solves(session_id);
    CREATE TABLE IF NOT EXISTS learned_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL,
      learned INTEGER NOT NULL DEFAULT 1 CHECK(learned IN (0, 1)),
      alg TEXT,
      algs TEXT,
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
-- A coach's public profile and availability, in minutes of the day on the coach's `timezone`: `windows` is a JSON
-- list of weekly openings {weekday (0 = Monday), start, end, from?, until?} (dates bounding the repetition),
-- `days_off` whole dates, `overrides` one day's {date, start, end, open}: extra hours, or hours taken back.
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
 overrides TEXT NOT NULL DEFAULT '[]',
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
 cancelled_by TEXT,
 -- Another time the coach offers, until the student takes it or turns it down.
 proposed_start INTEGER,
 proposed_end INTEGER
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
 read_at INTEGER,
 media_id TEXT,
 media_type TEXT,
 media_size INTEGER,
 media_name TEXT
);
CREATE INDEX IF NOT EXISTS idx_coach_messages_conversation ON coach_messages(conversation_id, id);

-- Community (social.rs). Every time is milliseconds since the Unix epoch. The former `friendships` and
-- `chat_messages` tables are dropped at start-up (db.rs): these names are new.
-- A friend request from `user_id` to `friend_id`, then the friendship once accepted (one row per pair).
CREATE TABLE IF NOT EXISTS friends (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 friend_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted')),
 created_at INTEGER NOT NULL,
 accepted_at INTEGER,
 PRIMARY KEY(user_id, friend_id)
);
CREATE INDEX IF NOT EXISTS idx_friends_friend ON friends(friend_id);
CREATE TABLE IF NOT EXISTS social_groups (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL
);
-- `invited`: asked to join, not in yet. Owners and admins run the group: invite, remove, organise tournaments.
CREATE TABLE IF NOT EXISTS group_members (
 group_id INTEGER NOT NULL REFERENCES social_groups(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('owner','admin','member','invited')),
 invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 joined_at INTEGER NOT NULL,
 PRIMARY KEY(group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
-- A conversation between two friends (`user_a` < `user_b`), or a group's.
CREATE TABLE IF NOT EXISTS social_conversations (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 group_id INTEGER REFERENCES social_groups(id) ON DELETE CASCADE,
 user_a TEXT REFERENCES users(id) ON DELETE CASCADE,
 user_b TEXT REFERENCES users(id) ON DELETE CASCADE,
 updated_at INTEGER NOT NULL,
 UNIQUE(user_a, user_b),
 UNIQUE(group_id)
);
CREATE INDEX IF NOT EXISTS idx_social_conversations_b ON social_conversations(user_b);
CREATE TABLE IF NOT EXISTS social_messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 conversation_id INTEGER NOT NULL REFERENCES social_conversations(id) ON DELETE CASCADE,
 sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 body TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 -- A battle or a tournament shown in the conversation as a card (body empty).
 match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
 tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_social_messages_conversation ON social_messages(conversation_id, id);
-- The last message each member has read in a conversation.
CREATE TABLE IF NOT EXISTS social_reads (
 conversation_id INTEGER NOT NULL REFERENCES social_conversations(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 message_id INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(conversation_id, user_id)
);

-- Tournaments and matches (tournament.rs). A tournament without a group is open to every account and created by the
-- administration; a group's is created by its owner or admins for its members. Matches are races of sets on the same
-- scrambles: `points` solves won take a set, `sets` sets won take the match.
CREATE TABLE IF NOT EXISTS tournaments (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 event TEXT NOT NULL,
 group_id INTEGER REFERENCES social_groups(id) ON DELETE CASCADE,
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 starts_at INTEGER NOT NULL,
 points INTEGER NOT NULL CHECK(points BETWEEN 1 AND 15),
 sets INTEGER NOT NULL CHECK(sets BETWEEN 1 AND 9),
 max_players INTEGER NOT NULL DEFAULT 100 CHECK(max_players BETWEEN 2 AND 100),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','running','finished','cancelled')),
 round INTEGER NOT NULL DEFAULT 0,
 rounds INTEGER NOT NULL DEFAULT 0,
 winner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at INTEGER NOT NULL,
 started_at INTEGER,
 finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tournaments_group ON tournaments(group_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_tournaments_due ON tournaments(starts_at) WHERE status='open';
CREATE TABLE IF NOT EXISTS tournament_players (
 tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 seed INTEGER,
 registered_at INTEGER NOT NULL,
 -- Gave up once the tournament had started: their matches from then on go to their opponents.
 withdrawn INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(tournament_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tournament_players_user ON tournament_players(user_id);
-- A match of a tournament (its `round`, from 1, and `slot` in that round), or a battle launched in a group.
-- `waiting`: its players are not both known yet; `ready`: they are, nothing played; `live`: under way.
CREATE TABLE IF NOT EXISTS matches (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
 group_id INTEGER REFERENCES social_groups(id) ON DELETE CASCADE,
 round INTEGER NOT NULL DEFAULT 1,
 slot INTEGER NOT NULL DEFAULT 0,
 event TEXT NOT NULL,
 points INTEGER NOT NULL,
 sets INTEGER NOT NULL,
 player_a TEXT REFERENCES users(id) ON DELETE SET NULL,
 player_b TEXT REFERENCES users(id) ON DELETE SET NULL,
 status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','ready','live','done','cancelled')),
 winner TEXT REFERENCES users(id) ON DELETE SET NULL,
 forfeit INTEGER NOT NULL DEFAULT 0,
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at INTEGER NOT NULL,
 started_at INTEGER,
 finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id, round, slot);
CREATE INDEX IF NOT EXISTS idx_matches_group ON matches(group_id, created_at);
CREATE INDEX IF NOT EXISTS idx_matches_players ON matches(player_a, player_b);
-- Each solve of a match: its scramble, then each player's time once they solved it.
CREATE TABLE IF NOT EXISTS match_solves (
 match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
 number INTEGER NOT NULL,
 scramble TEXT NOT NULL,
 a_ms INTEGER,
 a_penalty TEXT,
 b_ms INTEGER,
 b_penalty TEXT,
 PRIMARY KEY(match_id, number)
);
CREATE TABLE IF NOT EXISTS daily_results (
 day TEXT NOT NULL,
 event TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 time_ms INTEGER NOT NULL,
 penalty TEXT NOT NULL DEFAULT 'none',
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 verified INTEGER NOT NULL DEFAULT 0,
 solution TEXT,
 PRIMARY KEY(day, event, user_id)
);
CREATE TABLE IF NOT EXISTS daily_cancelled (
 day TEXT NOT NULL,
 event TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 time_ms INTEGER NOT NULL,
 penalty TEXT NOT NULL,
 cancelled_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(day, event, user_id)
);
