package main

// Personal setup: the puzzles and methods the player can solve, and the best time they already had on each.

import (
	_ "embed"
)

//go:embed embed/method-ids.json
var methodIDsJSON []byte

func journeyTimestamp(db *Conn, v any, name string) error {
	at, err := apiString(v, name, 24, 24)
	if err != nil {
		return err
	}
	row, err := dbOne(db, "SELECT strftime('%Y-%m-%dT%H:%M:%fZ',?,'+0 days') AS at", at)
	if err != nil {
		return err
	}
	if row == nil || !eqStr(row["at"], at) {
		return validation()
	}
	return nil
}

func journeyPut(db *Conn, uid string, body any) (any, error) {
	key, err := apiString(body, "key", 1, 64)
	if err != nil {
		return nil, err
	}
	// The profile is the one entry left: personal goals were retired.
	if key != "profile" {
		return nil, validation()
	}
	v, ok := get(body, "value")
	if !ok {
		return nil, validation()
	}
	if len(encodeJSON(v)) > 2048 {
		return nil, validation()
	}
	// The level is optional: older profiles kept one, setup no longer asks for it.
	if level, ok := get(v, "level"); !eqStr(idx(v, "kind"), "profile") || ok && !(eqStr(level, "new") || eqStr(level, "beginner") || eqStr(level, "intermediate") || eqStr(level, "advanced")) {
		return nil, validation()
	}
	priority, ok := get(v, "priority")
	if !ok {
		return nil, validation()
	}
	if priority != nil {
		if _, err := practiceContextFromBody(M{"puzzle": priority}, nil, false); err != nil {
			return nil, err
		}
	}
	if err := journeyTimestamp(db, v, "completedAt"); err != nil {
		return nil, err
	}
	known, ok := asArray(idx(v, "knownPuzzles"))
	if !ok || len(known) > 11 {
		return nil, validation()
	}
	seen := map[string]bool{}
	for _, p := range known {
		p, ok := asStr(p)
		if !ok || seen[p] {
			return nil, validation()
		}
		seen[p] = true
		if _, err := practiceContextFromBody(M{"puzzle": p}, nil, false); err != nil {
			return nil, err
		}
	}
	methods, err := decodeJSON(methodIDsJSON)
	if err != nil {
		return nil, internal(err)
	}
	if priorityMethod, ok := get(v, "priorityMethod"); ok {
		list, ok := asArray(idx(methods, str(idx(v, "priority"))))
		if !ok || !contains(list, priorityMethod) {
			return nil, validation()
		}
	}
	var learning []any
	learningGiven := false
	if p, ok := get(v, "learningPuzzles"); ok {
		learning, ok = asArray(p)
		if !ok || len(learning) > 11 {
			return nil, validation()
		}
		learningGiven = true
		selected := map[string]bool{}
		for _, p := range learning {
			p, ok := asStr(p)
			if !ok || selected[p] {
				return nil, validation()
			}
			selected[p] = true
			if _, err := practiceContextFromBody(M{"puzzle": p}, nil, false); err != nil {
				return nil, err
			}
		}
		if (priority == nil && len(learning) > 0) || (priority != nil && !contains(learning, priority)) {
			return nil, validation()
		}
	}
	for _, field := range []struct {
		name    string
		puzzles []any
		given   bool
	}{{"knownMethods", known, true}, {"learningMethods", learning, learningGiven}} {
		value, ok := get(v, field.name)
		if !ok {
			continue
		}
		object, ok := asObject(value)
		if !ok || !field.given {
			return nil, validation()
		}
		for puzzle, list := range object {
			if !contains(field.puzzles, puzzle) {
				return nil, validation()
			}
			list, ok := asArray(list)
			if !ok {
				return nil, validation()
			}
			available, ok := asArray(idx(methods, puzzle))
			if !ok {
				return nil, validation()
			}
			selected := map[string]bool{}
			for _, id := range list {
				s := str(id)
				if !contains(available, id) || selected[s] {
					return nil, validation()
				}
				selected[s] = true
			}
		}
	}
	// The best single they had before Qbix, per known puzzle, in milliseconds: optional.
	if bests, ok := get(v, "bests"); ok {
		object, ok := asObject(bests)
		if !ok {
			return nil, validation()
		}
		for puzzle, ms := range object {
			n, ok := asUint(ms)
			if !contains(known, puzzle) || !ok || n < 1 || n >= 86_400_000 {
				return nil, validation()
			}
		}
	}
	// Separate statements keep the change-feed trigger's REPLACE policy effective on updates.
	existing, err := dbOne(db, "SELECT id FROM personal_entries WHERE user_id=? AND key=?", uid, key)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		_, err = db.Exec("UPDATE personal_entries SET value=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=? AND key=?", encodeJSON(v), uid, key)
	} else {
		_, err = db.Exec("INSERT INTO personal_entries(user_id,key,value) VALUES(?,?,?)", uid, key, encodeJSON(v))
	}
	if err != nil {
		return nil, err
	}
	row, err := dbRequired(db, "SELECT * FROM personal_entries WHERE user_id=? AND key=?", "Unknown entry", uid, key)
	if err != nil {
		return nil, err
	}
	row["value"] = v
	return row, nil
}

// journeyDeclaredBests: the best singles a player gave at setup, by puzzle, in milliseconds.
func journeyDeclaredBests(db *Conn, uid string) (map[string]float64, error) {
	entry, err := dbOne(db, "SELECT value FROM personal_entries WHERE user_id=? AND key='profile'", uid)
	if err != nil {
		return nil, err
	}
	out := map[string]float64{}
	if entry == nil {
		return out, nil
	}
	text, ok := asStr(entry["value"])
	if !ok {
		return out, nil
	}
	value, err := decodeJSON([]byte(text))
	if err != nil {
		return out, nil
	}
	bests, _ := asObject(idx(value, "bests"))
	for k, v := range bests {
		if f, ok := asFloat(v); ok {
			out[k] = f
		}
	}
	return out, nil
}
