package envfile

import (
	"errors"
	"io/fs"
	"os"
	"regexp"
	"sort"
	"strings"
)

var kvLineRE = regexp.MustCompile(`(?m)^([A-Za-z_][A-Za-z0-9_]*)=(.*)$`)

// Apply writes/updates each key in rendered into envPath. Existing keys are
// updated in place; missing keys are appended. The file is created if it
// doesn't exist. Other lines are preserved.
func Apply(envPath string, rendered map[string]string) error {
	content, err := readOrEmpty(envPath)
	if err != nil {
		return err
	}

	applied := make(map[string]struct{}, len(rendered))
	content = kvLineRE.ReplaceAllStringFunc(content, func(line string) string {
		m := kvLineRE.FindStringSubmatch(line)
		key := m[1]
		if value, ok := rendered[key]; ok {
			applied[key] = struct{}{}
			return key + "=" + value
		}
		return line
	})

	pending := make([]string, 0, len(rendered))
	for key := range rendered {
		if _, ok := applied[key]; !ok {
			pending = append(pending, key)
		}
	}
	sort.Strings(pending)
	for _, key := range pending {
		if len(content) > 0 && !strings.HasSuffix(content, "\n") {
			content += "\n"
		}
		content += key + "=" + rendered[key] + "\n"
	}

	return os.WriteFile(envPath, []byte(content), 0o644)
}

// Diff returns the keys in expected whose values don't match what's in envPath.
// Missing file or missing key both count as drift.
func Diff(envPath string, expected map[string]string) ([]string, error) {
	content, err := readOrEmpty(envPath)
	if err != nil {
		return nil, err
	}
	existing := make(map[string]string)
	for _, m := range kvLineRE.FindAllStringSubmatch(content, -1) {
		existing[m[1]] = m[2]
	}
	var drifted []string
	for key, value := range expected {
		if got, ok := existing[key]; !ok || got != value {
			drifted = append(drifted, key)
		}
	}
	return drifted, nil
}

func readOrEmpty(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return "", nil
		}
		return "", err
	}
	return string(data), nil
}
