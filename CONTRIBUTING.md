# Contributing

Thanks for improving `aai`. Keep changes small, testable, and aligned with the
existing declarative recipe model.

## Development Setup

```bash
npm install
npm run dev -- --help
npm test
npm run typecheck
npm run build
```

Use Node.js 20 or newer. Docker is required for real installs, but most unit
tests run without starting containers.

## Workflow

1. Start from a clean branch.
2. Make the smallest change that solves the issue.
3. Add or update tests for behavior changes.
4. Run `npm test`, `npm run typecheck`, and `npm run build`.
5. Keep generated runtime files out of commits.

## Adding Or Updating Agents

Agent services should be added as recipes in `src/recipes/` and registered in
`src/core/registry.ts`.

A recipe should define:

- stable `id`, `name`, and human description,
- image or generated Dockerfile,
- env file path under `config/<agent>/.env`,
- persistent volumes under `data/` or `config/`,
- ports and next steps,
- warnings for sensitive mounts or host-impacting permissions.

Add tests for registry exposure and compose output when a recipe changes how
services, volumes, env files, ports, or warnings are generated.

## Adding Extras

Extras belong in `src/extras/`. Use an extra when a service can be attached to
one or more agents without becoming part of the agent's primary recipe.

Extras can:

- contribute one or more Docker services,
- add `depends_on` wiring to the selected agent,
- inject environment variables into the selected agent service.

## Documentation

Update README and architecture notes when changing commands, flags, generated
layout, service ports, supported agents, security posture, or remote behavior.

## Commit Hygiene

Do not commit secrets, local target files, generated compose files, service data,
or dependency folders. The project gitignore is configured to exclude common
runtime artifacts.
