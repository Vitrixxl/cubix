package main

// Durable, idempotent uploads and an incremental, account-scoped change feed.
// Every mutation bumps the owner's cursor; live sockets stream its changed entities to other devices.

import (
	"fmt"
	"strconv"
	"strings"
)

var syncTables = []string{"sessions", "solves", "learned_cases", "learning_group_orders", "personal_entries"}

func syncMigrate(db *Conn) error {
	existing, err := dbOne(db, "SELECT name FROM sqlite_master WHERE name='sync_changes'")
	if err != nil {
		return err
	}
	fresh := existing == nil
	if err := db.ExecBatch(`BEGIN IMMEDIATE;
        CREATE TABLE IF NOT EXISTS sync_receipts (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          operation_id TEXT NOT NULL, payload TEXT NOT NULL, result TEXT NOT NULL,
          PRIMARY KEY(user_id,operation_id));
        CREATE TABLE IF NOT EXISTS sync_changes (
          seq INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
          kind TEXT NOT NULL, entity_id INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
          UNIQUE(user_id,kind,entity_id));
        CREATE INDEX IF NOT EXISTS idx_sync_owner ON sync_changes(user_id,seq);`); err != nil {
		return err
	}
	for _, table := range syncTables {
		for _, t := range []struct {
			event, row string
			deleted    int
		}{{"INSERT", "NEW", 0}, {"UPDATE", "NEW", 0}, {"DELETE", "OLD", 1}} {
			if err := db.ExecBatch(fmt.Sprintf(`CREATE TRIGGER IF NOT EXISTS sync_%[1]s_%[2]s AFTER %[2]s ON %[1]s
              WHEN %[3]s.user_id IS NOT NULL BEGIN
              INSERT OR REPLACE INTO sync_changes(user_id,kind,entity_id,deleted) VALUES(%[3]s.user_id,'%[1]s',%[3]s.id,%[4]d); END;`, table, t.event, t.row, t.deleted)); err != nil {
				return err
			}
		}
		if fresh {
			if err := db.ExecBatch(fmt.Sprintf("INSERT INTO sync_changes(user_id,kind,entity_id) SELECT user_id,'%s',id FROM %s WHERE user_id IS NOT NULL;", table, table)); err != nil {
				return err
			}
		}
	}
	// Receipts are part of the database too; canonicalize only context fields, never user text.
	if err := db.ExecBatch(`UPDATE sync_receipts SET payload=json_set(payload,'$.body.scrambleType','normal')
        WHERE json_extract(payload,'$.body.scrambleType') IN ('competition','random-moves');
        UPDATE sync_receipts SET result=json_set(result,'$.scramble_type','normal')
        WHERE json_extract(result,'$.scramble_type') IN ('competition','random-moves');`); err != nil {
		return err
	}
	return db.ExecBatch("COMMIT;")
}

// syncCursor: latest change sequence owned by a user; devices compare it with their local cursor.
func syncCursor(db *Conn, uid string) (int64, error) {
	row, err := dbOne(db, "SELECT coalesce(max(seq),0) AS seq FROM sync_changes WHERE user_id=?", uid)
	if err != nil {
		return 0, err
	}
	seq, _ := asInt(idx(row, "seq"))
	return seq, nil
}

// parseJSONText reads a JSON column, the internal error of Rust's `serde_json::from_str(..).map_err(internal)`.
func parseJSONText(v any, fallback string) (any, error) {
	text, ok := asStr(v)
	if !ok {
		text = fallback
	}
	value, err := decodeJSON([]byte(text))
	if err != nil {
		return nil, internal(err)
	}
	return value, nil
}

func syncPull(db *Conn, uid string, after int64, learningGroups bool, journey bool) (M, error) {
	rows, err := dbAll(db, "SELECT * FROM sync_changes WHERE user_id=? AND seq>? ORDER BY seq LIMIT 500", uid, after)
	if err != nil {
		return nil, err
	}
	cursor := after
	if len(rows) > 0 {
		if seq, ok := asInt(rows[len(rows)-1]["seq"]); ok {
			cursor = seq
		}
	}
	more := len(rows) == 500
	// At most one indexed lookup per entity kind, rather than a query per change.
	// JSON binds the bounded page's IDs without generating hundreds of SQL variants.
	type key struct {
		table string
		id    int64
	}
	entities := map[key]M{}
	for _, table := range syncTables {
		if (table == "learning_group_orders" && !learningGroups) || (table == "personal_entries" && !journey) {
			continue
		}
		ids := []string{}
		for _, row := range rows {
			if eqStr(row["kind"], table) && eqInt(row["deleted"], 0) {
				if id, ok := asInt(row["entity_id"]); ok {
					ids = append(ids, strconv.FormatInt(id, 10))
				}
			}
		}
		if len(ids) == 0 {
			continue
		}
		values, err := dbAll(db, fmt.Sprintf("SELECT * FROM %s WHERE id IN (SELECT value FROM json_each(?1)) AND user_id=?2", table), "["+strings.Join(ids, ",")+"]", uid)
		if err != nil {
			return nil, err
		}
		for _, value := range values {
			id, _ := asInt(value["id"])
			entities[key{table, id}] = value
		}
	}
	changes := make([]any, 0, len(rows))
	for _, row := range rows {
		table := str(row["kind"])
		// Older clients interpret unknown entities as solves. Only opted-in clients receive orders.
		if table == "learning_group_orders" && !learningGroups {
			continue
		}
		if table == "personal_entries" && !journey {
			continue
		}
		id, _ := asInt(row["entity_id"])
		k := key{table, id}
		value, found := entities[k]
		delete(entities, k)
		if found {
			var err error
			switch table {
			case "sessions":
				value["case_ids"], err = parseJSONText(value["case_ids"], "[]")
			case "learned_cases":
				value = apiLearnedRow(value)
			case "learning_group_orders":
				value["groups"], err = parseJSONText(value["groups"], "[]")
			case "personal_entries":
				value["value"], err = parseJSONText(value["value"], "null")
			}
			if err != nil {
				return nil, err
			}
		}
		var v any
		if found {
			v = value
		}
		changes = append(changes, M{"kind": table, "id": row["entity_id"], "value": v})
	}
	return M{"changes": changes, "cursor": cursor, "more": more}, nil
}

