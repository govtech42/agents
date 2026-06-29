import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Expand a leading ~ to the local home dir (for SSH key paths). */
export function expandTilde(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

/** How to invoke docker on the remote: detect, or force on/off. */
export type SudoMode = "auto" | "always" | "never";

/** A remote SSH install target (one VPS). */
export interface Target {
  /** Short name used to select the target and name its file. */
  label: string;
  host: string;
  user: string;
  /** Path to the private SSH key on the local machine. */
  keyPath: string;
  port: number;
  /** Install directory on the remote host (where compose + volumes live). */
  remoteDir: string;
  sudo: SudoMode;
}

export const TARGETS_DIR = "targets";

export const TARGET_DEFAULTS = {
  port: 22,
  remoteDir: "~/aai",
  sudo: "auto" as SudoMode,
};

/** Label → safe filename. Only letters, digits, dot, underscore and dash. */
export function targetFileName(label: string): string {
  return `${label}.env`;
}

/** Validate a label is safe to use as a filename / selector. */
export function isValidLabel(label: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(label);
}

/** Serialize a target to dotenv-style content. */
export function serializeTarget(t: Target): string {
  return (
    [
      `# aai remote target "${t.label}" — gitignored. Not a secret store: it holds`,
      `# infra coordinates and the path to your SSH key (never the key itself).`,
      `AAI_TARGET_LABEL=${t.label}`,
      `AAI_TARGET_HOST=${t.host}`,
      `AAI_TARGET_USER=${t.user}`,
      `AAI_TARGET_KEY=${t.keyPath}`,
      `AAI_TARGET_PORT=${t.port}`,
      `AAI_TARGET_REMOTE_DIR=${t.remoteDir}`,
      `AAI_TARGET_SUDO=${t.sudo}`,
    ].join("\n") + "\n"
  );
}

/** Parse dotenv-style target content. Returns null if required fields missing. */
export function parseTarget(content: string): Target | null {
  const env: Record<string, string> = {};
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }

  const label = env.AAI_TARGET_LABEL;
  const host = env.AAI_TARGET_HOST;
  const user = env.AAI_TARGET_USER;
  const keyPath = env.AAI_TARGET_KEY;
  if (!label || !host || !user || !keyPath) return null;

  const port = Number(env.AAI_TARGET_PORT ?? TARGET_DEFAULTS.port);
  const sudo = (env.AAI_TARGET_SUDO as SudoMode) || TARGET_DEFAULTS.sudo;

  return {
    label,
    host,
    user,
    keyPath,
    port: Number.isFinite(port) && port > 0 ? port : TARGET_DEFAULTS.port,
    remoteDir: env.AAI_TARGET_REMOTE_DIR || TARGET_DEFAULTS.remoteDir,
    sudo: sudo === "always" || sudo === "never" ? sudo : "auto",
  };
}

/** Load all saved targets from `<root>/targets/*.env`. */
export function loadTargets(root: string = process.cwd()): Target[] {
  const dir = join(root, TARGETS_DIR);
  if (!existsSync(dir)) return [];
  const out: Target[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".env")) continue;
    try {
      const t = parseTarget(readFileSync(join(dir, name), "utf8"));
      if (t) out.push(t);
    } catch {
      /* skip unreadable target file */
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

/** Fetch one saved target by label. */
export function getTarget(label: string, root: string = process.cwd()): Target | undefined {
  return loadTargets(root).find((t) => t.label === label);
}

/** Persist a target to `<root>/targets/<label>.env`. */
export function saveTarget(target: Target, root: string = process.cwd()): string {
  if (!isValidLabel(target.label)) {
    throw new Error(
      `Invalid target label "${target.label}". Use letters, digits, dot, underscore or dash.`,
    );
  }
  const dir = join(root, TARGETS_DIR);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, targetFileName(target.label));
  writeFileSync(path, serializeTarget(target), "utf8");
  return path;
}
