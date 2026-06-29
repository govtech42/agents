import type { Recipe } from "../core/types.js";

export const ironclaw: Recipe = {
  id: "ironclaw",
  name: "IronClaw",
  description: "High-performance Rust/WASM agent runtime with sandbox isolation.",
  repo: "https://github.com/nearai/ironclaw",
  service: {
    name: "ironclaw",
    build: { dockerfile: "templates/ironclaw.Dockerfile" },
    envFile: "config/ironclaw/.env",
    volumes: [
      { hostPath: "config/ironclaw", containerPath: "/home/ironclaw/.ironclaw" },
      { hostPath: "data/ironclaw", containerPath: "/workspace" },
    ],
    ports: [{ host: 3000, container: 3000 }],
    restart: "unless-stopped",
  },
  dockerfile: `# Stage 1: Build IronClaw from source
FROM rust:1-trixie AS builder

RUN apt-get update \\
  && apt-get install -y --no-install-recommends \\
       git ca-certificates pkg-config libssl-dev \\
  && rm -rf /var/lib/apt/lists/*

RUN rustup target add wasm32-unknown-unknown

WORKDIR /src
RUN git clone --depth 1 https://github.com/nearai/ironclaw.git . \\
  && cargo build --release --bin ironclaw-reborn 2>/dev/null \\
  || cargo build --release

# Stage 2: Runtime on Debian Trixie
FROM debian:trixie

RUN apt-get update \\
  && apt-get install -y --no-install-recommends \\
       ca-certificates curl tini \\
       openssh-client openssh-server \\
       python3 python3-venv \\
  && rm -rf /var/lib/apt/lists/*

# uv (Python package manager)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:\${PATH}"

# Copy the built binary
COPY --from=builder /src/target/release/ironclaw* /usr/local/bin/
COPY --from=builder /src/migrations /app/migrations 2>/dev/null || true

RUN useradd -m -d /home/ironclaw -u 1000 ironclaw \\
  && mkdir -p /home/ironclaw/.ironclaw /workspace \\
  && chown -R ironclaw:ironclaw /home/ironclaw /workspace

ENV RUST_LOG=ironclaw=info \\
    HOME=/home/ironclaw

WORKDIR /workspace
EXPOSE 3000

ENTRYPOINT ["tini", "-s", "--"]
CMD ["ironclaw", "serve", "--bind", "0.0.0.0:3000"]
`,
  envTemplate: `# IronClaw configuration
# ANTHROPIC_API_KEY=
# DATABASE_URL=postgres://ironclaw:ironclaw@localhost:5432/ironclaw
IRONCLAW_PORT=3000
`,
  nextSteps: [
    "Service available at http://localhost:3000",
    "First build compiles Rust from source and may take several minutes.",
    "IronClaw may need a Postgres instance — configure DATABASE_URL in config/ironclaw/.env",
  ],
};
