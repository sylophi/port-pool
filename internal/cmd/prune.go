package cmd

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/sylophi/port-pool/internal/state"
)

const (
	pruneUsage       = "usage: port-pool prune [--dry-run]"
	reasonDirMissing = "directory missing"
	reasonNoConfig   = "no port-pool.config.json"
)

type orphanInfo struct {
	allocation state.Allocation
	reason     string
}

func Prune(args []string) error {
	args, dryRun := extractBoolFlag(args, "dry-run")
	for _, a := range args {
		if strings.HasPrefix(a, "--") {
			return fmt.Errorf("unknown flag: %s\n%s", a, pruneUsage)
		}
	}
	if len(args) > 0 {
		return fmt.Errorf("unexpected arguments: %v\n%s", args, pruneUsage)
	}

	if dryRun {
		s, err := state.Load()
		if err != nil {
			return err
		}
		reportOrphans(classifyOrphans(s.Allocations), "Would prune")
		return nil
	}

	return state.WithState(func(s *state.State) error {
		orphans := classifyOrphans(s.Allocations)
		if len(orphans) > 0 {
			orphanDirs := make(map[string]struct{}, len(orphans))
			for _, o := range orphans {
				orphanDirs[o.allocation.Dir] = struct{}{}
			}
			kept := s.Allocations[:0]
			for _, a := range s.Allocations {
				if _, dropped := orphanDirs[a.Dir]; !dropped {
					kept = append(kept, a)
				}
			}
			s.Allocations = kept
		}
		reportOrphans(orphans, "Pruned")
		return nil
	})
}

func classifyOrphans(allocs []state.Allocation) []orphanInfo {
	var orphans []orphanInfo
	for _, a := range allocs {
		if _, err := os.Stat(a.Dir); errors.Is(err, fs.ErrNotExist) {
			orphans = append(orphans, orphanInfo{allocation: a, reason: reasonDirMissing})
			continue
		}
		cfgPath := filepath.Join(a.Dir, "port-pool.config.json")
		if _, err := os.Stat(cfgPath); errors.Is(err, fs.ErrNotExist) {
			orphans = append(orphans, orphanInfo{allocation: a, reason: reasonNoConfig})
		}
	}
	return orphans
}

func reportOrphans(orphans []orphanInfo, verb string) {
	if len(orphans) == 0 {
		fmt.Println("No orphaned allocations")
		return
	}
	fmt.Printf("%s %d allocation(s):\n", verb, len(orphans))
	for _, o := range orphans {
		fmt.Printf("  - %s (%s)\n", o.allocation.Dir, o.reason)
		fmt.Printf("    %s\n", o.allocation.PortString())
	}
}
