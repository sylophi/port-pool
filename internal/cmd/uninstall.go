package cmd

import (
	"bufio"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"strings"

	"github.com/sylophi/port-pool/internal/state"
	"github.com/sylophi/port-pool/internal/xdg"
	"golang.org/x/term"
)

const uninstallUsage = "usage: port-pool uninstall [--yes]"

// Uninstall removes the port-pool binary, global config directory, and
// data directory. Order is data → config → binary so a failure leaves a
// tool to retry with.
func Uninstall(args []string, version string) error {
	args, yes := extractBoolFlag(args, "yes")
	for _, a := range args {
		if strings.HasPrefix(a, "--") {
			return fmt.Errorf("unknown flag: %s\n%s", a, uninstallUsage)
		}
	}
	if len(args) > 0 {
		return fmt.Errorf("unexpected arguments: %v\n%s", args, uninstallUsage)
	}

	if version == "dev" {
		return errors.New("cannot uninstall a dev build")
	}

	binaryPath, err := resolveExecutable()
	if err != nil {
		return fmt.Errorf("cannot determine binary path: %w", err)
	}

	configDir := xdg.ConfigDir("port-pool")
	dataDir := xdg.DataDir("port-pool")

	allocCount := -1
	if s, err := state.Load(); err == nil {
		allocCount = len(s.Allocations)
	}

	fmt.Println("This will remove:")
	fmt.Printf("  - Binary:  %s\n", binaryPath)
	fmt.Printf("  - Config:  %s\n", configDir)
	switch allocCount {
	case -1:
		fmt.Printf("  - State:   %s\n", dataDir)
	case 0:
		fmt.Printf("  - State:   %s  (no active allocations)\n", dataDir)
	default:
		fmt.Printf("  - State:   %s  (%d active allocations)\n", dataDir, allocCount)
	}
	fmt.Println()
	fmt.Println("Note: .env files in project directories are NOT touched.")
	fmt.Println()

	if !yes {
		if !term.IsTerminal(int(os.Stdin.Fd())) {
			return errors.New("refusing to uninstall non-interactively without --yes")
		}
		fmt.Print("Proceed? [y/N]: ")
		reader := bufio.NewReader(os.Stdin)
		line, _ := reader.ReadString('\n')
		answer := strings.ToLower(strings.TrimSpace(line))
		if answer != "y" && answer != "yes" {
			fmt.Println("Aborted.")
			return nil
		}
	}

	steps := []struct {
		label string
		path  string
		fn    func(string) error
	}{
		{"state directory", dataDir, os.RemoveAll},
		{"config directory", configDir, os.RemoveAll},
		{"binary", binaryPath, os.Remove},
	}
	var removed []string
	for _, s := range steps {
		err := s.fn(s.path)
		if err != nil && !errors.Is(err, fs.ErrNotExist) {
			if len(removed) > 0 {
				fmt.Fprintf(os.Stderr, "Removed before failure: %s\n", strings.Join(removed, ", "))
			}
			return fmt.Errorf("failed to remove %s (%s): %w", s.label, s.path, err)
		}
		removed = append(removed, s.label)
	}

	fmt.Println("Uninstalled port-pool.")
	return nil
}

