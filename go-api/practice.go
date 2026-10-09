package main

// Stable puzzle / scramble / solve-mode labels, shared with the shared puzzle registry.

import (
	_ "embed"
	"fmt"
	"strconv"
	"strings"
	"sync"
)

//go:embed embed/puzzles.json
var puzzlesJSON []byte

var practiceRegistry = sync.OnceValue(func() any {
	v, err := decodeJSON(puzzlesJSON)
	if err != nil {
		panic("puzzle registry: " + err.Error())
	}
	return v
})

func practicePuzzle(id string) (M, error) {
	list, _ := asArray(idx(practiceRegistry(), "puzzles"))
	for _, p := range list {
		if eqStr(idx(p, "id"), id) {
			return p.(M), nil
		}
	}
	return nil, validation()
}

// practiceIsPuzzle: whether the registry still has this puzzle: rows of a retired one (Clock) stay in the database,
// unlisted.
func practiceIsPuzzle(id string) bool {
	_, err := practicePuzzle(id)
	return err == nil
}

func practiceText(value any, key string) (string, bool) {
	return asStr(idx(value, key))
}

// practiceSupplied: the text at `key`, absent, or a validation error for any other value.
func practiceSupplied(value any, key string) (*string, error) {
	v, ok := get(value, key)
	if !ok {
		return nil, nil
	}
	s, ok := asStr(v)
	if !ok {
		return nil, validation()
	}
	return &s, nil
}

func practiceNormalizeScrambleType(kind string) string {
	switch kind {
	case "competition", "random-moves":
		return "normal"
	}
	return kind
}

func practicePuzzleOf(value any) string {
	if id, ok := practiceText(value, "puzzle_id"); ok {
		return id
	}
	size, ok := asInt(idx(value, "cube_size"))
	if !ok {
		size = 3
	}
	return strings.Repeat(strconv.FormatInt(size, 10), 3)
}

type PracticeContext struct {
	puzzle       string
	solveMode    string
	scrambleType string
}

func practiceContextOf(value any) PracticeContext {
	mode, ok := practiceText(value, "solve_mode")
	if !ok {
		mode = "standard"
	}
	kind, ok := practiceText(value, "scramble_type")
	if !ok {
		_, algorithms := asArray(idx(value, "algorithms"))
		if eqStr(idx(value, "mode"), "training") || algorithms || str(idx(value, "case_id")) != "" {
			kind = "case"
		} else {
			kind = "normal"
		}
	}
	return PracticeContext{puzzle: practicePuzzleOf(value), solveMode: mode, scrambleType: practiceNormalizeScrambleType(kind)}
}

// practiceContextFromBody: `fallback` is the session or case the body inherits from, or nil.
func practiceContextFromBody(body any, fallback any, training bool) (PracticeContext, error) {
	var legacySize *int64
	if v, ok := get(body, "cubeSize"); ok {
		s, ok := asInt(v)
		if !ok || s < 2 || s > 7 {
			return PracticeContext{}, validation()
		}
		legacySize = &s
	}
	var inherited *PracticeContext
	if fallback != nil {
		c := practiceContextOf(fallback)
		inherited = &c
	}
	puzzle, err := practiceSupplied(body, "puzzle")
	if err != nil {
		return PracticeContext{}, err
	}
	var id string
	switch {
	case puzzle != nil:
		id = *puzzle
	case legacySize != nil:
		id = strings.Repeat(strconv.FormatInt(*legacySize, 10), 3)
	case inherited != nil:
		id = inherited.puzzle
	default:
		id = "333"
	}
	info, err := practicePuzzle(id)
	if err != nil {
		return PracticeContext{}, err
	}
	if legacySize != nil {
		if size, ok := asInt(info["cubeSize"]); !ok || size != *legacySize {
			return PracticeContext{}, apiErr(400, "Puzzle and cube size do not match.")
		}
	}
	supplied, err := practiceSupplied(body, "solveMode")
	if err != nil {
		return PracticeContext{}, err
	}
	mode := "standard"
	if supplied != nil {
		mode = *supplied
	} else if inherited != nil {
		mode = inherited.solveMode
	}
	supplied, err = practiceSupplied(body, "scrambleType")
	if err != nil {
		return PracticeContext{}, err
	}
	kind := "normal"
	if training {
		kind = "case"
	}
	if supplied != nil {
		kind = *supplied
	} else if inherited != nil {
		kind = inherited.scrambleType
	}
	kind = practiceNormalizeScrambleType(kind)
	if err := practiceValidateMode(mode); err != nil {
		return PracticeContext{}, err
	}
	scrambles, _ := asArray(info["scrambles"])
	if (training && kind != "case") || (!training && !contains(scrambles, kind)) {
		return PracticeContext{}, apiErr(400, "Scramble type and puzzle do not match.")
	}
	return PracticeContext{puzzle: id, solveMode: mode, scrambleType: kind}, nil
}

// cubeSize is Context::cube_size: nil for a puzzle that is not a cube.
func (c PracticeContext) cubeSize() any {
	info, err := practicePuzzle(c.puzzle)
	if err != nil {
		return nil
	}
	if size, ok := asInt(info["cubeSize"]); ok {
		return size
	}
	return nil
}

func practiceValidateMode(mode string) error {
	modes, _ := asArray(idx(practiceRegistry(), "solveModes"))
	for _, m := range modes {
		if eqStr(idx(m, "id"), mode) {
			return nil
		}
	}
	return validation()
}

