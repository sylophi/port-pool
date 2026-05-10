package state

import (
	"math/rand"

	"github.com/sylophi/port-pool/internal/config"
)

// FindNextAvailablePorts scans the configured pool range for a contiguous
// block of `blockSize` ports not in use (excluded or allocated). Returns
// nil if no such block exists.
//
// Picks a *random* valid base port rather than the first-fit, on purpose:
// processes outside port-pool's tracking (one-off scripts, system services
// bound to unknown ports inside the range) can still occupy ports we
// don't know about. Random spreading reduces the probability that an
// allocation collides with such an external listener compared to always
// returning the lowest available block.
//
// The math/rand source is package-global and auto-seeded by the Go
// runtime; no explicit seed is needed.
func FindNextAvailablePorts(s *State, cfg *config.PoolConfig, blockSize int) []int {
	used := make(map[int]struct{}, len(cfg.ExcludedPorts)+len(s.Allocations)*blockSize)
	for _, p := range cfg.ExcludedPorts {
		used[p] = struct{}{}
	}
	for _, a := range s.Allocations {
		for _, p := range a.Ports {
			used[p] = struct{}{}
		}
	}

	var candidates []int
	for base := cfg.PortRangeStart; base+blockSize-1 <= cfg.PortRangeEnd; base++ {
		ok := true
		for i := 0; i < blockSize; i++ {
			if _, taken := used[base+i]; taken {
				ok = false
				break
			}
		}
		if ok {
			candidates = append(candidates, base)
		}
	}

	if len(candidates) == 0 {
		return nil
	}
	base := candidates[rand.Intn(len(candidates))]
	out := make([]int, blockSize)
	for i := 0; i < blockSize; i++ {
		out[i] = base + i
	}
	return out
}

// FindLeastRecentlyUsed returns the allocation matching pred with the oldest
// timestamp, or nil if none match. Pass nil pred to consider all allocations.
func FindLeastRecentlyUsed(s *State, pred func(*Allocation) bool) *Allocation {
	var oldest *Allocation
	for i := range s.Allocations {
		a := &s.Allocations[i]
		if pred != nil && !pred(a) {
			continue
		}
		if oldest == nil || a.Timestamp < oldest.Timestamp {
			oldest = a
		}
	}
	return oldest
}
