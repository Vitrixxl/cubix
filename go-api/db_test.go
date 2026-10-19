package main

import (
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
