import type { Recipe } from "../core/types.js";

export const nanoclaw: Recipe = {
  id: "nanoclaw",
  name: "NanoClaw",
  description: "Lightweight agent that runs tasks in ephemeral Docker sessions.",
  repo: "https://github.com/nanocoai/nanoclaw",
  service: {
    name: "nanoclaw",
    build: { dockerfile: "templates/nanoclaw.Dockerfile" },
    envFile: "config/nanoclaw/.env",
    volumes: [
      { hostPath: "config/nanoclaw", containerPath: "/root/.config/nanoclaw" },
      { hostPath: "data/nanoclaw", containerPath: "/workspace" },
      { hostPath: "/var/run/docker.sock", containerPath: "/var/run/docker.sock" },
    ],
    ports: [{ host: 7071, container: 7071 }],
    restart: "unless-stopped",
    warnings: [
      "Mounts the host Docker socket (/var/run/docker.sock) so NanoClaw can spawn ephemeral session containers. This grants the container root-equivalent control of the host Docker daemon.",
    ],
  },
  dockerfile: `FROM debian:trixie

RUN apt-get update \\
  && apt-get install -y --no-install-recommends \\
       git ca-certificates curl tini docker.io \\
       openssh-client openssh-server \\
       python3 python3-venv \\
  && rm -rf /var/lib/apt/lists/*

# uv (Python package manager)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:\${PATH}"

# Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \\
  && apt-get install -y nodejs \\
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app
RUN git clone --depth 1 https://github.com/nanocoai/nanoclaw.git . \\
  && pnpm install --frozen-lockfile \\
  && pnpm build

WORKDIR /workspace
EXPOSE 7071

ENTRYPOINT ["tini", "-s", "--"]
CMD ["node", "/app/dist/index.js", "serve", "--host", "0.0.0.0", "--port", "7071"]
`,
  envTemplate: `# NanoClaw configuration
# ANTHROPIC_API_KEY=
NANOCLAW_PORT=7071
`,
  nextSteps: [
    "Service available at http://localhost:7071",
    "NanoClaw uses the host Docker socket for ephemeral sessions — review the warning in the summary.",
  ],
};
