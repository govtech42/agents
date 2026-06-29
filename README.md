# aai — AI Agents Installer

A single CLI that installs and runs a fleet of personal AI agents from the
"Claw" ecosystem — **OpenClaw, NanoClaw, IronClaw, Hermes Agent, and
Paperclip** — plus optional add-ons like **GBrain** (a memory layer).

**Everything runs in Docker.** Nothing is installed natively on your machine
except Docker itself. Each agent is a Docker service with its data and config
bind-mounted to local folders (`./data/<agent>` and `./config/<agent>`), which
gives you portability, isolation, persistence, and a clean uninstall — and
unifies macOS, Linux, and Windows (via WSL2).

## How it works

You never run an upstream installer directly. For each selected agent the CLI:

1. creates the volume folders (`data/<agent>` and `config/<agent>`),
2. writes a `Dockerfile` from the recipe template (or uses an official image),
3. generates/updates a single `docker-compose.yml` for your selection (agents +
   extras, wired with `depends_on` and a shared network),
4. runs `docker compose up -d --build` — or prints everything and runs nothing
   in `--dry-run`.

## Requirements

The **only** host prerequisite is **Docker + Docker Compose v2**.

- **macOS / Windows:** Docker Desktop. On Windows you must use the **WSL2**
  backend and run `aai` from inside your WSL2 distro.
- **Linux:** Docker Engine + the `docker-compose-plugin` (Compose v2).

The installer **detects and guides** but never installs Docker for you. Run
`aai doctor` to check your environment.

## Install & build

```bash
npm install          # install CLI dependencies
npm run dev -- ...   # run from source (tsx)
npm run build        # bundle to dist/
node dist/index.js   # run the built CLI  (or `aai` once linked/published)
```

## Usage

```bash
aai                  # interactive menu (default)
aai doctor           # check Docker / Compose v2 / daemon / WSL2
aai list             # list agents + extras and their install status
aai install [flags]  # install agents (interactive without --agents)
aai uninstall <agent> [--volumes]
```

### `install`

Interactive by default — pick agents, then per-agent extras (e.g. GBrain on
Hermes), review the summary, and confirm.

Non-interactive with flags:

```bash
# Hermes with the GBrain memory layer, no prompts
aai install --agents hermes --extras hermes:gbrain --yes

# Preview only — prints the docker-compose.yml and the commands, writes nothing
aai install --agents hermes --extras hermes:gbrain --dry-run
```

Flags:

