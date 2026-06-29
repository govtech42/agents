import { stringify } from "yaml";
import type {
  DockerService,
  Recipe,
  Selection,
  Volume,
} from "./types.js";
import { getExtra, getRecipe } from "./registry.js";

/** Name of the bridge network all services join. */
export const NETWORK_NAME = "aai";

/** A flat summary of one service for the install confirmation view. */
export interface ServiceSummary {
  name: string;
  /** Which agent (or extra) contributed it. */
  origin: string;
  image: string;
  volumes: string[];
  ports: string[];
  dependsOn: string[];
  warnings: string[];
}

/** Everything needed to materialize an install from a selection. */
export interface ComposePlan {
  /** Serializable compose object (pass to `serializeCompose`). */
  compose: Record<string, unknown>;
  services: ServiceSummary[];
  /** Relative host directories to create under data/ and config/. */
  volumeDirs: string[];
  /** Dockerfile templates to write: { path, content }. */
  dockerfiles: { path: string; content: string }[];
  /** Default env files to create if absent: { path, content }. */
  envFiles: { path: string; content: string }[];
  /** Aggregated sensitive-mount warnings. */
  warnings: string[];
}

class PlanError extends Error {}
export { PlanError };

/** Normalize a bind-mount host path: absolute stays, relative gets "./". */
function hostMount(v: Volume): string {
  const isAbsolute = v.hostPath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(v.hostPath);
  const host = isAbsolute ? v.hostPath : `./${v.hostPath}`;
  const base = `${host}:${v.containerPath}`;
  return v.mode ? `${base}:${v.mode}` : base;
}

/** Convert one DockerService into its compose representation. */
function toComposeService(svc: DockerService): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (svc.image) out.image = svc.image;
  if (svc.build) {
    out.build = {
      context: svc.build.context ?? ".",
      dockerfile: svc.build.dockerfile,
    };
  }
  if (svc.command !== undefined) out.command = svc.command;
  if (svc.env && Object.keys(svc.env).length > 0) out.environment = { ...svc.env };
  if (svc.envFile) out.env_file = [svc.envFile];
  if (svc.volumes && svc.volumes.length > 0) {
    out.volumes = svc.volumes.map(hostMount);
  }
  if (svc.ports && svc.ports.length > 0) {
    out.ports = svc.ports.map((p) => `${p.host}:${p.container}`);
  }
  if (svc.dependsOn && svc.dependsOn.length > 0) {
    out.depends_on = [...svc.dependsOn];
  }
  out.restart = svc.restart ?? "unless-stopped";
  out.networks = [NETWORK_NAME];
  return out;
}

function summarize(svc: DockerService, origin: string): ServiceSummary {
  return {
    name: svc.name,
    origin,
    image: svc.image ?? (svc.build ? `build: ${svc.build.dockerfile}` : "—"),
    volumes: (svc.volumes ?? []).map(hostMount),
    ports: (svc.ports ?? []).map((p) => `${p.host}:${p.container}`),
    dependsOn: [...(svc.dependsOn ?? [])],
    warnings: [...(svc.warnings ?? [])],
  };
}

/** Collect relative host dirs (under data/ or config/) that need creating. */
function collectVolumeDirs(svc: DockerService, into: Set<string>): void {
  for (const v of svc.volumes ?? []) {
    if (v.hostPath.startsWith("data/") || v.hostPath.startsWith("config/")) {
      into.add(v.hostPath);
    }
  }
}

/**
 * Turn a resolved Selection into a full ComposePlan. Validates that every agent
 * and extra exists and that each extra actually applies to its agent.
 */
