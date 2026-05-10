package state

import (
	"fmt"
	"sort"
	"strings"
)

const schemaVersion = 2

// Allocation is one provisioned project. PortOrder records the declared
// order from the project's config so display can preserve it; Go maps
// don't. Allocations from older binaries lack this field, in which case
// display falls back to alphabetical sort.
type Allocation struct {
	Dir       string         `json:"dir"`
	Ports     map[string]int `json:"ports"`
	PortOrder []string       `json:"portOrder,omitempty"`
	Timestamp int64          `json:"timestamp"`
}

type State struct {
	SchemaVersion int          `json:"schemaVersion"`
	Allocations   []Allocation `json:"allocations"`
}

// FindByDir returns the allocation for dir along with its index, or
// (nil, -1) if no such allocation exists.
func (s *State) FindByDir(dir string) (*Allocation, int) {
	for i := range s.Allocations {
		if s.Allocations[i].Dir == dir {
			return &s.Allocations[i], i
		}
	}
	return nil, -1
}

// validate checks invariants Go's json package doesn't catch. Concrete-type
// mismatches (e.g. number where a string is expected) fail at unmarshal,
// but missing fields silently decode to zero values, so we have to check
// explicitly for empty strings and nil maps in addition to bounds.
func (s *State) validate() error {
	for i, a := range s.Allocations {
		if a.Dir == "" {
			return fmt.Errorf("allocations[%d].dir: must be a non-empty string", i)
		}
		if a.Ports == nil {
			return fmt.Errorf("allocations[%d].ports: must be present", i)
		}
		if a.Timestamp < 0 {
			return fmt.Errorf("allocations[%d].timestamp: must be nonnegative", i)
		}
	}
	return nil
}

// PortString renders ports as "name=N, name=N" using order if non-empty,
// otherwise sorting keys alphabetically. Names in order that aren't in
// ports are skipped; names in ports not in order are appended sorted.
func PortString(ports map[string]int, order []string) string {
	if len(ports) == 0 {
		return ""
	}
	seen := make(map[string]struct{}, len(ports))
	parts := make([]string, 0, len(ports))
	for _, name := range order {
		if v, ok := ports[name]; ok {
			parts = append(parts, fmt.Sprintf("%s=%d", name, v))
			seen[name] = struct{}{}
		}
	}
	leftover := make([]string, 0, len(ports)-len(seen))
	for k := range ports {
		if _, ok := seen[k]; !ok {
			leftover = append(leftover, k)
		}
	}
	sort.Strings(leftover)
	for _, k := range leftover {
		parts = append(parts, fmt.Sprintf("%s=%d", k, ports[k]))
	}
	return strings.Join(parts, ", ")
}

func (a Allocation) PortString() string { return PortString(a.Ports, a.PortOrder) }

func (a Allocation) PortNumbers() []int {
	out := make([]int, 0, len(a.Ports))
	for _, p := range a.Ports {
		out = append(out, p)
	}
	return out
}

func (a Allocation) PortCount() int { return len(a.Ports) }
