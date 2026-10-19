-- Equality filters precede the ordering columns: histories need no temporary sort.
CREATE INDEX IF NOT EXISTS idx_solves_context_history
    ON solves(user_id,puzzle_id,solve_mode,created_at);
CREATE INDEX IF NOT EXISTS idx_solves_training_history
    ON solves(user_id,puzzle_id,solve_mode,case_id,created_at) WHERE case_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_solves_case_history
    ON solves(user_id,case_id,solve_mode,created_at);
CREATE INDEX IF NOT EXISTS idx_solves_session_history
    ON solves(session_id,user_id,created_at);
-- An account's solves since a day: activity, coaching history, the administration's counts.
CREATE INDEX IF NOT EXISTS idx_solves_user_created ON solves(user_id,created_at);
-- No query reads these: the ones above lead with the same columns (user_id; session_id for its foreign key), and
-- nothing filters by cube_size or by case_id without the account.
DROP INDEX IF EXISTS idx_solves_owner;
DROP INDEX IF EXISTS idx_solves_cube;
DROP INDEX IF EXISTS idx_solves_case;
DROP INDEX IF EXISTS idx_solves_session;
DROP INDEX IF EXISTS idx_sessions_owner;
DROP INDEX IF EXISTS idx_sessions_cube;
-- `player_a=? OR player_b=?` takes one index per side.
CREATE INDEX IF NOT EXISTS idx_matches_player_b ON matches(player_b);
CREATE INDEX IF NOT EXISTS idx_daily_results_user ON daily_results(user_id,event,day);
-- Foreign keys: deleting an account or a tournament finds its rows without a scan.
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id,expires_at);
CREATE INDEX IF NOT EXISTS idx_social_messages_sender ON social_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_social_messages_tournament ON social_messages(tournament_id) WHERE tournament_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coach_messages_sender ON coach_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_shared_solves_user ON shared_solves(user_id);
-- Read messages disappear from this small index; unread counts never scan the whole chat.
CREATE INDEX IF NOT EXISTS idx_coach_messages_unread
    ON coach_messages(conversation_id,sender_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_coach_bookings_pair
    ON coach_bookings(coach_id,student_id,status,ends_at,starts_at);
CREATE INDEX IF NOT EXISTS idx_coach_reviews_pair
    ON coach_reviews(coach_id,student_id,rating);
