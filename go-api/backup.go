package main

// Daily copies of the database, beside it in `backups/` (CUBIX_BACKUP_DIR, `off` to disable): `cubix-YYYY-MM-DD.db`,
// the last seven kept. `cubix-api backup [path]` makes one at once, for an off-site copy.

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"time"
)

const backupKeep = 7
const backupLayout = "cubix-2006-01-02.db"

// backupDir: where the daily copies go, "" when disabled.
func backupDir(dbPath string) string {
	dir, ok := os.LookupEnv("CUBIX_BACKUP_DIR")
	if dir == "off" {
		return ""
	}
	if !ok || dir == "" {
		dir = filepath.Join(filepath.Dir(dbPath), "backups")
	}
	return dir
}

// backupInto writes a consistent copy of the database to `target`, through a connection of its own: in WAL mode
// VACUUM INTO only reads a snapshot, so the app's connection keeps reading and writing meanwhile. The copy is written
// under a temporary name, then renamed, so `target` is never a half-written file.
func backupInto(dbPath, target string) error {
	if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
		return err
	}
	temporary := target + ".tmp"
	// VACUUM INTO refuses an existing file: one a crash left behind is useless anyway.
	_ = os.Remove(temporary)
	pool, err := sql.Open("sqlite3", "file:"+dbPath+"?mode=rw&_busy_timeout=10000")
	if err != nil {
		return err
	}
	defer pool.Close()
	pool.SetMaxOpenConns(1)
	if _, err := pool.Exec("VACUUM INTO ?", temporary); err != nil {
		_ = os.Remove(temporary)
		return err
	}
	// Password hashes and session tokens: the owner's only.
	if err := os.Chmod(temporary, 0o600); err != nil {
		return err
	}
	return os.Rename(temporary, target)
}

// backupDaily writes the day's copy into `dir`, then keeps only the last seven daily copies. Other files, a manual
// snapshot among them, are left alone.
func backupDaily(dbPath, dir string, now time.Time) error {
	if err := backupInto(dbPath, filepath.Join(dir, now.Format(backupLayout))); err != nil {
		return err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	var daily []string
	for _, e := range entries {
		if _, err := time.Parse(backupLayout, e.Name()); err == nil && e.Type().IsRegular() {
			daily = append(daily, e.Name())
		}
	}
	// The date's layout sorts by name.
	slices.Sort(daily)
	for _, name := range daily[:max(len(daily)-backupKeep, 0)] {
		if err := os.Remove(filepath.Join(dir, name)); err != nil {
			return err
		}
	}
	return nil
}

// backupRun: a copy a day, the first ten minutes after the start so that a restart loop does not write one each time.
func backupRun(dbPath string) {
	dir := backupDir(dbPath)
	if dir == "" {
		return
	}
	time.Sleep(10 * time.Minute)
	for {
		started := time.Now()
		if err := backupDaily(dbPath, dir, started); err != nil {
			fmt.Fprintf(os.Stderr, "Backup: %v\n", err)
		} else {
			fmt.Printf("Backup: %s in %s\n", started.Format(backupLayout), time.Since(started).Round(time.Millisecond))
		}
		time.Sleep(24 * time.Hour)
	}
}

// backupCommand is `cubix-api backup [path]`: a copy to `path`, or the day's copy in the backup directory.
func backupCommand(dbPath string, args []string) error {
	if len(args) > 0 {
		if err := backupInto(dbPath, args[0]); err != nil {
			return err
		}
		fmt.Println("Backup written to " + args[0])
		return nil
	}
	dir := backupDir(dbPath)
	if dir == "" {
		return fmt.Errorf("CUBIX_BACKUP_DIR is off: give the copy's path")
	}
	now := time.Now()
	if err := backupDaily(dbPath, dir, now); err != nil {
		return err
	}
	fmt.Println("Backup written to " + filepath.Join(dir, now.Format(backupLayout)))
	return nil
}
