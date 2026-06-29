# Architecture

This project is a small TypeScript CLI that turns declarative agent recipes into
a Docker Compose project. The core design is intentionally split between command
handling, planning, file materialization, and execution.

## Codebase Analysis

The codebase has clear boundaries:

- `src/index.ts` defines the public CLI commands and shared remote-target flags.
- `src/cli/` handles user workflows for `install`, `list`, `doctor`, and
  `uninstall`.
- `src/core/` contains the reusable orchestration layer: registry lookup,
  compose planning, scaffolding, state, preflight checks, local execution, and
  remote SSH execution.
- `src/recipes/` contains declarative agent service definitions.
- `src/extras/` contains optional add-ons that can attach services and
  environment wiring to selected agents.
- `src/ui/` wraps prompts, colors, symbols, and presentation details.
- `test/` covers registry validation, flag parsing, compose planning, remote
  targets, preflight checks, SSH helpers, and scaffolding behavior.

The strongest part of the design is the `Executor` and `FileOps` split. CLI
commands do not need separate local and remote implementations; they resolve a
target once, then write files and run Docker Compose through a shared interface.

## Main Flow

`aai install` follows this path:

1. `resolveContext` chooses local execution or a remote SSH target.
2. Preflight checks verify Docker, Compose v2, daemon access, and WSL2 where
   relevant.
3. The selected agents and extras are parsed from flags or prompts.
4. Existing `aai.json` state is loaded and merged with the incoming selection.
5. `buildPlan` validates recipes/extras and builds a `ComposePlan`.
6. `scaffold` writes directories, Dockerfiles, env templates, and
   `docker-compose.yml`.
7. The selected executor runs `docker compose up -d --build`.
8. Updated install state is saved back to `aai.json`.

`aai uninstall` uses the same state and planning model. If other agents remain,
it rebuilds the compose file without the removed service and reconciles the
stack with `up -d --remove-orphans`. If none remain, it tears down the stack.

## Core Concepts

### Recipe

A recipe is a declarative `Recipe` object that describes one primary Docker
service: image or generated Dockerfile, env file, volumes, ports, warnings, and
post-install next steps. Recipes are registered in `src/core/registry.ts`.

### Extra

An extra is a reusable add-on that applies to one or more agents. It can add
services, inject environment variables into the agent service, and add
`depends_on` wiring. GBrain is implemented this way.

### ComposePlan

`ComposePlan` is the intermediate representation between selection and disk
output. It contains the serializable compose object, generated Dockerfiles,
default env files, volume directories, service summaries, and warnings.

### Executor And FileOps

`LocalExecutor` writes files with `LocalFileOps` and runs Docker Compose in the
current working directory. `RemoteExecutor` writes files over SSH and runs Docker
Compose from the remote install directory. This keeps CLI commands target
agnostic.

## Operational Notes

- Generated runtime paths are intentionally gitignored: `data/`, `config/`,
  `templates/`, `docker-compose.yml`, `aai.json`, and `targets/`.
- Env files are created only when absent so user secrets are not overwritten.
- Dockerfile templates and `docker-compose.yml` are regenerated on each install.
- Remote target files store host/user/key path metadata only; they do not store
  private key material.

## Current Risks And Follow-Ups

- Several Dockerfiles build from upstream `latest` sources or package versions,
  so rebuilds may change behavior over time.
- Remote SSH execution assumes key-based auth and non-interactive Docker access;
  deployments should validate sudo policy before relying on automation.
- The repository has no license file yet. That should be chosen by the project
  owner before accepting outside contributions.
- Integration coverage is mostly unit-level. A future smoke test with a minimal
  generated compose file would give better confidence before releases.
