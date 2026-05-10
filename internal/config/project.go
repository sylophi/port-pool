package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/sylophi/port-pool/internal/envfile"
)

const ProjectSchemaVersion = 1

type ProjectConfig struct {
	SchemaVersion int                          `json:"schemaVersion"`
	PortNames     []string                     `json:"portNames"`
	EnvFiles      map[string]map[string]string `json:"envFiles"`
}

var portNameRE = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)

func ProjectConfigPath(dir string) string {
	return filepath.Join(dir, "port-pool.config.json")
}

func LoadProject(dir string) (*ProjectConfig, error) {
	path := ProjectConfigPath(dir)
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, fmt.Errorf("port-pool.config.json not found at %s", path)
		}
		return nil, fmt.Errorf("read %s: %w", path, err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse %s: %w", path, err)
	}
	if err := CheckSchemaVersion(raw, path, ProjectSchemaVersion); err != nil {
		return nil, err
	}

	var cfg ProjectConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("invalid %s: %w", path, err)
	}
	if err := cfg.validate(path); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// TryLoadProject returns nil, nil if the project has no config file.
// Other errors are surfaced.
func TryLoadProject(dir string) (*ProjectConfig, error) {
	path := ProjectConfigPath(dir)
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}
	return LoadProject(dir)
}

func (c *ProjectConfig) validate(path string) error {
	var issues []string
	add := func(field, msg string) {
		issues = append(issues, fmt.Sprintf("  - %s: %s", field, msg))
	}

	if len(c.PortNames) == 0 {
		add("portNames", "must be a non-empty array")
	}
	for i, name := range c.PortNames {
		if !portNameRE.MatchString(name) {
			add(fmt.Sprintf("portNames.%d", i), "must match /^[a-zA-Z_][a-zA-Z0-9_]*$/")
		}
	}
	declared := make(map[string]struct{}, len(c.PortNames))
	dup := false
	for _, name := range c.PortNames {
		if _, ok := declared[name]; ok {
			dup = true
		}
		declared[name] = struct{}{}
	}
	if dup {
		add("portNames", "port names must be unique")
	}

	if len(c.EnvFiles) == 0 {
		add("envFiles", "must contain at least one env file")
	}

	envFilePaths := make([]string, 0, len(c.EnvFiles))
	for p := range c.EnvFiles {
		envFilePaths = append(envFilePaths, p)
	}
	sort.Strings(envFilePaths)

	for _, envPath := range envFilePaths {
		if envPath == "" {
			add(fmt.Sprintf("envFiles[%q]", envPath), "must be a non-empty string")
			continue
		}
		segs := strings.FieldsFunc(envPath, func(r rune) bool { return r == '/' || r == '\\' })
		hasDotDot := false
		for _, s := range segs {
			if s == ".." {
				hasDotDot = true
				break
			}
		}
		if hasDotDot {
			add(fmt.Sprintf("envFiles[%q]", envPath), "must not contain '..' segments")
		}
		if strings.HasPrefix(envPath, "/") {
			add(fmt.Sprintf("envFiles[%q]", envPath), "must be a relative path")
		}

		env := c.EnvFiles[envPath]
		keys := make([]string, 0, len(env))
		for k := range env {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, key := range keys {
			tmpl := env[key]
			for _, ref := range envfile.FindPortReferences(tmpl) {
				if _, ok := declared[ref]; !ok {
					add(
						fmt.Sprintf("envFiles[%q].%s", envPath, key),
						fmt.Sprintf("references unknown port '%s' (not in portNames)", ref),
					)
				}
			}
		}
	}

	if len(issues) > 0 {
		return fmt.Errorf("invalid %s:\n%s", path, strings.Join(issues, "\n"))
	}
	return nil
}
