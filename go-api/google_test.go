package main

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"path/filepath"
	"testing"
	"time"
)

func TestGoogleVerify(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	googleKeys.keys, googleKeys.fetched, googleKeys.until = map[string]*rsa.PublicKey{"k": &key.PublicKey}, time.Now(), time.Now().Add(time.Hour)
	sign := func(claims map[string]any) string {
		enc := func(v any) string { b, _ := json.Marshal(v); return base64.RawURLEncoding.EncodeToString(b) }
		body := enc(map[string]string{"alg": "RS256", "kid": "k"}) + "." + enc(claims)
		digest := sha256.Sum256([]byte(body))
		sig, _ := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, digest[:])
		return body + "." + base64.RawURLEncoding.EncodeToString(sig)
	}
	claims := func(aud string, exp int64) map[string]any {
		return map[string]any{"iss": "https://accounts.google.com", "aud": aud, "sub": "42", "name": "Léna Martin", "exp": exp}
	}
	future := time.Now().Add(time.Hour).Unix()
	if c, err := googleVerify(sign(claims("app", future)), "app"); err != nil || c.Sub != "42" || accountsName(c.Name) != "lena_martin" {
		t.Fatal(c, err)
	}
	for name, token := range map[string]string{
		"another app": sign(claims("other", future)),
		"expired":     sign(claims("app", time.Now().Unix()-1)),
		"tampered":    sign(claims("app", future))[:40] + "x" + sign(claims("app", future))[41:],
		"not a token": "a.b",
	} {
		if _, err := googleVerify(token, "app"); err == nil {
			t.Fatal(name, "accepted")
		}
	}
	if accountsName("李") != "cuber" || accountsName("  Jean-Éric  ") != "jean_eric" {
		t.Fatal(accountsName("李"), accountsName("  Jean-Éric  "))
	}
}

// The accounts of password sign-in go, with their data, when a database from before Google sign-in opens; never again.
func TestLegacyAccountsPurged(t *testing.T) {
	db, err := dbOpen(filepath.Join(t.TempDir(), "cubix.db"))
	if err != nil {
		t.Fatal(err)
	}
	_ = db.Call(func(c *Conn) error {
		return c.ExecBatch(`ALTER TABLE users ADD COLUMN password_hash TEXT;
			INSERT INTO users(id,username,password_hash) VALUES('u','sam','x');
			INSERT INTO solves(user_id,time_ms) VALUES('u',9000);`)
	})
	_ = db.Call(func(c *Conn) error {
		if err := dbMigrate(c); err != nil {
			t.Fatal(err)
		}
		users, _ := dbOne(c, "SELECT count(*) n FROM users")
		solves, _ := dbOne(c, "SELECT count(*) n FROM solves")
		legacy, _ := hasColumn(c, "users", "password_hash")
		if users["n"] != int64(0) || solves["n"] != int64(0) || legacy {
			t.Fatal(users, solves, legacy)
		}
		if _, err := accountsOpen(c, "google_sub=?", "42", "sam", "google_sub"); err != nil {
			t.Fatal(err)
		}
		again, _ := accountsOpen(c, "google_sub=?", "42", "other", "google_sub")
		other, _ := accountsOpen(c, "google_sub=?", "43", "sam", "google_sub")
		if idx(again, "user").(M)["username"] != "sam" || idx(other, "user").(M)["username"] != "sam2" {
			t.Fatal(again, other)
		}
		return nil
	})
}
