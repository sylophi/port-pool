package cmd

import "fmt"

func SetupGuide(args []string) error {
	if len(args) > 0 {
		return fmt.Errorf("unexpected arguments: %v", args)
	}
	fmt.Print(`To add port-pool to a project:

1. Create port-pool.config.json at the project root. For a monorepo,
   place it at the workspace root so every package shares one pool.

   {
     "schemaVersion": 1,
     "portNames": ["web", "api", "db"],
     "envFiles": {
       ".env": {
         "DB_PORT": "${db}"
       },
       "apps/web/.env.local": {
         "PORT":    "${web}",
         "API_URL": "http://localhost:${api}",
         "WS_URL":  "ws://localhost:${api}"
       },
       "apps/api/.env": {
         "PORT":         "${api}",
         "DATABASE_URL": "postgres://localhost:${db}/app"
       }
     }
   }

   portNames declares the project's ports (one number allocated per
   name). envFiles is a map of env-file path (relative to the directory
   passed to 'ensure') to env-var templates that reference ports as
   ${NAME}. Paths can be root-level or in subdirectories. The same name
   in multiple files resolves to the same port.

   port-pool only manages the keys you list. Other keys in the same
   file (e.g. API tokens, secrets) are left untouched.

2. Wire 'port-pool ensure .' into the dev command. For example, in
   package.json:

   {
     "scripts": {
       "dev": "port-pool ensure . && vite"
     }
   }

   On the first run, ports are auto-provisioned and the env files are
   created. Subsequent runs are silent fast no-ops. If an env file has
   drifted, ensure repairs it before the dev server starts.

See https://github.com/sylophi/port-pool#per-project-config for the
full schema.
`)
	return nil
}
