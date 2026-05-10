package update

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/sylophi/port-pool/internal/release"
)

const (
	checkInterval = 24 * time.Hour
	fetchTimeout  = 2 * time.Second
)

func shouldCheck(version string) bool {
	if version == "dev" {
		return false
	}
	if os.Getenv("CI") != "" {
		return false
	}
	if os.Getenv("PORT_POOL_NO_UPDATE_CHECK") != "" {
		return false
	}
	info, err := os.Stderr.Stat()
	if err != nil {
		return false
	}
	if info.Mode()&os.ModeCharDevice == 0 {
		return false
	}
	return true
}

func parseVersion(s string) []int {
	s = strings.TrimPrefix(s, "v")
	parts := strings.Split(s, ".")
	out := make([]int, len(parts))
	for i, p := range parts {
		n, _ := strconv.Atoi(p)
		out[i] = n
	}
	return out
}

func isNewer(latest, current string) bool {
	a := parseVersion(latest)
	b := parseVersion(current)
	for i := 0; i < max(len(a), len(b)); i++ {
		var ai, bi int
		if i < len(a) {
			ai = a[i]
		}
		if i < len(b) {
			bi = b[i]
		}
		if ai > bi {
			return true
		}
		if ai < bi {
			return false
		}
	}
	return false
}

func printHint(latest, current string) {
	fmt.Fprintf(os.Stderr,
		"\nport-pool %s is available (current: %s). Run `port-pool update` to install.\n",
		latest, current,
	)
}

// MaybeCheck does a daily best-effort GitHub API ping for a newer release
// and prints a stderr hint when one exists. Errors are silently swallowed —
// this is non-blocking informational output and never fails a command.
func MaybeCheck(version string) {
	if !shouldCheck(version) {
		return
	}

	cache := LoadCache()
	now := time.Now().UnixMilli()

	if cache != nil && isNewer(cache.LatestVersion, version) {
		printHint(cache.LatestVersion, version)
	}

	if cache != nil && now-cache.LastCheck < checkInterval.Milliseconds() {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), fetchTimeout)
	defer cancel()

	latest, err := release.FetchLatestTag(ctx)
	if err != nil {
		return
	}
	_ = SaveCache(&Cache{LastCheck: now, LatestVersion: latest})
}
