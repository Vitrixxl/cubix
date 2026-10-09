package main

// Ported with the foundation because Db::open calls it; the COACHING port completes this file.

import (
	"os"
	"path/filepath"
)

func coachingMediaDir() string {
	if dir := os.Getenv("CUBIX_MEDIA_DIR"); dir != "" {
		return dir
	}
	db, ok := os.LookupEnv("CUBIX_DB")
	if !ok {
		db = "cubix.db"
	}
	return filepath.Join(filepath.Dir(db), "coaching-media")
}

// coachingSweepMedia removes the files no message refers to any more: their conversation or one of its parties went.
func coachingSweepMedia(db *Conn) error {
	entries, err := os.ReadDir(coachingMediaDir())
	if err != nil {
		return nil
	}
	for _, entry := range entries {
		name := entry.Name()
		if !isUUID(name) {
			continue
		}
		kept, err := dbOne(db, "SELECT 1 FROM coach_messages WHERE media_id=?", name)
		if err != nil {
			return err
		}
		if kept == nil {
			_ = os.Remove(filepath.Join(coachingMediaDir(), name))
		}
	}
	return nil
}
