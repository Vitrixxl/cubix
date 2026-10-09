//go:build seed

package main

// Placeholders for the SEED group (seed.rs). That port deletes this file and implements every symbol below with the
// same signature in seed.go (also `//go:build seed`). main_seed.go is the `cubix-api seed` command that calls them.

// SeedSummary is seed::Summary.
type SeedSummary struct {
	users  int
	solves int64
}

// seedPassword is seed::PASSWORD.
const seedPassword = "cubix-dev-password"

// seedAdminToken is seed::ADMIN_TOKEN.
const seedAdminToken = "cbx_admin_dev"

// seedRun is seed::run: seeds an empty database; nil when it already holds accounts.
func seedRun(db *Conn, catalog *Catalog) (*SeedSummary, error) {
	return nil, apiErr(501, "Not implemented")
}

// seedSocial is seed::social: the community (friends, groups, battles, tournaments); whether it seeded.
func seedSocial(db *Conn) (bool, error) { return false, apiErr(501, "Not implemented") }
