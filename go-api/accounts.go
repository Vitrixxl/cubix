package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"time"
)

const accountsDayMs int64 = 86_400_000

func accountsNow() int64 {
	return time.Now().UnixMilli()
}

func accountsDigest(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func accountsPublic(user M) M {
	return M{"id": user["id"], "username": user["username"], "isGuest": user["password_hash"] == nil, "createdAt": user["created_at"]}
}

// accountsRandomToken: 256 random bits in hexadecimal: session and admin tokens.
func accountsRandomToken() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// newUUID is uuid::Uuid::new_v4().to_string().
func newUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	h := hex.EncodeToString(b)
	return h[:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:]
}

// parseUUID is uuid::Uuid::parse_str(..).to_string(): the hyphenated lower-case form of any accepted spelling.
func parseUUID(s string) (string, bool) {
	switch {
	case len(s) == 45 && strings.HasPrefix(s, "urn:uuid:"):
		s = s[9:]
	case len(s) == 38 && s[0] == '{' && s[37] == '}':
		s = s[1:37]
	}
	var digits string
	switch len(s) {
	case 32:
		digits = s
	case 36:
		if s[8] != '-' || s[13] != '-' || s[18] != '-' || s[23] != '-' {
			return "", false
		}
		digits = s[:8] + s[9:13] + s[14:18] + s[19:23] + s[24:]
	default:
		return "", false
	}
	b, err := hex.DecodeString(digits)
	if err != nil {
		return "", false
	}
	h := hex.EncodeToString(b)
	return h[:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:], true
}

func isUUID(s string) bool {
	_, ok := parseUUID(s)
	return ok
}

// accountsBearerHash: the digest under which the token of an `Authorization: Bearer …` header is stored.
func accountsBearerHash(authorization string) (string, bool) {
	token, ok := strings.CutPrefix(authorization, "Bearer ")
	if !ok {
		return "", false
	}
	return accountsDigest(token), true
}

// accountsByTokenHash: the account whose unexpired token has this digest.
func accountsByTokenHash(db *Conn, hash string) (M, error) {
	return dbOne(db, "SELECT u.* FROM users u JOIN auth_tokens t ON t.user_id=u.id WHERE t.token_hash=? AND t.expires_at>?", hash, accountsNow())
}

func accountsAuth(db *Conn, authorization string) (M, error) {
	if hash, ok := accountsBearerHash(authorization); ok {
		return accountsByTokenHash(db, hash)
	}
	return nil, nil
}

func accountsSignedIn(db *Conn, token string) (M, error) {
	user, err := accountsAuth(db, token)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, apiErr(401, "Please sign in again.")
	}
	return user, nil
}

func accountsByUsername(db *Conn, name string) (M, error) {
	return dbOne(db, "SELECT * FROM users WHERE username=? COLLATE NOCASE AND password_hash IS NOT NULL", name)
}

func accountsIssue(db *Conn, user M) (M, error) {
	token := accountsRandomToken()
	if _, err := db.Exec("DELETE FROM auth_tokens WHERE expires_at<=?", accountsNow()); err != nil {
		return nil, err
	}
	id, _ := asStr(user["id"])
	if _, err := db.Exec("INSERT INTO auth_tokens(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)",
		accountsDigest(token), id, accountsNow()+30*accountsDayMs, accountsNow()); err != nil {
		return nil, err
	}
	return M{"token": token, "user": accountsPublic(user)}, nil
}

func accountsRegister(db *Conn, username, hash string) (M, error) {
	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	existing, err := accountsByUsername(db, username)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, apiErr(409, "This username is already taken.")
	}
	id := newUUID()
	if _, err := db.Exec("INSERT INTO users(id,username,password_hash) VALUES(?,?,?)", id, username, hash); err != nil {
		return nil, err
	}
	user, err := dbRequired(db, "SELECT * FROM users WHERE id=?", "Unknown account", id)
	if err != nil {
		return nil, err
	}
	response, err := accountsIssue(db, user)
	if err != nil {
		return nil, err
	}
	return response, tx.Commit()
}
