import { existsSync } from "node:fs";
import type { Selection } from "../core/types.js";
import { extraAppliesTo, getExtra, getRecipe } from "../core/registry.js";
import {
  TARGET_DEFAULTS,
  expandTilde,
  type SudoMode,
  type Target,
} from "../core/targets.js";

export interface ParseFlagsInput {
  /** Raw `--agents` value, e.g. "hermes,openclaw". */
  agents?: string;
  /** Raw `--extras` value, e.g. "hermes:gbrain,openclaw:gbrain". */
  extras?: string;
}

export class FlagError extends Error {}

/**
 * Parse non-interactive `--agents` / `--extras` flags into a validated
 * Selection.
 *
 * `--extras` is a comma-separated list of `agent:extra` pairs. Every referenced
 * agent must be selected, every extra must exist, and each extra must apply to
 * the agent it is attached to — otherwise a FlagError is thrown with a clear
 * message.
 */
export function parseSelectionFlags(input: ParseFlagsInput): Selection {
  const agents = splitList(input.agents);
  if (agents.length === 0) {
    throw new FlagError("--agents is required (comma-separated agent ids).");
  }

  // Validate agents.
  for (const id of agents) {
    if (!getRecipe(id)) {
      throw new FlagError(`Unknown agent "${id}".`);
    }
  }
  const agentSet = new Set(agents);

  const extras: Record<string, string[]> = {};
  for (const pair of splitList(input.extras)) {
    const idx = pair.indexOf(":");
    if (idx <= 0 || idx === pair.length - 1) {
      throw new FlagError(
        `Invalid --extras entry "${pair}". Expected "agent:extra".`,
      );
    }
    const agentId = pair.slice(0, idx);
    const extraId = pair.slice(idx + 1);

    if (!agentSet.has(agentId)) {
      throw new FlagError(
        `--extras references agent "${agentId}", which is not in --agents.`,
      );
    }
    if (!getExtra(extraId)) {
      throw new FlagError(`Unknown extra "${extraId}".`);
    }
    if (!extraAppliesTo(extraId, agentId)) {
      throw new FlagError(
        `Extra "${extraId}" does not apply to agent "${agentId}".`,
      );
    }
    (extras[agentId] ??= []).push(extraId);
  }

  // Dedupe extras per agent.
  for (const agentId of Object.keys(extras)) {
    extras[agentId] = [...new Set(extras[agentId])];
  }

  return { agents: [...agentSet], extras };
}

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Raw remote-connection flags shared by install/doctor/list/uninstall. */
export interface TargetFlags {
  /** Use a saved target by label (targets/<label>.env). */
  target?: string;
  remote?: boolean;
  host?: string;
  user?: string;
  key?: string;
  port?: string;
  remoteDir?: string;
  sudo?: string;
  /** Label to save an ad-hoc target under (optional). */
  label?: string;
}

/**
 * Build a Target from ad-hoc connection flags (--host/--user/--key/...).
 * Validates required fields and that the SSH key exists locally.
 */
export function parseTargetFlags(opts: TargetFlags): Target {
  if (!opts.host || !opts.user || !opts.key) {
    throw new FlagError(
      "Remote install needs --host, --user and --key (or use --target <label>).",
    );
  }
  const keyPath = expandTilde(opts.key);
  if (!existsSync(keyPath)) {
    throw new FlagError(`SSH key not found: ${opts.key}`);
  }

  const port = opts.port ? Number(opts.port) : TARGET_DEFAULTS.port;
  if (!Number.isFinite(port) || port <= 0) {
    throw new FlagError(`Invalid --port "${opts.port}".`);
  }

  const sudo = (opts.sudo ?? TARGET_DEFAULTS.sudo) as SudoMode;
  if (!["auto", "always", "never"].includes(sudo)) {
    throw new FlagError(`Invalid --sudo "${opts.sudo}" (expected auto|always|never).`);
  }

  return {
    label: opts.label ?? opts.host,
    host: opts.host,
    user: opts.user,
    keyPath,
    port,
    remoteDir: opts.remoteDir ?? TARGET_DEFAULTS.remoteDir,
    sudo,
  };
}
