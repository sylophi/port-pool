package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/sylophi/port-pool/internal/xdg"
)

const PoolSchemaVersion = 1

type PoolConfig struct {
	SchemaVersion  int   `json:"schemaVersion"`
	PortRangeStart int   `json:"portRangeStart"`
	PortRangeEnd   int   `json:"portRangeEnd"`
	ExcludedPorts  []int `json:"excludedPorts"`
}

func PoolConfigPath() string {
	return filepath.Join(xdg.ConfigDir("port-pool"), "config.json")
}

// StarterPoolConfig returns the recommended starter content for a fresh
// install. main prints this when LoadPool returns a MissingPoolConfigError.
const StarterPoolConfig = `{
  "schemaVersion": 1,
  "portRangeStart": 3000,
  "portRangeEnd": 9999,
  "excludedPorts": [
    3000, 3001, 3306,
    4000, 4200,
    5000, 5173, 5432, 5500,
    6379,
    8000, 8080, 8081, 8443, 8888,
    9000, 9090, 9200
  ]
}`

// MissingPoolConfigError is returned by LoadPool when the config file
// doesn't exist. main detects it via errors.As to print starter UX.
type MissingPoolConfigError struct {
	Path string
}

func (e *MissingPoolConfigError) Error() string {
	return fmt.Sprintf("pool config not found at %s", e.Path)
}

func LoadPool() (*PoolConfig, error) {
	path := PoolConfigPath()
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, &MissingPoolConfigError{Path: path}
		}
		return nil, fmt.Errorf("read %s: %w", path, err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse %s: %w", path, err)
	}
	if err := CheckSchemaVersion(raw, path, PoolSchemaVersion); err != nil {
		return nil, err
	}

	var cfg PoolConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("invalid %s: %w", path, err)
	}
	if err := cfg.validate(path); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func (c *PoolConfig) validate(path string) error {
	if c.PortRangeStart <= 0 {
		return fmt.Errorf("invalid %s:\n  - portRangeStart: must be a positive integer", path)
	}
	if c.PortRangeEnd <= 0 {
		return fmt.Errorf("invalid %s:\n  - portRangeEnd: must be a positive integer", path)
	}
	if c.PortRangeEnd < c.PortRangeStart {
		return fmt.Errorf("invalid %s:\n  - <root>: portRangeEnd must be >= portRangeStart", path)
	}
	for i, p := range c.ExcludedPorts {
		if p <= 0 {
			return fmt.Errorf("invalid %s:\n  - excludedPorts.%d: must be a positive integer", path, i)
		}
	}
	return nil
}
