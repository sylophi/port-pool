package main

import (
	"errors"
	"fmt"
	"os"

	"github.com/sylophi/port-pool/internal/cmd"
	"github.com/sylophi/port-pool/internal/config"
	"github.com/sylophi/port-pool/internal/update"
)

var errUnknownCommand = errors.New("unknown command")

var version = "dev"

func printUsage() {
	fmt.Println("Usage: port-pool <command> [directory]")
	fmt.Println("")
	fmt.Println("Commands:")
	fmt.Println("  provision <dir>           Allocate ports and update .env in directory")
	fmt.Println("  release <dir>             Release ports used by directory")
	fmt.Println("  ensure <dir> [--check]    Provision if needed; repair .env drift if not")
	fmt.Println("                            --check: read-only, exit 1 if anything would change")
	fmt.Println("  list                      Show all current allocations")
	fmt.Println("  prune [--dry-run]         Remove allocations whose dir or config is gone")
	fmt.Println("  setup-guide               Print instructions for adding port-pool to a project")
	fmt.Println("  version                   Print the installed version")
	fmt.Println("  update                    Download and install the latest version")
	fmt.Println("  help                      Print this help message")
}

func main() {
	args := os.Args[1:]

	if len(args) == 0 {
		printUsage()
		os.Exit(0)
	}

	if err := dispatch(args); err != nil {
		var missing *config.MissingPoolConfigError
		switch {
		case errors.Is(err, errUnknownCommand):
			printUsage()
		case errors.Is(err, cmd.ErrCheckFailed):
			// Command already wrote a specific diagnostic to stderr.
		case errors.As(err, &missing):
			fmt.Fprintf(os.Stderr, "Error: config not found at %s\n", missing.Path)
			fmt.Fprintln(os.Stderr, "Create it with the following starter content:")
			fmt.Fprintln(os.Stderr)
			fmt.Fprintln(os.Stderr, config.StarterPoolConfig)
		default:
			fmt.Fprintln(os.Stderr, "Error:", err)
		}
		os.Exit(1)
	}

	update.MaybeCheck(version)
}

func dispatch(args []string) error {
	switch args[0] {
	case "provision":
		return cmd.Provision(args[1:])
	case "release":
		return cmd.Release(args[1:])
	case "ensure":
		return cmd.Ensure(args[1:])
	case "list":
		return cmd.List(args[1:])
	case "prune":
		return cmd.Prune(args[1:])
	case "setup-guide":
		return cmd.SetupGuide(args[1:])
	case "update":
		return cmd.SelfUpdate(version)
	case "version", "--version", "-v":
		fmt.Println(version)
		return nil
	case "help", "--help", "-h":
		printUsage()
		return nil
	default:
		return errUnknownCommand
	}
}
