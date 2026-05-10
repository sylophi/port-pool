package cmd

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/sylophi/port-pool/internal/config"
	"github.com/sylophi/port-pool/internal/envfile"
	"github.com/sylophi/port-pool/internal/state"
)

const ensureUsage = "usage: port-pool ensure <directory> [--check]"

type fileDrift struct {
	envFile     string
	envPath     string
	driftedKeys []string
	expected    map[string]string
}

func Ensure(args []string) error {
	args, check := extractBoolFlag(args, "check")
	for _, a := range args {
		if strings.HasPrefix(a, "--") {
			return fmt.Errorf("unknown flag: %s\n%s", a, ensureUsage)
		}
	}
	if len(args) == 0 {
		return errors.New(ensureUsage)
	}
	if len(args) > 1 {
		return fmt.Errorf("unexpected extra arguments: %v\n%s", args[1:], ensureUsage)
	}

	resolvedDir, err := filepath.Abs(args[0])
	if err != nil {
		return err
	}

	pcfg, err := config.LoadProject(resolvedDir)
	if err != nil {
		return err
	}

	s, err := state.Load()
	if err != nil {
		return err
	}

	existing, _ := s.FindByDir(resolvedDir)

	if existing == nil {
		if check {
			fmt.Fprintf(os.Stderr, "not provisioned: %s\n", resolvedDir)
			return ErrCheckFailed
		}
		cfg, err := config.LoadPool()
		if err != nil {
			return err
		}
		return state.WithState(func(s *state.State) error {
			if existing, _ := s.FindByDir(resolvedDir); existing != nil {
				return nil
			}
			ports, err := PerformProvision(cfg, pcfg, s, resolvedDir)
			if err != nil {
				return err
			}
			fmt.Printf("Provisioned ports for %s: %s\n", resolvedDir, state.PortString(ports, pcfg.PortNames))
			return nil
		})
	}

	if !shapeMatches(existing, pcfg) {
		fmt.Fprintf(os.Stderr,
			"config shape changed; run 'port-pool release %s' then 'port-pool ensure %s'\n",
			resolvedDir, resolvedDir,
		)
		return ErrCheckFailed
	}

	drifts, err := findDrift(resolvedDir, pcfg, existing.Ports)
	if err != nil {
		return err
	}
	if len(drifts) == 0 {
		return nil
	}

	if check {
		for _, d := range drifts {
			fmt.Fprintf(os.Stderr, "drift: %s: %s: %s\n",
				resolvedDir, d.envFile, strings.Join(d.driftedKeys, ", "),
			)
		}
		return ErrCheckFailed
	}

	for _, d := range drifts {
		if err := envfile.Apply(d.envPath, d.expected); err != nil {
			return err
		}
		fmt.Printf("Repaired %s: %s\n", d.envFile, strings.Join(d.driftedKeys, ", "))
	}
	return nil
}

func shapeMatches(a *state.Allocation, p *config.ProjectConfig) bool {
	allocNames := make([]string, 0, len(a.Ports))
	for n := range a.Ports {
		allocNames = append(allocNames, n)
	}
	sort.Strings(allocNames)
	cfgNames := make([]string, len(p.PortNames))
	copy(cfgNames, p.PortNames)
	sort.Strings(cfgNames)
	if len(allocNames) != len(cfgNames) {
		return false
	}
	for i := range allocNames {
		if allocNames[i] != cfgNames[i] {
			return false
		}
	}
	return true
}

func findDrift(dir string, p *config.ProjectConfig, ports map[string]int) ([]fileDrift, error) {
	var drifts []fileDrift
	keys := make([]string, 0, len(p.EnvFiles))
	for k := range p.EnvFiles {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	for _, envFile := range keys {
		env := p.EnvFiles[envFile]
		expected, err := envfile.Render(env, ports)
		if err != nil {
			return nil, err
		}
		envPath := filepath.Join(dir, envFile)
		drifted, err := envfile.Diff(envPath, expected)
		if err != nil {
			return nil, err
		}
		if len(drifted) > 0 {
			sort.Strings(drifted)
			drifts = append(drifts, fileDrift{
				envFile:     envFile,
				envPath:     envPath,
				driftedKeys: drifted,
				expected:    expected,
			})
		}
	}
	return drifts, nil
}
