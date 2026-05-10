export function setupGuide(): void {
  console.log(`To add port-pool to a project:

1. Create port-pool.config.json at the project root:

   [
     {
       "envFile": ".env",
       "portNames": ["server"],
       "env": { "PORT": "\${server}" }
     }
   ]

   Each entry manages one env file. Add a port name for each port the
   project needs. Templates reference ports as \${NAME}.

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

3. (Optional) Gitignore the resolved env files:

   echo ".env" >> .gitignore

See https://github.com/sylophi/port-pool#per-project-config for the
full schema.`);
}
