package cmd

// extractBoolFlag walks args, removes the named flag (`--name`) wherever it
// appears, and returns the remaining args plus whether the flag was set.
// Matches the TS behavior where flag position relative to positional args
// doesn't matter (`port-pool ensure --check .` and `port-pool ensure . --check`
// behave identically).
//
// Any other `--*` token is left in place so callers can still detect it
// as an unknown flag.
func extractBoolFlag(args []string, name string) (rest []string, set bool) {
	rest = make([]string, 0, len(args))
	flag := "--" + name
	for _, a := range args {
		if a == flag {
			set = true
			continue
		}
		rest = append(rest, a)
	}
	return rest, set
}
