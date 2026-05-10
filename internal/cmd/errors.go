package cmd

import "errors"

// ErrCheckFailed signals that an --check (or similar read-only) assertion
// failed. Command handlers print their specific diagnostic to stderr and
// return this sentinel; main exits 1 without prepending "Error:".
var ErrCheckFailed = errors.New("check failed")
