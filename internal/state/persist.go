package state

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"time"

	"github.com/gofrs/flock"
	"github.com/sylophi/port-pool/internal/config"
	"github.com/sylophi/port-pool/internal/xdg"
)

const lockTimeout = 10 * time.Second

func statePath() string {
	return filepath.Join(xdg.DataDir("port-pool"), "state.json")
}

func emptyState() *State {
	return &State{SchemaVersion: schemaVersion, Allocations: []Allocation{}}
}

// Load reads state without acquiring the lock; callers that mutate must
// go through WithState. Returns an empty state when the file is absent.
func Load() (*State, error) {
	path := statePath()
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return emptyState(), nil
		}
		return nil, fmt.Errorf("read %s: %w", path, err)
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse %s: %w", path, err)
	}
	if err := config.CheckSchemaVersion(raw, path, schemaVersion); err != nil {
		return nil, err
	}
	var s State
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, fmt.Errorf("invalid %s: %w", path, err)
	}
	if err := s.validate(); err != nil {
		return nil, fmt.Errorf("invalid %s: %w", path, err)
	}
	return &s, nil
}

func save(s *State) error {
	path := statePath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	if s.Allocations == nil {
		s.Allocations = []Allocation{}
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

// WithState acquires the state lock, loads, runs fn, saves on success, and
// releases. fn mutates state in place; if it returns an error, no save
// occurs.
func WithState(fn func(*State) error) error {
	lockPath := statePath() + ".lock"
	// flock opens the lock file with O_CREATE, but it won't create the
	// parent directory itself.
	if err := os.MkdirAll(filepath.Dir(lockPath), 0o755); err != nil {
		return err
	}

	lock := flock.New(lockPath)
	ctx, cancel := context.WithTimeout(context.Background(), lockTimeout)
	defer cancel()

	locked, err := lock.TryLockContext(ctx, 50*time.Millisecond)
	if err != nil {
		return fmt.Errorf("acquire state lock: %w", err)
	}
	if !locked {
		return fmt.Errorf("could not acquire state lock at %s within %s", lockPath, lockTimeout)
	}
	defer lock.Unlock()

	s, err := Load()
	if err != nil {
		return err
	}
	if err := fn(s); err != nil {
		return err
	}
	return save(s)
}
