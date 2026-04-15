# port-pool

Simple port allocation tool for managing multiple dev environments. Useful for:

- Git worktrees that each need unique ports
- Running multiple copies of the same repository
- Running multiple projects simultaneously without port conflicts

## Setup

```bash
cp config.example.json config.json
```

Edit `config.json` to match your project's port requirements.

## Usage

From `~/port-pool`:

```bash
# Allocate ports for a project (updates .env file)
bun run provision /path/to/project

# Release ports when done
bun run release /path/to/project

# See all current allocations
bun run list
```

Or with `npx tsx`:

```bash
npx tsx index.ts provision /path/to/project
npx tsx index.ts release /path/to/project
npx tsx index.ts list
```

## Configuration

The `config.json` file defines:

- `portRangeStart` / `portRangeEnd` - range to allocate from
- `excludedPorts` - commonly used ports to avoid
- `ports` - array of port definitions

Each port definition has:

```json
{
  "name": "server",
  "envVars": ["PORT", "SERVER_PORT"],
  "urlEnvVars": ["SERVER_URL"],
  "urlTemplate": "http://localhost:${port}"
}
```

- `name` - identifier for the port
- `envVars` - env variables to set with the port number
- `urlEnvVars` - (optional) env variables to set with the URL
- `urlTemplate` - (optional) URL template, `${port}` is replaced with the port number

Ports are allocated in consecutive blocks based on the number of ports defined.

## State

Allocations are stored in `state.json` alongside the script.