| Flag | Meaning |
|---|---|
| `--agents <ids>` | comma-separated agent ids, e.g. `hermes,openclaw` |
| `--extras <pairs>` | comma-separated `agent:extra` pairs, e.g. `hermes:gbrain` |
| `--dry-run` | print the compose file + commands; never writes or runs |
| `--yes` | skip the confirmation prompt |
| `--remote` / `--target` / `--host …` | install on a **remote server** — see [Remote targets (SSH)](#remote-targets-ssh) |

Installs are **incremental**: running `install` again merges the new selection
with what's already recorded in `aai.json` and regenerates the compose file.

### `uninstall`

```bash
aai uninstall hermes            # remove hermes; keep its data on disk
aai uninstall hermes --volumes  # also delete data/hermes and config/hermes
```

If other agents remain, the compose file is regenerated without the removed
agent and `docker compose up -d --remove-orphans` reconciles the stack. If it
was the last agent, the whole stack is brought down (`docker compose down`).
`--volumes` is **destructive** — it permanently deletes that agent's
`data/` and `config/` folders.

## Remote targets (SSH)

Every command (`install`, `doctor`, `list`, `uninstall`) can run against a
**remote VPS over SSH** instead of this machine. The installer connects with
your SSH **key**, then performs the same "local" install **on the server** —
generating the compose file and volumes in the remote directory and running
`docker compose up -d --build` on the VPS's Docker daemon.

```bash
# Interactive: pick "Remote server" and fill in label / host / user / key / …
aai install --remote

# Non-interactive (ad-hoc connection):
aai install --host 1.2.3.4 --user deploy --key ~/.ssh/id_ed25519 \
            --agents hermes --extras hermes:gbrain

# Reuse a saved target by its label:
aai doctor    --target prod
aai install   --target prod --agents openclaw
aai list      --target prod
aai uninstall hermes --target prod --volumes
```

Connection flags (shared by all commands):

| Flag | Meaning | Default |
|---|---|---|
| `--remote` | choose/register a target interactively | |
| `--target <label>` | use a saved target (`targets/<label>.env`) | |
| `--host` / `--user` / `--key` | ad-hoc connection (key path may use `~`) | |
| `--port` | SSH port | `22` |
| `--remote-dir` | install directory on the server | `~/aai` |
| `--sudo <auto\|always\|never>` | how to invoke docker on the server | `auto` |

- **Saved targets** live in `targets/<label>.env` (git-ignored). They hold infra
  coordinates and the *path* to your key — never the key itself.
- **Transport** is your system `ssh`/`scp` (OpenSSH). Auth is **key-only**
  (`BatchMode`), host keys are trusted on first use (`accept-new`).
- **`--sudo auto`** detects whether the SSH user can run docker directly or needs
  `sudo docker` (requires passwordless `sudo` for docker, or membership in the
  `docker` group, or connecting as root).
- Published ports are reachable **on the VPS** — the final report points URLs at
  the server host and reminds you to lock down the firewall.
- `--dry-run` prints the exact `ssh …` / `docker compose` commands **without
  connecting**.

## Layout

Everything the installer generates lives at the install root (this directory),
and is git-ignored:

```
data/<agent>/       # persistent data (workspaces, gbrain pgdata, …)
config/<agent>/     # configuration (.env, settings) — edit these yourself
templates/          # generated Dockerfiles per recipe
targets/<label>.env # saved remote SSH targets (host/user/key path)
docker-compose.yml  # generated from your selection
aai.json            # installer state: which agents/extras are installed
```

For a **remote** install, the same `data/`, `config/`, `templates/`,
`docker-compose.yml` and `aai.json` are created in the target's `--remote-dir`
on the VPS (default `~/aai`); only `targets/` stays on your machine.

Credentials (Anthropic API keys, etc.) go in `config/<agent>/.env`, which is
mounted into the container. The installer never handles secrets itself — each
agent's own onboarding does.

## Agents & extras

| Service | Image base | Notes |
|---|---|---|
| OpenClaw | `node:24` + global `openclaw` | gateway/daemon on :7070 |
| NanoClaw | `node:20` + source (pnpm) | mounts the host Docker socket for ephemeral sessions (sensitive) |
| IronClaw | multi-stage `rust` → slim runtime | Rust/WASM; first build is slow |
| Hermes | `node:20` backend (docker/local) | lightest to bring up; GBrain target |
| Paperclip | `node:20` + `paperclipai` | needs a Claude Code runtime in the container |
| **GBrain** (extra) | `gbrain` image + `postgres` | memory layer; `appliesTo: hermes, openclaw` |

> **NanoClaw mounts `/var/run/docker.sock`** so it can spawn ephemeral session
> containers. That grants the container root-equivalent control of the host
> Docker daemon — it's flagged in the install summary every time.

## Adding a new agent (recipe)

Each agent is one declarative `Recipe` describing a Docker service. To add one:

1. Create `src/recipes/<id>.ts` exporting a `Recipe`:

   ```ts
   import type { Recipe } from "../core/types.js";

   export const myagent: Recipe = {
     id: "myagent",
     name: "My Agent",
     description: "…",
     service: {
       name: "myagent",
       build: { dockerfile: "templates/myagent.Dockerfile" }, // or image: "…"
       envFile: "config/myagent/.env",
       volumes: [
         { hostPath: "config/myagent", containerPath: "/root/.config/myagent" },
         { hostPath: "data/myagent", containerPath: "/workspace" },
       ],
       ports: [{ host: 7075, container: 7075 }],
     },
     dockerfile: `FROM node:20-bookworm-slim\n…`,   // written to templates/ when build-based
     envTemplate: `# My Agent\n`,                    // default config/myagent/.env
     nextSteps: ["Service at http://localhost:7075"],
   };
   ```

2. Register it in `src/core/registry.ts` (add to the `recipes` array).
3. Volume `hostPath`s **must** live under `data/` or `config/` (absolute paths
   like the Docker socket are allowed but flagged as sensitive).

An **Extra** (`src/extras/<id>.ts`) works the same way but lists `appliesTo`
agent ids, contributes extra `services`, and can `wireInto` an agent's
`depends_on`. Register it in the `extras` array.

## Development

```bash
npm run dev -- <command>   # run from source
npm test                   # vitest (registry, flags, preflight, compose, scaffold)
npm run typecheck          # tsc --noEmit
npm run build              # tsup → dist/
```

The compose generator has a YAML snapshot test (`test/compose.test.ts`); if you
intentionally change generated output, update the snapshot with
`npm test -- -u`.

## Safety

- Containers run upstream code, so `install` always shows a summary and asks for
  confirmation before `up` (skip with `--yes`); `--dry-run` never executes.
- The installer never installs Docker, and never edits anything outside the
  install root.
- Sensitive mounts (e.g. the Docker socket) are always surfaced in the summary.
