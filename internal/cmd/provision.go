package cmd

import (
	"fmt"
	"path/filepath"
	"sort"
	"time"

	"github.com/sylophi/port-pool/internal/config"
	"github.com/sylophi/port-pool/internal/envfile"
	"github.com/sylophi/port-pool/internal/state"
)

// PerformProvision allocates a port block, mutates state in place to add the
// allocation, and writes all configured env files. Used by both Provision
// and Ensure. Returns the resolved port map.
//
// Caller holds the state lock (via WithState).
func PerformProvision(
	cfg *config.PoolConfig,
	pcfg *config.ProjectConfig,
	s *state.State,
	resolvedDir string,
) (map[string]int, error) {
	blockSize := len(pcfg.PortNames)
	portNumbers := state.FindNextAvailablePorts(s, cfg, blockSize)

	if portNumbers == nil {
		lru := state.FindLeastRecentlyUsed(s, func(a *state.Allocation) bool {
			return a.PortCount() == blockSize
		})
		if lru == nil {
			return nil, fmt.Errorf(
				"no ports available and no recyclable allocations of size %d",
				blockSize,
			)
		}
		fmt.Printf("Recycling ports from %s (least recently used)\n", lru.Dir)
		filtered := s.Allocations[:0]
		for _, a := range s.Allocations {
			if a.Dir != lru.Dir {
				filtered = append(filtered, a)
			}
		}
		s.Allocations = filtered
		nums := lru.PortNumbers()
		sort.Ints(nums)
		portNumbers = nums
	}

	ports := make(map[string]int, blockSize)
	for i, name := range pcfg.PortNames {
		ports[name] = portNumbers[i]
	}

	type write struct {
		path     string
		contents map[string]string
	}
	var writes []write
	for envFile, env := range pcfg.EnvFiles {
		rendered, err := envfile.Render(env, ports)
		if err != nil {
			return nil, err
		}
		writes = append(writes, write{
			path:     filepath.Join(resolvedDir, envFile),
			contents: rendered,
		})
	}

	portOrder := make([]string, len(pcfg.PortNames))
	copy(portOrder, pcfg.PortNames)
	s.Allocations = append(s.Allocations, state.Allocation{
		Dir:       resolvedDir,
		Ports:     ports,
		PortOrder: portOrder,
		Timestamp: time.Now().UnixMilli(),
	})

	for _, w := range writes {
		if err := envfile.Apply(w.path, w.contents); err != nil {
			return nil, err
		}
	}

	return ports, nil
}

func Provision(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("usage: port-pool provision <directory>")
	}
	resolvedDir, err := filepath.Abs(args[0])
	if err != nil {
		return err
	}

	pcfg, err := config.LoadProject(resolvedDir)
	if err != nil {
		return err
	}
	cfg, err := config.LoadPool()
	if err != nil {
		return err
	}

	return state.WithState(func(s *state.State) error {
		if existing, _ := s.FindByDir(resolvedDir); existing != nil {
			fmt.Printf("Directory already has ports allocated: %s\n", existing.PortString())
			fmt.Println("Use 'release' first if you want new ports.")
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
