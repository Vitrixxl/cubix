package main

// Ported with the foundation because Db::open calls it; the ADMIN port completes this file.

// adminDataPurge removes an account and everything it owns, inside the caller's transaction: its solves and sessions
// (counted), then the rest. Finished duels stay for the opponent under the name `deleted`; request log rows lose the
// account id, except the audit rows of administrator actions on it.
func adminDataPurge(tx *Conn, user string) (solves int64, sessions int64, err error) {
	if solves, err = tx.Exec("DELETE FROM solves WHERE user_id=?", user); err != nil {
		return
	}
	if sessions, err = tx.Exec("DELETE FROM sessions WHERE user_id=?", user); err != nil {
		return
	}
	for _, query := range []string{
		"DELETE FROM learned_cases WHERE user_id=?",
		"DELETE FROM learning_group_orders WHERE user_id=?",
		"DELETE FROM personal_entries WHERE user_id=?",
		"DELETE FROM sync_receipts WHERE user_id=?",
		// Last: the deletions above journal their changes here.
		"DELETE FROM sync_changes WHERE user_id=?",
		"DELETE FROM auth_tokens WHERE user_id=?",
		"DELETE FROM user_activity WHERE user_id=?",
		"DELETE FROM traffic_daily_users WHERE user_id=?",
		"UPDATE duel_games SET player1_id=NULL,player1_name='deleted' WHERE player1_id=?",
		"UPDATE duel_games SET player2_id=NULL,player2_name='deleted' WHERE player2_id=?",
		"UPDATE request_log SET user_id=NULL WHERE user_id=? AND kind NOT IN ('admin','account')",
		"DELETE FROM users WHERE id=?",
	} {
		if _, err = tx.Exec(query, user); err != nil {
			return
		}
	}
	return
}

// adminDataPurgeGuests: guest accounts were retired; those left (no password) go with everything they own, at startup.
func adminDataPurgeGuests(db *Conn) (int, error) {
	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	rows, err := dbAll(db, "SELECT id FROM users WHERE password_hash IS NULL")
	if err != nil {
		return 0, err
	}
	guests := 0
	for _, row := range rows {
		if id, ok := asStr(row["id"]); ok {
			if _, _, err := adminDataPurge(db, id); err != nil {
				return 0, err
			}
			guests++
		}
	}
	return guests, tx.Commit()
}
