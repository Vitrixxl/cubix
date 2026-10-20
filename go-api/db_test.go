package main

import (
	"fmt"
	"path/filepath"
	"testing"
)

// GET routes read on their own connections: they see what the writer committed, and cannot write.
func TestReadersSeeCommitsAndCannotWrite(t *testing.T) {
	db, err := dbOpen(filepath.Join(t.TempDir(), "cubix.db"))
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Call(func(c *Conn) error {
		_, err := c.Exec("INSERT INTO users(id,username) VALUES('u','sam')")
		return err
	}); err != nil {
		t.Fatal(err)
	}
	for range dbReaders + 1 {
		err := db.Read(func(c *Conn) error {
			if row, err := dbOne(c, "SELECT username FROM users WHERE id='u'"); err != nil || !eqStr(idx(row, "username"), "sam") {
				t.Fatal("commit unseen", row, err)
			}
			if _, err := c.Exec("UPDATE users SET username='x' WHERE id='u'"); err == nil {
				t.Fatal("a reader wrote")
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
}

// Stored times are kept to the hundredth; a migration run again changes nothing more.
func TestTimesToHundredths(t *testing.T) {
	db, err := dbOpen(filepath.Join(t.TempDir(), "cubix.db"))
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Call(func(c *Conn) error {
		if _, err := c.Exec("INSERT INTO solves(time_ms,memo_ms) VALUES(12345,4567),(12340,NULL)"); err != nil {
			return err
		}
		for range 2 {
			if err := timesToHundredths(c); err != nil {
				return err
			}
		}
		rows, err := dbAll(c, "SELECT time_ms,memo_ms FROM solves ORDER BY id")
		if err != nil {
			return err
		}
		if got := fmt.Sprint(rows[0]["time_ms"], rows[0]["memo_ms"], rows[1]["time_ms"], rows[1]["memo_ms"]); got != "12340 4560 12340 <nil>" {
			t.Fatalf("times kept to the hundredth: %s", got)
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if hundredths(12349.9) != 12340 {
		t.Fatal("the API drops what is past the hundredth")
	}
}
