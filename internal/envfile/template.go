package envfile

import (
	"fmt"
	"regexp"
)

var tokenRE = regexp.MustCompile(`\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}`)

// FindPortReferences returns all port names referenced as ${NAME} in template,
// in order of appearance, with duplicates preserved.
func FindPortReferences(template string) []string {
	matches := tokenRE.FindAllStringSubmatch(template, -1)
	out := make([]string, 0, len(matches))
	for _, m := range matches {
		out = append(out, m[1])
	}
	return out
}

// Render expands ${NAME} references in each template using ports.
// Returns an error referencing the env-var key if any template names an
// unknown port.
func Render(env map[string]string, ports map[string]int) (map[string]string, error) {
	out := make(map[string]string, len(env))
	for key, template := range env {
		var renderErr error
		result := tokenRE.ReplaceAllStringFunc(template, func(match string) string {
			name := match[2 : len(match)-1] // strip ${ and }
			port, ok := ports[name]
			if !ok {
				if renderErr == nil {
					renderErr = fmt.Errorf("env.%s references unknown port '%s'", key, name)
				}
				return match
			}
			return fmt.Sprintf("%d", port)
		})
		if renderErr != nil {
			return nil, renderErr
		}
		out[key] = result
	}
	return out, nil
}
