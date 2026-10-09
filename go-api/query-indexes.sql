-- Equality filters precede the ordering columns: histories need no temporary sort.
CREATE INDEX IF NOT EXISTS idx_solves_context_history
    ON solves(user_id,puzzle_id,solve_mode,created_at);
CREATE INDEX IF NOT EXISTS idx_solves_training_history
    ON solves(user_id,puzzle_id,solve_mode,case_id,created_at) WHERE case_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_solves_case_history
    ON solves(user_id,case_id,solve_mode,created_at);
CREATE INDEX IF NOT EXISTS idx_solves_session_history
    ON solves(session_id,user_id,created_at);
-- Read messages disappear from this small index; unread counts never scan the whole chat.
CREATE INDEX IF NOT EXISTS idx_coach_messages_unread
    ON coach_messages(conversation_id,sender_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_coach_bookings_pair
    ON coach_bookings(coach_id,student_id,status,ends_at,starts_at);
CREATE INDEX IF NOT EXISTS idx_coach_reviews_pair
    ON coach_reviews(coach_id,student_id,rating);