type PracticeFilter struct {
	puzzle       string
	solveMode    string
	scrambleType *string
}

func practiceQuery(query map[string]string) (PracticeFilter, error) {
	id, ok := query["puzzle"]
	if !ok {
		size := int64(3)
		if s, ok := query["cubeSize"]; ok {
			n, err := strconv.ParseInt(s, 10, 64)
			if err != nil {
				return PracticeFilter{}, validation()
			}
			size = n
		}
		if size < 2 || size > 7 {
			return PracticeFilter{}, validation()
		}
		id = strings.Repeat(strconv.FormatInt(size, 10), 3)
	}
	info, err := practicePuzzle(id)
	if err != nil {
		return PracticeFilter{}, err
	}
	mode, ok := query["solveMode"]
	if !ok {
		mode = "standard"
	}
	if err := practiceValidateMode(mode); err != nil {
		return PracticeFilter{}, err
	}
	var kind *string
	if k, ok := query["scrambleType"]; ok {
		k = practiceNormalizeScrambleType(k)
		kind = &k
		scrambles, _ := asArray(info["scrambles"])
		if k != "case" && !contains(scrambles, k) {
			return PracticeFilter{}, validation()
		}
	}
	return PracticeFilter{puzzle: id, solveMode: mode, scrambleType: kind}, nil
}

func practiceCatalog(values any, filter PracticeFilter) []any {
	list, _ := asArray(values)
	out := []any{}
	for _, c := range list {
		if practicePuzzleOf(c) == filter.puzzle {
			out = append(out, c)
		}
	}
	return out
}

func practiceMigrate(db *Conn) error {
	if err := db.ExecBatch("BEGIN IMMEDIATE"); err != nil {
		return err
	}
	err := func() error {
		for _, table := range []string{"sessions", "solves"} {
			columns, err := dbAll(db, fmt.Sprintf("PRAGMA table_info(%s)", table))
			if err != nil {
				return err
			}
			has := func(name string) bool {
				for _, c := range columns {
					if eqStr(c["name"], name) {
						return true
					}
				}
				return false
			}
			if !has("puzzle_id") {
				// Promote numeric cube size to a puzzle identifier before making cube_size nullable.
				if err := db.ExecBatch(strings.ReplaceAll(`ALTER TABLE {table} ADD COLUMN puzzle_id TEXT NOT NULL DEFAULT '333';
                    UPDATE {table} SET puzzle_id=CAST(cube_size AS TEXT)||CAST(cube_size AS TEXT)||CAST(cube_size AS TEXT);
                    DROP INDEX IF EXISTS idx_{table}_cube;
                    ALTER TABLE {table} DROP COLUMN cube_size;
                    ALTER TABLE {table} ADD COLUMN cube_size INTEGER CHECK(cube_size BETWEEN 2 AND 7);
                    UPDATE {table} SET cube_size=CAST(substr(puzzle_id,1,1) AS INTEGER);
                    ALTER TABLE {table} ADD COLUMN solve_mode TEXT NOT NULL DEFAULT 'standard';
                    ALTER TABLE {table} ADD COLUMN scramble_type TEXT NOT NULL DEFAULT 'normal';`, "{table}", table)); err != nil {
					return err
				}
				training := "case_id IS NOT NULL AND case_id<>''"
				if table == "sessions" {
					training = "mode='training'"
				}
				if err := db.ExecBatch(fmt.Sprintf("UPDATE %s SET scramble_type='case' WHERE %s", table, training)); err != nil {
					return err
				}
			}
			// Replace the old column default too: even an INSERT omitting the field must store normal.
			legacy := false
			for _, c := range columns {
				if eqStr(c["name"], "scramble_type") && eqStr(c["dflt_value"], "'random-moves'") {
					legacy = true
				}
			}
			if legacy {
				err = db.ExecBatch(strings.ReplaceAll(`DROP INDEX IF EXISTS idx_{table}_practice;
                    ALTER TABLE {table} RENAME COLUMN scramble_type TO legacy_scramble_type;
                    ALTER TABLE {table} ADD COLUMN scramble_type TEXT NOT NULL DEFAULT 'normal';
                    UPDATE {table} SET scramble_type=CASE WHEN legacy_scramble_type IN ('competition','random-moves') THEN 'normal' ELSE legacy_scramble_type END;
                    ALTER TABLE {table} DROP COLUMN legacy_scramble_type;`, "{table}", table))
			} else {
				err = db.ExecBatch(fmt.Sprintf("UPDATE %s SET scramble_type='normal' WHERE scramble_type IN ('competition','random-moves');", table))
			}
			if err != nil {
				return err
			}
			if err := db.ExecBatch(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_%s_practice ON %s(user_id,puzzle_id,solve_mode,scramble_type,created_at)", table, table)); err != nil {
				return err
			}
		}
		return nil
	}()
	if err == nil {
		return db.ExecBatch("COMMIT")
	}
	_ = db.ExecBatch("ROLLBACK")
	return err
}

// practiceIsEvent: whether an event of the registry (`333`, `333oh`…) has this id.
func practiceIsEvent(id string) bool {
	events, _ := asArray(idx(practiceRegistry(), "events"))
	for _, e := range events {
		if eqStr(idx(e, "id"), id) {
			return true
		}
	}
	return false
}
