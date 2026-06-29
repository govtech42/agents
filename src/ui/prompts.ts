import { existsSync } from "node:fs";
import * as p from "@clack/prompts";
import type { Selection } from "../core/types.js";
import { extrasForAgent, recipes } from "../core/registry.js";
import {
  TARGET_DEFAULTS,
  expandTilde,
  getTarget,
  isValidLabel,
  loadTargets,
  saveTarget,
  type SudoMode,
  type Target,
} from "../core/targets.js";
import { theme } from "./theme.js";

/** True if a clack prompt was cancelled (Ctrl-C / Esc). */
export function isCancelled(value: unknown): value is symbol {
  return p.isCancel(value);
}

/** Abort cleanly when the user cancels an interactive prompt. */
export function bailOnCancel<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel("Cancelled.");
    process.exit(130);
  }
  return value as T;
}

/**
 * Drive the full interactive selection: pick agents, then per-agent extras.
 * Returns a resolved Selection.
 */
export async function promptSelection(): Promise<Selection> {
  const chosenAgents = bailOnCancel(
    await p.multiselect({
      message: "Which agents do you want to install?",
      options: recipes.map((r) => ({
        value: r.id,
        label: r.name,
        hint: r.description,
      })),
      required: true,
    }),
  ) as string[];

  const extras: Record<string, string[]> = {};
  for (const agentId of chosenAgents) {
    const available = extrasForAgent(agentId);
    if (available.length === 0) continue;

    const recipe = recipes.find((r) => r.id === agentId)!;
    const chosenExtras = bailOnCancel(
      await p.multiselect({
        message: `Optional extras for ${theme.agent(recipe.name)}:`,
        options: available.map((e) => ({
          value: e.id,
          label: e.label,
          hint: e.description,
        })),
        required: false,
      }),
    );
    if (chosenExtras.length > 0) extras[agentId] = chosenExtras as string[];
  }

  return { agents: chosenAgents, extras };
}

/** Ask where to install: this machine, or a remote server over SSH. */
export async function promptInstallMode(): Promise<"local" | "remote"> {
  return bailOnCancel(
    await p.select({
      message: "Where do you want to install?",
      options: [
        { value: "local", label: "This machine (local Docker)" },
        { value: "remote", label: "Remote server via SSH (VPS)" },
      ],
    }),
  ) as "local" | "remote";
}

/**
 * Register a new remote target via a form and persist it to
 * targets/<label>.env (gitignored).
 */
export async function registerNewTarget(root: string): Promise<Target> {
  const label = bailOnCancel(
    await p.text({
      message: "Label (short name for this server)",
      placeholder: "prod",
      validate: (v) =>
        v && isValidLabel(v) ? undefined : "Use letters, digits, dot, underscore or dash.",
    }),
  ) as string;

  const host = bailOnCancel(
    await p.text({
      message: "Host / IP",
      validate: (v) => (v ? undefined : "Required."),
    }),
  ) as string;

  const user = bailOnCancel(
    await p.text({
      message: "SSH user",
      placeholder: "root",
      validate: (v) => (v ? undefined : "Required."),
    }),
  ) as string;

  const keyPath = bailOnCancel(
    await p.text({
      message: "SSH private key path",
      placeholder: "~/.ssh/id_ed25519",
      validate: (v) =>
        v && existsSync(expandTilde(v)) ? undefined : "Key file not found at that path.",
    }),
  ) as string;

  const portStr = bailOnCancel(
    await p.text({
      message: "SSH port",
      placeholder: String(TARGET_DEFAULTS.port),
      defaultValue: String(TARGET_DEFAULTS.port),
    }),
  ) as string;

  const remoteDir = bailOnCancel(
    await p.text({
      message: "Remote install directory",
      placeholder: TARGET_DEFAULTS.remoteDir,
      defaultValue: TARGET_DEFAULTS.remoteDir,
    }),
  ) as string;

  const sudo = bailOnCancel(
    await p.select({
      message: "Run docker with sudo on the server?",
      options: [
        { value: "auto", label: "Auto-detect (recommended)" },
        { value: "never", label: "Never (user is in the docker group / root)" },
        { value: "always", label: "Always (sudo docker)" },
      ],
    }),
  ) as SudoMode;

  const target: Target = {
    label,
    host,
    user,
    keyPath: expandTilde(keyPath),
    port: Number(portStr) || TARGET_DEFAULTS.port,
    remoteDir: remoteDir || TARGET_DEFAULTS.remoteDir,
    sudo,
  };

  const path = saveTarget(target, root);
  p.log.info(`Saved target to ${path}`);
  return target;
}

/**
 * Choose a saved remote target or register a new one (used by `install --remote`
 * / the remote branch of the mode prompt). Returns null if the user cancels.
 */
export async function promptRemoteTarget(root: string): Promise<Target | null> {
  const saved = loadTargets(root);
  if (saved.length === 0) return registerNewTarget(root);

  const choice = bailOnCancel(
    await p.select({
      message: "Which server?",
      options: [
        ...saved.map((t) => ({
          value: t.label,
          label: t.label,
          hint: `${t.user}@${t.host}:${t.port}`,
        })),
        { value: "__new__", label: "+ Register a new server…" },
      ],
    }),
  ) as string;
  if (choice === "__new__") return registerNewTarget(root);
  return getTarget(choice, root) ?? null;
}

/**
 * For doctor/list/uninstall: pick Local or one of the saved targets (or register
 * a new one). Returns "local" for this machine, a Target for remote, or null if
 * cancelled. Returns "local" without prompting when there are no saved targets,
 * so callers can invoke it unconditionally on a TTY.
 */
export async function promptPickTarget(root: string): Promise<Target | "local" | null> {
  const saved = loadTargets(root);
  if (saved.length === 0) return "local";

  const choice = bailOnCancel(
    await p.select({
      message: "Run against which target?",
      options: [
        { value: "__local__", label: "This machine (local)" },
        ...saved.map((t) => ({
          value: t.label,
          label: t.label,
          hint: `${t.user}@${t.host}:${t.port}`,
        })),
        { value: "__new__", label: "+ Register a new server…" },
      ],
    }),
  ) as string;
  if (choice === "__local__") return "local";
  if (choice === "__new__") return registerNewTarget(root);
  return getTarget(choice, root) ?? "local";
}

export const intro = (s: string) => p.intro(s);
export const outro = (s: string) => p.outro(s);
export const confirm = p.confirm;
export const spinner = p.spinner;
export const note = p.note;
export const log = p.log;