// copyJSON is Value::clone.
func copyJSON(v any) any {
	switch x := v.(type) {
	case M:
		out := make(M, len(x))
		for k, v := range x {
			out[k] = copyJSON(v)
		}
		return out
	case []any:
		out := make([]any, len(x))
		for i, v := range x {
			out[i] = copyJSON(v)
		}
		return out
	}
	return v
}

func syncPush(db *Conn, state *AppState, uid string, caller *ApiCaller, body any) (any, error) {
	operations, ok := asArray(idx(body, "operations"))
	if !ok || len(operations) == 0 || len(operations) > 100 {
		return nil, validation()
	}
	if err := db.ExecBatch("BEGIN IMMEDIATE"); err != nil {
		return nil, err
	}
	result, err := func() (any, error) {
		results := []any{}
		for _, original := range operations {
			op := copyJSON(original)
			if kind, ok := asStr(idx(idx(op, "body"), "scrambleType")); ok {
				idx(op, "body").(M)["scrambleType"] = practiceNormalizeScrambleType(kind)
			}
			operationID, err := apiString(op, "id", 1, 100)
			if err != nil {
				return nil, err
			}
			payload := encodeJSON(op)
			receipt, err := dbOne(db, "SELECT payload,result FROM sync_receipts WHERE user_id=? AND operation_id=?", uid, operationID)
			if err != nil {
				return nil, err
			}
			if receipt != nil {
				recorded, err := parseJSONText(receipt["payload"], "")
				if err != nil {
					return nil, err
				}
				if !jsonEqual(recorded, op) {
					return nil, apiErr(409, "Operation ID already used with different data")
				}
				value, err := parseJSONText(receipt["result"], "")
				if err != nil {
					return nil, err
				}
				results = append(results, M{"id": operationID, "value": value})
				continue
			}
			method, err := apiString(op, "method", 3, 6)
			if err != nil {
				return nil, err
			}
			path, err := apiString(op, "path", 1, 100)
			if err != nil {
				return nil, err
			}
			solve := false
			if rest, ok := strings.CutPrefix(path, "solves/"); ok {
				id, err := strconv.ParseUint(rest, 10, 64)
				solve = err == nil && id > 0
			}
			if !((method == "POST" && (path == "sessions" || path == "solves")) ||
				(solve && (method == "PATCH" || method == "DELETE")) ||
				(method == "PUT" && (path == "learned" || path == "learning-group-order" || path == "journey"))) {
				return nil, validation()
			}
			value, err := apiRoute(db, state, method, path, map[string]string{}, idx(op, "body"), caller)
			if err != nil {
				// Deletion wins over a late offline edit from another device.
				if e := toApiError(err); e.Status == 404 && solve {
					value, err = nil, nil
				} else {
					return nil, e
				}
			}
			if method == "POST" {
				at, err := apiString(op, "createdAt", 24, 24)
				if err != nil {
					return nil, err
				}
				valid, err := dbOne(db, "SELECT strftime('%Y-%m-%dT%H:%M:%fZ',?) AS at", at)
				if err != nil {
					return nil, err
				}
				if valid == nil || !eqStr(valid["at"], at) {
					return nil, validation()
				}
				var id any
				if n, ok := asInt(idx(value, "id")); ok {
					id = n
				}
				if _, err := db.Exec(fmt.Sprintf("UPDATE %s SET created_at=? WHERE id=? AND user_id=?", path), at, id, uid); err != nil {
					return nil, err
				}
				value.(M)["created_at"] = at
			}
			if _, err := db.Exec("INSERT INTO sync_receipts(user_id,operation_id,payload,result) VALUES(?,?,?,?)", uid, operationID, payload, encodeJSON(value)); err != nil {
				return nil, err
			}
			results = append(results, M{"id": operationID, "value": value})
		}
		return M{"results": results}, nil
	}()
	if err == nil {
		if err := db.ExecBatch("COMMIT"); err != nil {
			return nil, err
		}
		return result, nil
	}
	if rollback := db.ExecBatch("ROLLBACK"); rollback != nil {
		return nil, rollback
	}
	return nil, err
}
