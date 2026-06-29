import type { Recipe } from "../core/types.js";

export const openclaw: Recipe = {
  id: "openclaw",
  name: "OpenClaw",
  description: "Self-hosted personal agent gateway (official npm package).",
  repo: "https://github.com/openclaw/openclaw",
  service: {
    name: "openclaw",
    build: { dockerfile: "templates/openclaw.Dockerfile" },
    envFile: "config/openclaw/.env",
    env: {
      OPENCLAW_STATE_DIR: "/config",
      OPENCLAW_CONFIG_DIR: "/config",
      OPENCLAW_CONFIG_PATH: "/config/openclaw.json",
      OPENCLAW_WORKSPACE_DIR: "/data",
      OPENCLAW_GATEWAY_TOKEN: "aai-default-token-change-me",
    },
    volumes: [
      { hostPath: "config/openclaw", containerPath: "/config" },
      { hostPath: "data/openclaw", containerPath: "/data" },
    ],
    ports: [{ host: 18789, container: 18789 }],
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

# Node.js 24
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \\
  && apt-get install -y nodejs \\
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g openclaw@latest

ENV HOME=/root \\
    OPENCLAW_STATE_DIR=/config \\
    OPENCLAW_CONFIG_DIR=/config \\
    OPENCLAW_CONFIG_PATH=/config/openclaw.json \\
    OPENCLAW_WORKSPACE_DIR=/data

WORKDIR /data
EXPOSE 18789

ENTRYPOINT ["tini", "-s", "--"]
CMD ["openclaw", "gateway", "--bind", "auto", "--port", "18789", "--allow-unconfigured"]
`,
  envTemplate: `# OpenClaw configuration
# ANTHROPIC_API_KEY=
# Set a gateway token before exposing the port to the network:
# OPENCLAW_GATEWAY_TOKEN=changeme
`,
  nextSteps: [
    "Gateway on http://localhost:18789 (health: http://localhost:18789/healthz).",
    "Finish setup inside the container: docker compose exec openclaw openclaw onboard",
    "Credentials go in config/openclaw/.env (then: aai install --agents openclaw to re-apply).",
  ],
};
