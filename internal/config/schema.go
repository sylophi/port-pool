package config

import (
	"encoding/json"
	"fmt"
)

// CheckSchemaVersion returns an error if raw is missing the schemaVersion
// field or if its value doesn't equal expected. The error message points
// users at the migration notes URL.
func CheckSchemaVersion(raw map[string]json.RawMessage, path string, expected int) error {
	val, ok := raw["schemaVersion"]
	if !ok {
		return fmt.Errorf(
			`%s is missing the "schemaVersion" field.`+"\n"+
				`Add "schemaVersion": %d to the file. `+
				`See https://github.com/sylophi/port-pool/releases for migration notes.`,
			path, expected,
		)
	}
	var got any
	if err := json.Unmarshal(val, &got); err != nil {
		return fmt.Errorf("failed to parse schemaVersion in %s: %w", path, err)
	}
	gotInt, isInt := got.(float64)
	if !isInt || gotInt != float64(expected) {
		return fmt.Errorf(
			`%s declares schemaVersion: %s, `+
				`but this port-pool requires schemaVersion: %d.`+"\n"+
				`See https://github.com/sylophi/port-pool/releases for migration notes.`,
			path, string(val), expected,
		)
	}
	return nil
}
