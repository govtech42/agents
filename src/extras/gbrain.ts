import type { Extra } from "../core/types.js";

/**
 * GBrain — a persistent memory layer (github.com/garrytan/gbrain). There is no
 * official Docker image, so we build a small Bun image that installs the gbrain
 * CLI from GitHub and runs its HTTP MCP server backed by a local PGLite brain
 * (no separate Postgres needed). Attaching it to an agent adds the `gbrain`
 * service, wires the agent to depend on it, and points the agent at its MCP URL.
 *
 * Validated: `gbrain serve --http` exposes /health (200), /mcp, /admin on :7077.
 */
export const gbrain: Extra = {
  id: "gbrain",
  label: "GBrain (memory layer)",
  description: "Persistent memory via GBrain's HTTP MCP server (PGLite); wired to the agent over the compose network.",
  appliesTo: ["hermes", "openclaw"],
  wireInto: ["gbrain"],
  wireEnv: {
    // Agents reach GBrain over the compose network at this MCP endpoint.
    GBRAIN_MCP_URL: "http://gbrain:7077/mcp",
  },
  services: [
    {
      name: "gbrain",
      build: { dockerfile: "templates/gbrain.Dockerfile" },
      envFile: "config/gbrain/.env",
      volumes: [{ hostPath: "data/gbrain", containerPath: "/data" }],
      ports: [{ host: 7077, container: 7077 }],
      restart: "unless-stopped",
      dockerfileContent: `FROM debian:trixie

RUN apt-get update \\
  && apt-get install -y --no-install-recommends \\
       git ca-certificates curl tini unzip \\
       openssh-client openssh-server \\
       python3 python3-venv \\
  && rm -rf /var/lib/apt/lists/*

# uv (Python package manager)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:\${PATH}"

# Bun (GBrain's runtime)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:\${PATH}"

RUN bun install -g github:garrytan/gbrain \\
  && ln -sf /root/.bun/bin/bun /usr/local/bin/bun \\
  && ln -sf /root/.bun/bin/gbrain /usr/local/bin/gbrain

# Node.js (needed for global AI coding agents)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \\
  && apt-get install -y nodejs \\
  && rm -rf /var/lib/apt/lists/*

# Global AI coding agents
RUN npm install -g --omit=dev @anthropic-ai/claude-code@latest @openai/codex@latest opencode-ai 2>/dev/null || true

ENV HOME=/data
WORKDIR /data
EXPOSE 7077

ENTRYPOINT ["tini", "-s", "--"]
CMD ["sh", "-lc", "test -f \\"$HOME/.gbrain/config.json\\" || gbrain init --pglite --no-embedding; exec gbrain serve --http --port 7077 --bind 0.0.0.0"]
`,
    },
  ],
};
