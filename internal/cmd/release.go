package cmd

import (
	"fmt"
	"path/filepath"

	"github.com/sylophi/port-pool/internal/state"
)

func Release(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("usage: port-pool release <directory>")
	}
	dir, err := filepath.Abs(args[0])
	if err != nil {
		return err
	}

	return state.WithState(func(s *state.State) error {
		existing, idx := s.FindByDir(dir)
		if existing == nil {
			fmt.Println("No allocation found for this directory")
			return nil
		}
		removed := *existing
		s.Allocations = append(s.Allocations[:idx], s.Allocations[idx+1:]...)
		fmt.Printf("Released %s: %s\n", dir, removed.PortString())
		return nil
	})
}
