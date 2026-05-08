# port-pool

Simple port allocation tool for managing multiple dev environments. Useful for:

- Git worktrees that each need unique ports
- Running multiple copies of the same repository
- Running multiple projects simultaneously without port conflicts

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/sylophi/port-pool/main/install.sh | sh
```

Installs the latest release to `~/.local/bin/port-pool`. Override the install location with `PORT_POOL_INSTALL_DIR`:

```sh
PORT_POOL_INSTALL_DIR=/usr/local/bin curl -fsSL https://raw.githubusercontent.com/sylophi/port-pool/main/install.sh | sh
```

Supported platforms: macOS (arm64, x64), Linux (arm64, x64).

## Updating

`port-pool` checks once per day for new releases and prints a hint to stderr when an update is available. Run `port-pool update` to upgrade in place.

The check is automatically skipped when:

- `CI` is set
- `PORT_POOL_NO_UPDATE_CHECK` is set
- stderr is not a TTY (piped or redirected)
- the binary was built locally (version is `dev`)

## Setup

The install script creates a starter config at `~/.config/port-pool/config.json` (port range 8500–9000, excluding 8888). Edit it to suit your machine — see [Configuration](#configuration).

## Usage

```bash
# Allocate ports for a project (updates .env)
port-pool provision /path/to/project

# Release ports when done
port-pool release /path/to/project

# Idempotent: provision if needed, repair .env drift if not. Designed to be
# chained inline before a project's dev command.
port-pool ensure /path/to/project

# See all current allocations
port-pool list
```

### Recommended: chain `ensure` into your dev command

Wire `port-pool ensure .` directly into the project's dev script so a fresh clone "just works":

```json
{
  "scripts": {
    "dev": "port-pool ensure . && vite"
  }
}
```

On the first `npm run dev` after cloning, ports are auto-provisioned and `.env` is created. Subsequent runs are silent fast no-ops. If `.env` has been hand-edited away from the templated values, `ensure` repairs it before the dev server starts.

For CI or pre-commit checks, use `--check` to fail without modifying anything:

```bash
port-pool ensure --check .
```

`--check` exits with status 1 if the project is not provisioned or if `.env` has drifted; otherwise it's silent.

Multiple parallel `ensure` calls (e.g. across worktrees starting their dev servers simultaneously) are safe; allocations serialize via a sidecar lock at `~/.local/share/port-pool/state.json.lock/`.

## Configuration

`port-pool` uses two configs:

### Global pool config (`~/.config/port-pool/config.json`)

Defines the machine-level port pool:

```json
{
  "portRangeStart": 8500,
  "portRangeEnd": 9000,
  "excludedPorts": [8888]
}
```

Respects `$XDG_CONFIG_HOME` if set.

### Per-project config (`port-pool.config.json`)

Lives in each project's root, alongside `package.json` / `tsconfig.json`. Typically committed to the project repo (unlike `.env`, which contains the resolved port numbers and is usually git-ignored). Declares the port shape and how to template the project's `.env`:

```json
{
  "ports": ["server", "client", "db"],
  "env": {
    "PORT":         "${ports.server}",
    "CLIENT_PORT":  "${ports.client}",
    "SERVER_URL":   "http://localhost:${ports.server}",
    "DATABASE_URL": "postgres://localhost:${ports.db}/app"
  }
}
```

- `ports`: ordered list of port names. Names must match `[a-zA-Z_][a-zA-Z0-9_]*` and be unique. The block size is `ports.length`.
- `env`: map from env-var name to template. The only substitution form is `${ports.NAME}`, where `NAME` must appear in `ports`.

When provisioning:
- Existing keys in `.env` are updated in place.
- Keys not yet in `.env` are appended.
- `.env` is created if it doesn't exist.
- Keys not mentioned in `port-pool.config.json` are left untouched.

## State

Allocations are stored at `~/.local/share/port-pool/state.json` (respects `$XDG_DATA_HOME`).

## Development

Running from source still works:

```bash
bun run src/index.ts ensure /path/to/project
# or via package script:
bun run provision /path/to/project
```

To isolate dev runs from your real allocations, override the XDG variables:

```bash
XDG_CONFIG_HOME=/tmp/dev/config XDG_DATA_HOME=/tmp/dev/data bun run src/index.ts ensure /tmp/test-project
```

### Building from source

```sh
bun install
bun run build              # produces dist/port-pool
cp dist/port-pool ~/.local/bin/
```

Source builds report version `dev`, which disables the auto-update check.
