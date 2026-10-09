package main

// JSON values as serde_json handles them: no Rust module of its own.

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"strconv"
	"strings"
	"unicode/utf8"
)

// M is a JSON object (serde_json's Map).
type M = map[string]any

// decodeJSON parses JSON as serde_json::from_slice does: one value, valid UTF-8, numbers kept as
// they were written (json.Number), so integers and floats stay apart.
func decodeJSON(data []byte) (any, error) {
	if !utf8.Valid(data) {
		return nil, errors.New("invalid UTF-8")
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return nil, err
	}
	if _, err := dec.Token(); err != io.EOF {
		return nil, errors.New("trailing characters")
	}
	return v, nil
}

// encodeJSON writes a value as serde_json's to_string: compact, without HTML escaping.
func encodeJSON(v any) string {
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		internal(err)
		return "null"
	}
	return strings.TrimSuffix(b.String(), "\n")
}

// get is Value::get: the member of an object, if it is one and has it.
func get(v any, key string) (any, bool) {
	o, ok := v.(M)
	if !ok {
		return nil, false
	}
	value, ok := o[key]
	return value, ok
}

// idx is Value's index: the member, or null.
func idx(v any, key string) any {
	value, _ := get(v, key)
	return value
}

func asStr(v any) (string, bool) {
	s, ok := v.(string)
	return s, ok
}

// str is `as_str().unwrap_or("")`.
func str(v any) string {
	s, _ := v.(string)
	return s
}

func asBool(v any) (bool, bool) {
	b, ok := v.(bool)
	return b, ok
}

func asArray(v any) ([]any, bool) {
	a, ok := v.([]any)
	return a, ok
}

func asObject(v any) (M, bool) {
	o, ok := v.(M)
	return o, ok
}

func integerLiteral(s string) bool {
	return !strings.ContainsAny(s, ".eE")
}

// asInt is Value::as_i64: integers only, never 1.5 nor 1.0.
func asInt(v any) (int64, bool) {
	switch n := v.(type) {
	case int64:
		return n, true
	case int:
		return int64(n), true
	case uint64:
		if n <= 1<<63-1 {
			return int64(n), true
		}
	case json.Number:
		if integerLiteral(string(n)) {
			i, err := strconv.ParseInt(string(n), 10, 64)
			return i, err == nil
		}
	}
	return 0, false
}

// asUint is Value::as_u64: non-negative integers only.
func asUint(v any) (uint64, bool) {
	switch n := v.(type) {
	case int64:
		return uint64(n), n >= 0
	case int:
		return uint64(n), n >= 0
	case uint64:
		return n, true
	case json.Number:
		if integerLiteral(string(n)) {
			u, err := strconv.ParseUint(string(n), 10, 64)
			return u, err == nil
		}
	}
	return 0, false
}

// asFloat is Value::as_f64: any number.
func asFloat(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case int64:
		return float64(n), true
	case int:
		return float64(n), true
	case uint64:
		return float64(n), true
	case json.Number:
		f, err := strconv.ParseFloat(string(n), 64)
		return f, err == nil
	}
	return 0, false
}

// eqStr is `value == "text"`.
func eqStr(v any, s string) bool {
	t, ok := v.(string)
	return ok && t == s
}

// eqInt is `value == 2`: an integer of that value.
func eqInt(v any, n int64) bool {
	i, ok := asInt(v)
	return ok && i == n
}

type number struct {
	float bool
	neg   bool
	i     int64
	u     uint64
	f     float64
}

func numberOf(v any) (number, bool) {
	switch n := v.(type) {
	case float64:
		return number{float: true, f: n}, true
	case json.Number:
		if !integerLiteral(string(n)) {
			f, err := strconv.ParseFloat(string(n), 64)
			return number{float: true, f: f}, err == nil
		}
		if u, err := strconv.ParseUint(string(n), 10, 64); err == nil {
			return number{u: u}, true
		}
		if i, err := strconv.ParseInt(string(n), 10, 64); err == nil {
			return number{neg: i < 0, i: i}, true
		}
		f, err := strconv.ParseFloat(string(n), 64)
		return number{float: true, f: f}, err == nil
	case int64:
		if n < 0 {
			return number{neg: true, i: n}, true
		}
		return number{u: uint64(n)}, true
	case int:
		return numberOf(int64(n))
	case uint64:
		return number{u: n}, true
	}
	return number{}, false
}

// jsonEqual is serde_json's Value equality: 1 and 1.0 differ.
func jsonEqual(a, b any) bool {
	if na, ok := numberOf(a); ok {
		nb, ok := numberOf(b)
		if !ok || na.float != nb.float {
			return false
		}
		if na.float {
			return na.f == nb.f
		}
		return na.neg == nb.neg && na.i == nb.i && na.u == nb.u
	}
	switch x := a.(type) {
	case nil:
		return b == nil
	case bool:
		y, ok := b.(bool)
		return ok && x == y
	case string:
		y, ok := b.(string)
		return ok && x == y
	case []any:
		y, ok := b.([]any)
		if !ok || len(x) != len(y) {
			return false
		}
		for i := range x {
			if !jsonEqual(x[i], y[i]) {
				return false
			}
		}
		return true
	case M:
		y, ok := b.(M)
		if !ok || len(x) != len(y) {
			return false
		}
		for k, v := range x {
			w, ok := y[k]
			if !ok || !jsonEqual(v, w) {
				return false
			}
		}
		return true
	}
	return false
}

// contains is `list.contains(value)` over JSON values.
func contains(list []any, v any) bool {
	for _, item := range list {
		if jsonEqual(item, v) {
			return true
		}
	}
	return false
}

// parseQuery reads a query string as serde_urlencoded into a HashMap: `+` is a space, invalid
// escapes stay as written, the last of repeated keys wins.
func parseQuery(raw string) map[string]string {
	out := map[string]string{}
	for _, pair := range strings.Split(raw, "&") {
		if pair == "" {
			continue
		}
		key, value, _ := strings.Cut(pair, "=")
		out[formDecode(key)] = formDecode(value)
	}
	return out
}

func formDecode(s string) string {
	return strings.ToValidUTF8(string(percentDecode(strings.ReplaceAll(s, "+", " "))), "�")
}

// percentDecode is percent_encoding::percent_decode_str: invalid escapes stay as written.
func percentDecode(s string) []byte {
	out := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		if s[i] == '%' && i+2 < len(s) {
			if h, ok := unhex(s[i+1]); ok {
				if l, ok := unhex(s[i+2]); ok {
					out = append(out, h<<4|l)
					i += 2
					continue
				}
			}
		}
		out = append(out, s[i])
	}
	return out
}

func unhex(c byte) (byte, bool) {
	switch {
	case '0' <= c && c <= '9':
		return c - '0', true
	case 'a' <= c && c <= 'f':
		return c - 'a' + 10, true
	case 'A' <= c && c <= 'F':
		return c - 'A' + 10, true
	}
	return 0, false
}
