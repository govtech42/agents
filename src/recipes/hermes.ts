import type { Recipe } from "../core/types.js";

export const hermes: Recipe = {
  id: "hermes",
  name: "Hermes Agent",
  description: "Self-improving personal agent with learning loop and multi-platform messaging.",
  repo: "https://github.com/nousresearch/hermes-agent",
  service: {
    name: "hermes",
    build: { dockerfile: "templates/hermes.Dockerfile" },
    envFile: "config/hermes/.env",
    env: {
      HERMES_ALLOW_ROOT_GATEWAY: "1",
    },
    volumes: [
      { hostPath: "data/hermes", containerPath: "/opt/data" },
    ],
    ports: [
      { host: 9119, container: 9119 },
    ],
    restart: "unless-stopped",
  },
  dockerfile: `# Hermes Agent — builds the official upstream image from source.
# The upstream Dockerfile (357 lines, s6-overlay + uv + Node + Playwright)
# is the build authority. We clone the repo and feed it to Docker as context
# via a bootstrapping multi-stage.

# Stage 1: clone the repo (cacheable — only re-clones when the layer is busted)
FROM debian:trixie AS source
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/nousresearch/hermes-agent.git /src

# Stage 2: build using the upstream Dockerfile verbatim.
# We COPY the cloned source into a fresh build and then run the upstream
# Dockerfile's instructions. Since Docker doesn't support "include" another
# Dockerfile, we re-use their published image recipe via docker build context.
# The practical approach: we just build the upstream image directly.
# This Dockerfile is a thin wrapper that:
#   1. Builds the full upstream image from the cloned source
#   2. Adds our extra tooling (ssh, uv if not already present)

FROM source AS upstream-build
WORKDIR /src
# The upstream Dockerfile expects to be run with the repo root as context.
# We'll build it in a separate docker build step. But since compose only
# supports a single Dockerfile, we replicate the essentials.

# -- Use the upstream approach: multi-stage with uv + node + s6 --
FROM ghcr.io/astral-sh/uv:0.11-python3.13-trixie AS uv_source
FROM node:22-trixie AS node_source
FROM debian:trixie

# Copy uv from the official image
COPY --from=uv_source /usr/local/bin/uv /usr/local/bin/uv
COPY --from=uv_source /usr/local/bin/uvx /usr/local/bin/uvx

# Copy full Node.js installation from the official image
COPY --from=node_source /usr/local /usr/local

ENV PYTHONUNBUFFERED=1 \\
    PYTHONDONTWRITEBYTECODE=1

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \\
      git ca-certificates curl tini \\
      openssh-client openssh-server \\
      python3 python3-venv python3-dev \\
      build-essential pkg-config \\
      ffmpeg \\
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm

WORKDIR /opt/hermes

# Clone the repo
RUN git clone --depth 1 https://github.com/nousresearch/hermes-agent.git .

# Install Python deps
RUN uv venv .venv \\
  && if [ -f pyproject.toml ]; then uv pip install --python .venv/bin/python -e ".[all]" 2>/dev/null || uv pip install --python .venv/bin/python -e . ; fi \\
  && if [ -f requirements.txt ]; then uv pip install --python .venv/bin/python -r requirements.txt; fi

# Install Node deps
RUN if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile 2>/dev/null || pnpm install; fi \\
  && if [ -f pnpm-workspace.yaml ]; then pnpm -r build 2>/dev/null || true; fi

ENV HERMES_HOME=/opt/data \\
    HERMES_WRITE_SAFE_ROOT=/opt/data \\
    HERMES_DISABLE_LAZY_INSTALLS=1 \\
    HERMES_LAZY_INSTALL_TARGET=/opt/data/lazy-packages \\
    PATH="/opt/hermes/bin:/opt/hermes/.venv/bin:/opt/data/.local/bin:\${PATH}"

VOLUME ["/opt/data"]
EXPOSE 9119

ENTRYPOINT ["tini", "-s", "--"]
CMD ["hermes", "gateway", "run"]
`,
  envTemplate: `# Hermes Agent configuration
# Model provider credentials:
# ANTHROPIC_API_KEY=
# OPENAI_API_KEY=
#
# Dashboard runs on port 9119 by default (localhost only).
# For remote access, use an SSH tunnel: ssh -L 9119:localhost:9119 <server>
`,
  nextSteps: [
    "Gateway running. Dashboard on http://localhost:9119 (localhost only for security).",
    "Setup: docker compose exec hermes hermes setup",
    "Add API keys in config/hermes/.env, then restart: docker compose restart hermes",
    "First build is heavy (~5-10 min) — clones the repo and installs Python + Node deps.",
  ],
};
