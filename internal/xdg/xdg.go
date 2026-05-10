// Package xdg resolves per-app XDG Base Directory paths.
//
// If $XDG_*_HOME is unset and os.UserHomeDir fails, home is treated as
// the empty string and the returned path becomes "/.config/<app>" or
// "/.local/share/<app>". Downstream file operations will surface a clear
// permission/not-found error pointing at the bad path, which is more
// useful than a generic "home not found" error in a CLI context.
package xdg

import (
	"os"
	"path/filepath"
)

// ConfigDir returns $XDG_CONFIG_HOME/<app> or ~/.config/<app>.
func ConfigDir(app string) string {
	if v := os.Getenv("XDG_CONFIG_HOME"); v != "" {
		return filepath.Join(v, app)
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config", app)
}

// DataDir returns $XDG_DATA_HOME/<app> or ~/.local/share/<app>.
func DataDir(app string) string {
	if v := os.Getenv("XDG_DATA_HOME"); v != "" {
		return filepath.Join(v, app)
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".local", "share", app)
}