export function buildPlan(selection: Selection): ComposePlan {
  if (selection.agents.length === 0) {
    throw new PlanError("No agents selected.");
  }

  const composeServices: Record<string, Record<string, unknown>> = {};
  const summaries: ServiceSummary[] = [];
  const volumeDirs = new Set<string>();
  const dockerfiles: { path: string; content: string }[] = [];
  const envFiles = new Map<string, string>();
  const warnings = new Set<string>();

  // Track services already added (extras shared across agents are added once).
  const addedServiceNames = new Set<string>();

  const addService = (svc: DockerService, origin: string): void => {
    if (addedServiceNames.has(svc.name)) {
      // Already contributed by another agent/extra; keep the first definition.
      return;
    }
    addedServiceNames.add(svc.name);
    composeServices[svc.name] = toComposeService(svc);
    summaries.push(summarize(svc, origin));
    collectVolumeDirs(svc, volumeDirs);
    if (svc.envFile && !envFiles.has(svc.envFile)) {
      envFiles.set(svc.envFile, defaultEnvHeader(svc.name));
    }
    // A service that builds from an inline Dockerfile (e.g. the gbrain extra).
    if (svc.build && svc.dockerfileContent) {
      pushUnique(dockerfiles, { path: svc.build.dockerfile, content: svc.dockerfileContent });
    }
    for (const w of svc.warnings ?? []) warnings.add(w);
  };

  for (const agentId of selection.agents) {
    const recipe = getRecipe(agentId);
    if (!recipe) throw new PlanError(`Unknown agent: "${agentId}"`);

    const attachedExtras = selection.extras[agentId] ?? [];
    const extraDeps: string[] = [];
    let extraEnv: Record<string, string> = {};

    // Validate + queue extras first so we can wire the agent's depends_on/env.
    for (const extraId of attachedExtras) {
      const extra = getExtra(extraId);
      if (!extra) throw new PlanError(`Unknown extra: "${extraId}"`);
      if (!extra.appliesTo.includes(agentId)) {
        throw new PlanError(
          `Extra "${extraId}" does not apply to agent "${agentId}".`,
        );
      }
      extraDeps.push(...(extra.wireInto ?? []));
      if (extra.wireEnv) extraEnv = { ...extraEnv, ...extra.wireEnv };
    }

    // Agent service, with extra dependencies + env merged in.
    const agentService: DockerService = {
      ...recipe.service,
      dependsOn: dedupe([...(recipe.service.dependsOn ?? []), ...extraDeps]),
      env:
        Object.keys(extraEnv).length > 0
          ? { ...(recipe.service.env ?? {}), ...extraEnv }
          : recipe.service.env,
    };
    addService(agentService, recipe.name);

    // Recipe-provided Dockerfile + env template.
    if (recipe.dockerfile && recipe.service.build) {
      pushUnique(dockerfiles, {
        path: recipe.service.build.dockerfile,
        content: recipe.dockerfile,
      });
    }
    if (recipe.envTemplate && recipe.service.envFile) {
      envFiles.set(recipe.service.envFile, recipe.envTemplate);
    }

    // Now add the extra services.
    for (const extraId of attachedExtras) {
      const extra = getExtra(extraId)!;
      for (const svc of extra.services) {
        addService(svc, extra.label);
      }
    }
  }

  const compose: Record<string, unknown> = {
    services: composeServices,
    networks: {
      [NETWORK_NAME]: { driver: "bridge" },
    },
  };

  return {
    compose,
    services: summaries,
    volumeDirs: [...volumeDirs].sort(),
    dockerfiles,
    envFiles: [...envFiles.entries()].map(([path, content]) => ({ path, content })),
    warnings: [...warnings],
  };
}

/** Serialize the compose object to YAML with a generated-file header. */
export function serializeCompose(compose: Record<string, unknown>): string {
  const header =
    "# Generated by aai (AI Agents Installer). Do not edit by hand —\n" +
    "# re-run `aai install` to regenerate. Edit recipes or config/ instead.\n";
  return header + stringify(compose, { lineWidth: 0 });
}

function defaultEnvHeader(serviceName: string): string {
  return `# Environment for ${serviceName}\n# Add credentials/settings below.\n`;
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}

function pushUnique(
  arr: { path: string; content: string }[],
  item: { path: string; content: string },
): void {
  if (!arr.some((x) => x.path === item.path)) arr.push(item);
}
