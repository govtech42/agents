# aai - AI Agents Installer

`aai` is a TypeScript CLI that installs and runs personal AI agent services with
Docker Compose. It currently documents **OpenClaw**, **Hermes Agent**,
**Paperclip**, and the optional **GBrain** memory layer.

Everything runs in containers. The host only needs Docker and Docker Compose v2.
Generated services keep persistent state in local folders so installs are
portable, inspectable, and easy to remove.

## What It Does

For each selected agent, `aai`:

1. creates persistent folders under `data/` and `config/`,
2. writes generated Dockerfile templates under `templates/`,
3. writes or updates one `docker-compose.yml`,
4. starts services with `docker compose up -d --build`,
5. records the installed selection in `aai.json`.

Use `--dry-run` to preview files and commands without writing or running
anything.

## Requirements

- Node.js 20 or newer for local development.
- Docker plus Docker Compose v2 on the target machine.
- macOS and Windows should use Docker Desktop. Windows installs must run from
  WSL2.
- Linux installs need Docker Engine and the `docker-compose-plugin` package.

Run `aai doctor` to check the current target before installing services.

## Install And Build

```bash
npm install
npm run dev -- --help
npm run build
node dist/index.js --help
```

## Usage

```bash
aai                  # interactive install flow
aai doctor           # check Docker, Compose, daemon, and WSL2 where relevant
aai list             # list agents, extras, and installed status
aai install [flags]  # install agents locally or remotely
aai uninstall <id>   # remove one installed agent
```

### Install

Interactive mode prompts for agents, extras, target, and confirmation:

```bash
aai install
```

Non-interactive mode uses flags:

```bash
# Hermes with GBrain, no prompts
aai install --agents hermes --extras hermes:gbrain --yes

# Preview generated compose and commands only
aai install --agents openclaw --dry-run
```

Useful flags:

| Flag | Meaning |
| --- | --- |
| `--agents <ids>` | Comma-separated agent ids, for example `hermes,openclaw` |
| `--extras <pairs>` | Comma-separated `agent:extra` pairs, for example `hermes:gbrain` |
| `--dry-run` | Print generated files and commands without writing or running |
| `--yes` | Skip confirmation prompts |
| `--remote`, `--target`, `--host ...` | Install on a remote server over SSH |

Installs are incremental. Running `install` again merges the new selection with
the existing `aai.json` state and regenerates the compose file.

### Uninstall

```bash
aai uninstall hermes
aai uninstall hermes --volumes
```

Without `--volumes`, `aai` removes the service but preserves `data/<agent>` and
`config/<agent>`. With `--volumes`, persisted data for that agent is deleted.

## Remote Targets Over SSH

Every command can operate against a VPS instead of the local machine. `aai`
connects with OpenSSH, writes files under the remote install directory, and runs
Docker Compose on that server.

```bash
# Interactive remote setup
aai install --remote

# Ad-hoc remote target
aai install --host 1.2.3.4 --user deploy --key ~/.ssh/id_ed25519 \
  --agents hermes --extras hermes:gbrain

# Reuse a saved target
aai doctor --target prod
aai install --target prod --agents openclaw
aai list --target prod
aai uninstall hermes --target prod --volumes
```

Remote flags:

| Flag | Meaning | Default |
| --- | --- | --- |
| `--remote` | Choose or register a target interactively | |
| `--target <label>` | Use `targets/<label>.env` | |
| `--host`, `--user`, `--key` | Ad-hoc SSH connection details | |
| `--port` | SSH port | `22` |
| `--remote-dir` | Install directory on the server | `~/aai` |
| `--sudo <auto|always|never>` | How to invoke Docker remotely | `auto` |

Saved targets are gitignored. They contain infrastructure coordinates and the
path to your SSH key, not the private key itself.

## Generated Layout

The installer writes runtime artifacts under the install root:

```text
data/<agent>/       # persistent service data
config/<agent>/     # env files and service configuration
templates/          # generated Dockerfiles
targets/<label>.env # saved remote SSH targets
docker-compose.yml  # generated compose file
aai.json            # installed selection state
```

These paths are gitignored. Credentials belong in `config/<agent>/.env` or in a
local `.env` copied from `.env.example`.

## Agents And Extras

| Service | Runtime | Notes |
| --- | --- | --- |
| OpenClaw | Debian + Node.js 24 + `openclaw` | Gateway on `18789`; can use GBrain |
| Hermes Agent | Debian + Python/Node toolchain | Gateway/dashboard on `9119`; can use GBrain |
| Paperclip | Node LTS + Paperclip monorepo | Dashboard on `3100`; uses Claude Code runtime |
| GBrain extra | Debian + Bun + GBrain CLI | HTTP MCP memory service on `7077`; applies to OpenClaw and Hermes |

## Development

```bash
npm run dev -- <command>
npm test
npm run typecheck
npm run build
```

The main extension points are declarative recipes in `src/recipes/` and extras
in `src/extras/`. See [ARCHITECTURE.md](ARCHITECTURE.md) before adding new
services.

## Project Documents

- [ARCHITECTURE.md](ARCHITECTURE.md) - codebase map and data flow.
- [CONTRIBUTING.md](CONTRIBUTING.md) - development workflow.
- [SECURITY.md](SECURITY.md) - secret handling and operational security notes.
- [SUPPORT.md](SUPPORT.md) - where to ask for help or report issues.
- [CHANGELOG.md](CHANGELOG.md) - release history.
