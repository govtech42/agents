import type { Recipe } from "../core/types.js";

export const paperclip: Recipe = {
  id: "paperclip",
  name: "Paperclip",
  description: "Multi-agent orchestrator for AI agent teams, built on Claude Code.",
  repo: "https://github.com/paperclipai/paperclip",
  service: {
    name: "paperclip",
    build: { dockerfile: "templates/paperclip.Dockerfile" },
    envFile: "config/paperclip/.env",
    volumes: [
      { hostPath: "data/paperclip", containerPath: "/paperclip" },
    ],
    ports: [{ host: 3100, container: 3100 }],
    restart: "unless-stopped",
  },
  dockerfile: `# Paperclip — clones the upstream repo and builds using their multi-stage Dockerfile.
# The upstream Dockerfile expects the repo root as build context (many COPY statements
# for pnpm workspace packages), so we clone first then run the build stages.

FROM node:lts-trixie AS base

RUN apt-get update \\
  && apt-get install -y --no-install-recommends \\
       ca-certificates gosu curl gh git wget ripgrep \\
       openssh-client openssh-server \\
       python3 python3-venv \\
  && rm -rf /var/lib/apt/lists/* \\
  && corepack enable

# uv (Python package manager)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:\${PATH}"

RUN usermod -u 1000 --non-unique node \\
  && groupmod -g 1000 --non-unique node \\
  && usermod -g 1000 -d /paperclip node

# --- deps stage ---
FROM base AS deps
WORKDIR /app
RUN git clone --depth 1 https://github.com/paperclipai/paperclip.git /src

# Copy package manifests for pnpm install caching
RUN cp /src/package.json /src/pnpm-workspace.yaml /src/pnpm-lock.yaml /app/ \\
  && cp /src/.npmrc /app/ 2>/dev/null || true \\
  && find /src -maxdepth 4 -name package.json -not -path '*/node_modules/*' | while read f; do \\
       rel="\$(echo "\$f" | sed 's|^/src/||')"; \\
       dir="\$(dirname "\$rel")"; \\
       mkdir -p "/app/\$dir"; \\
       cp "\$f" "/app/\$rel"; \\
     done \\
  && cp -r /src/patches /app/patches 2>/dev/null || true \\
  && cp -r /src/scripts /app/scripts 2>/dev/null || true

RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# --- build stage ---
FROM base AS build
WORKDIR /app
COPY --from=deps /app /app
COPY --from=deps /src /app-src
RUN cp -a /app-src/. /app/ 2>/dev/null || true
RUN pnpm --filter @paperclipai/ui build 2>/dev/null || true
RUN pnpm --filter @paperclipai/plugin-sdk build 2>/dev/null || true
RUN pnpm --filter @paperclipai/server build 2>/dev/null || true

# --- production stage ---
FROM base AS production
WORKDIR /app
COPY --chown=node:node --from=build /app /app

RUN npm install --global --omit=dev @anthropic-ai/claude-code@latest 2>/dev/null || true

# Copy entrypoint from the cloned repo
RUN cp /app/scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh 2>/dev/null || true \\
  && chmod +x /usr/local/bin/docker-entrypoint.sh 2>/dev/null || true

RUN mkdir -p /paperclip && chown node:node /paperclip

ENV NODE_ENV=production \\
    HOME=/paperclip \\
    HOST=0.0.0.0 \\
    PORT=3100 \\
    SERVE_UI=true \\
    PAPERCLIP_HOME=/paperclip \\
    PAPERCLIP_INSTANCE_ID=default \\
    PAPERCLIP_CONFIG=/paperclip/instances/default/config.json \\
    PAPERCLIP_DEPLOYMENT_MODE=authenticated \\
    PAPERCLIP_DEPLOYMENT_EXPOSURE=private

EXPOSE 3100

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "--import", "./server/node_modules/tsx/dist/loader.mjs", "server/dist/index.js"]
`,
  envTemplate: `# Paperclip configuration
BETTER_AUTH_SECRET=aai-paperclip-change-me
# ANTHROPIC_API_KEY=
# OPENAI_API_KEY=
# PAPERCLIP_PORT=3100
`,
  nextSteps: [
    "Dashboard on http://localhost:3100",
    "Set your Anthropic API key in config/paperclip/.env, then restart: docker compose restart paperclip",
    "First build is heavy (~5-10 min) — clones the repo and builds the pnpm monorepo.",
    "Onboard: docker compose exec paperclip npx paperclipai onboard --yes",
  ],
};
