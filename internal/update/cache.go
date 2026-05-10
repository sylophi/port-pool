package update

import (
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/sylophi/port-pool/internal/xdg"
)

type Cache struct {
	LastCheck     int64  `json:"lastCheck"`
	LatestVersion string `json:"latestVersion"`
}

func cachePath() string {
	return filepath.Join(xdg.DataDir("port-pool"), "update-check.json")
}

// LoadCache returns nil if the cache file is missing, empty, or malformed.
func LoadCache() *Cache {
	data, err := os.ReadFile(cachePath())
	if err != nil {
		return nil
	}
	var c Cache
	if err := json.Unmarshal(data, &c); err != nil {
		return nil
	}
	if c.LastCheck < 0 || c.LatestVersion == "" {
		return nil
	}
	return &c
}

func SaveCache(c *Cache) error {
	path := cachePath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}
