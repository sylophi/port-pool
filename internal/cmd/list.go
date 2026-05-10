package cmd

import (
	"fmt"
	"sort"
	"time"

	"github.com/sylophi/port-pool/internal/state"
)

func List(args []string) error {
	if len(args) > 0 {
		return fmt.Errorf("unexpected arguments: %v", args)
	}
	s, err := state.Load()
	if err != nil {
		return err
	}
	if len(s.Allocations) == 0 {
		fmt.Println("No ports currently allocated")
		return nil
	}

	allocs := make([]state.Allocation, len(s.Allocations))
	copy(allocs, s.Allocations)
	sort.Slice(allocs, func(i, j int) bool {
		return minPort(allocs[i].Ports) < minPort(allocs[j].Ports)
	})

	fmt.Println("Current allocations:")
	for _, a := range allocs {
		ports := a.PortNumbers()
		sort.Ints(ports)
		var portsStr string
		for i, p := range ports {
			if i > 0 {
				portsStr += "/"
			}
			portsStr += fmt.Sprintf("%d", p)
		}
		when := time.UnixMilli(a.Timestamp).Local().Format("1/2/2006, 3:04:05 PM")
		fmt.Printf("  %s -> %s (%s)\n", portsStr, a.Dir, when)
		fmt.Printf("    %s\n", a.PortString())
	}
	return nil
}

func minPort(ports map[string]int) int {
	first := true
	min := 0
	for _, p := range ports {
		if first || p < min {
			min = p
			first = false
		}
	}
	return min
}
