package cmd

import (
	"os"
	"path/filepath"
)

// resolveExecutable returns the path of the running binary, resolved
// through any symlinks. EvalSymlinks failures fall back to the unresolved
// path silently, matching the convention shared with self-update.
func resolveExecutable() (string, error) {
	path, err := os.Executable()
	if err != nil {
		return "", err
	}
	if resolved, err := filepath.EvalSymlinks(path); err == nil {
		path = resolved
	}
	return path, nil
}
