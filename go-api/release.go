package main

// Ported with the foundation because `--version` prints it; the ADMIN port completes this file.

import (
	"os"
	"strconv"
	"strings"
)

// releaseBuildNumber: commit time in minutes since the Unix epoch; see `CUBIX_BUILD_NUMBER` in the Dockerfile.
func releaseBuildNumber() (uint64, bool) {
	n, err := strconv.ParseUint(strings.TrimSpace(os.Getenv("CUBIX_BUILD_NUMBER")), 10, 64)
	return n, err == nil && n > 0
}
