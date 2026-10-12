package main

import (
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"
)

func TestDailyBackupsKeepTheLastSevenAndNothingElse(t *testing.T) {
	root := t.TempDir()
	dbPath := filepath.Join(root, "cubix.db")
	db, err := dbOpen(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Call(func(c *Conn) error {
		return c.ExecBatch("CREATE TABLE backup_probe(x); INSERT INTO backup_probe VALUES (42);")
	}); err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(root, "backups")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"manual-snapshot.db", "cubix-latest.db", "cubix-2020-01-01.db.tmp"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("keep"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	day := time.Date(2026, 10, 1, 3, 0, 0, 0, time.UTC)
	for i := range 9 {
		if err := backupDaily(dbPath, dir, day.AddDate(0, 0, i)); err != nil {
			t.Fatal(err)
		}
	}
	entries, _ := os.ReadDir(dir)
	var names []string
	for _, e := range entries {
		names = append(names, e.Name())
	}
	want := []string{"cubix-2020-01-01.db.tmp", "cubix-2026-10-03.db", "cubix-2026-10-04.db", "cubix-2026-10-05.db", "cubix-2026-10-06.db",
		"cubix-2026-10-07.db", "cubix-2026-10-08.db", "cubix-2026-10-09.db", "cubix-latest.db", "manual-snapshot.db"}
	if !slices.Equal(names, want) {
		t.Fatal(names)
	}
	// A copy is a database of its own.
	copy, err := dbOpen(filepath.Join(dir, "cubix-2026-10-09.db"))
	if err != nil {
		t.Fatal(err)
	}
	if n, err := dbCall(copy, func(c *Conn) (int64, error) { return c.Exec("UPDATE backup_probe SET x=x WHERE x=42") }); err != nil || n != 1 {
		t.Fatal(n, err)
	}
	if t.Setenv("CUBIX_BACKUP_DIR", "off"); backupDir(dbPath) != "" {
		t.Fatal("not disabled")
	}
}
