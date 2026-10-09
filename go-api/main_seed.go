//go:build seed

package main

import "fmt"

// `cubix-api seed`: development data, for compose.dev.yaml. Never in production images.
func init() {
	seedCommand = func(db *Db) error {
		catalog := catalogLoad()
		summary, err := dbCall(db, func(c *Conn) (*SeedSummary, error) { return seedRun(c, catalog) })
		if err != nil {
			return err
		}
		if summary != nil {
			fmt.Printf("Seeded %d accounts and %d solves.\n", summary.users, summary.solves)
		} else {
			fmt.Println("The database already has accounts: not seeded.")
		}
		social, err := dbCall(db, seedSocial)
		if err != nil {
			return err
		}
		if social {
			fmt.Println("Seeded the community: friends, groups, battles and tournaments.")
		}
		fmt.Printf("Sign in as dev (or coach, lena_speed, alex_cubes…) with the password %s; admin token: %s\n", seedPassword, seedAdminToken)
		return nil
	}
}
