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
      { hostPath: "config/paperclip", containerPath: "/root/.config/paperclip" },
      { hostPath: "data/paperclip", containerPath: "/workspace" },
    ],
    ports: [{ host: 3100, container: 3100 }],
    restart: "unless-stopped",
  },
  dockerfile: `FROM debian:trixie

RUN apt-get update \\
  && apt-get install -y --no-install-recommends \\
       git ca-certificates curl tini \\
       openssh-client openssh-server \\
       python3 python3-venv \\
  && rm -rf /var/lib/apt/lists/*

# uv (Python package manager)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:\${PATH}"

# Node.js LTS (22)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \\
  && apt-get install -y nodejs \\
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && npm install -g pnpm

# Claude Code runtime (required by Paperclip)
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app
RUN git clone --depth 1 https://github.com/paperclipai/paperclip.git . \\
  && pnpm install --frozen-lockfile \\
  && pnpm build

WORKDIR /workspace
EXPOSE 3100

ENTRYPOINT ["tini", "-s", "--"]
CMD ["node", "/app/server/dist/index.js"]
`,
  envTemplate: `# Paperclip configuration
# ANTHROPIC_API_KEY=
PAPERCLIP_PORT=3100
`,
  nextSteps: [
    "Service available at http://localhost:3100",
    "Paperclip needs an Anthropic API key for its Claude Code runtime — set it in config/paperclip/.env",
    "Setup: docker compose exec paperclip npx paperclipai onboard",
  ],
};
