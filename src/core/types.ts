/**
 * Central type definitions for the AAI installer.
 *
 * Every agent ("Recipe") and every optional add-on ("Extra") describes one or
 * more Docker services declaratively. The CLI's only job is to turn the user's
 * selection into a `docker-compose.yml` and call `docker compose`.
 */

/** Operating systems we support. Windows is reached through WSL2. */
export type OS = "macos" | "linux" | "windows";

/** Detected host platform. */
export interface Platform {
  os: OS;
  arch: string;
  /** True when running inside (or detecting) a WSL2 environment. */
  isWSL: boolean;
}

/**
 * A single host→container bind mount. `hostPath` is always relative to the
 * install root and must live under `data/` or `config/` so uninstall stays
 * clean and predictable.
 */
export interface Volume {
  hostPath: string;
  containerPath: string;
  /** e.g. "ro" for read-only. Omitted means read-write. */
  mode?: "ro" | "rw";
}

/** How an image is obtained: a published image, or built from a Dockerfile. */
export interface DockerBuild {
  /** Path to a Dockerfile, relative to the install root. */
  dockerfile: string;
  /** Build context directory, relative to the install root. Defaults to ".". */
  context?: string;
}

/** A published or generated port mapping (host:container). */
export interface PortMapping {
  host: number;
  container: number;
}

/**
 * One Docker service as it will appear in `docker-compose.yml`. This is a
 * deliberately small subset of the Compose spec — just what the recipes need.
 */
export interface DockerService {
  /** Logical service name (compose key). Unique across the whole compose file. */
  name: string;
  /** Official/published image, e.g. "postgres:16". Mutually informative with `build`. */
  image?: string;
  /** Build from a Dockerfile template instead of (or alongside) a published image. */
  build?: DockerBuild;
  /**
   * Inline Dockerfile content written to `build.dockerfile` at install time.
   * Use this for services (recipes or extras) that build from a generated
   * Dockerfile. Omit when `build.context` is a remote git URL (the repo ships
   * its own Dockerfile) or when using a published `image`.
   */
  dockerfileContent?: string;
  /** Environment variables baked into the service definition. */
  env?: Record<string, string>;
  /** Path to an env file (relative to install root) mounted at runtime. */
  envFile?: string;
  volumes?: Volume[];
  ports?: PortMapping[];
  /** Other service names this one depends on (compose `depends_on`). */
  dependsOn?: string[];
  /** Override the container command. */
  command?: string | string[];
  /** Compose restart policy. Defaults to "unless-stopped". */
  restart?: string;
  /**
   * Sensitive/host-affecting mounts surfaced in the install summary
   * (e.g. mounting the Docker socket). Free-form, shown to the user.
   */
  warnings?: string[];
}

/**
 * An optional add-on that can be attached to one or more agents. Adds extra
 * services (e.g. GBrain adds a `gbrain` service plus a `postgres` service).
 */
export interface Extra {
  id: string;
  label: string;
  description: string;
  /** Agent ids this extra can be attached to. */
  appliesTo: string[];
  /** Services contributed when this extra is selected. */
  services: DockerService[];
  /**
   * Service-name dependencies to add to the agent's main service when this
   * extra is attached (so the agent waits for, e.g., gbrain to come up).
   */
  wireInto?: string[];
  /**
   * Environment variables merged into the agent's main service when this extra
   * is attached (e.g. the GBrain MCP URL the agent should talk to).
   */
  wireEnv?: Record<string, string>;
}

/**
 * A declarative description of an agent as a Docker service. Adding a new agent
 * is just adding one of these to the registry.
 */
export interface Recipe {
  id: string;
  name: string;
  description: string;
  /** Upstream repo / homepage, shown in `list` and the final report. */
  repo?: string;
  /** Platforms this recipe supports. Defaults to all three. */
  platforms?: OS[];
  /** The agent's primary Docker service. */
  service: DockerService;
  /** Dockerfile template content, written to templates/<id>.Dockerfile when needed. */
  dockerfile?: string;
  /** Default contents for config/<id>/.env, written if the file does not exist. */
  envTemplate?: string;
  /** Human-facing next steps shown after install (onboarding, URLs, etc.). */
  nextSteps?: string[];
}

/** A fully-resolved selection ready to be turned into a compose file. */
export interface Selection {
  /** Agent ids selected. */
  agents: string[];
  /** Map of agent id → list of extra ids attached to it. */
  extras: Record<string, string[]>;
}

/** Persisted installer state (aai.json). */
export interface InstallerState {
  version: 1;
  selection: Selection;
  /** ISO timestamp of the last successful install/update. */
  updatedAt?: string;
}
