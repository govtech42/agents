import { detectPlatform } from "../core/platform.js";
import { preflight, type PreflightReport } from "../core/preflight.js";
import { LocalExecutor, RemoteExecutor, type Executor } from "../core/executor.js";
import { getTarget, type Target } from "../core/targets.js";
import {
  defaultDockerPrefix,
  detectDockerPrefix,
  remotePreflight,
  sshRun,
} from "../core/ssh.js";
import { FlagError, parseTargetFlags, type TargetFlags } from "./flags.js";
import { promptInstallMode, promptPickTarget, promptRemoteTarget } from "../ui/prompts.js";

export interface ResolveOptions extends TargetFlags {
  dryRun?: boolean;
  /** Local install root override (mainly for tests). */
  root?: string;
}

export interface AaiContext {
  executor: Executor;
  isRemote: boolean;
  target?: Target;
  preflight: PreflightReport;
}

const OK_EMPTY: PreflightReport = { checks: [], ok: true };

/**
 * Resolve which Executor to use (local vs remote SSH) from flags/prompts, run
 * the appropriate preflight, and return a ready-to-use context.
 *
 * @param flags.promptMode  When true and no remote flags are given, ask the user
 *                          to choose local vs remote (used by `install`).
 * @param flags.skipPreflight  Skip the full environment report (used by `list`).
 *                          Remote still resolves the docker prefix.
 */
export async function resolveContext(
  opts: ResolveOptions,
  flags: { promptMode?: boolean; promptTargetIfSaved?: boolean; skipPreflight?: boolean } = {},
): Promise<AaiContext | null> {
  const dryRun = !!opts.dryRun;
  const localRoot = opts.root ?? process.cwd();

  // 1. Decide on a remote target (or stay local).
  let target: Target | undefined;
  if (opts.target) {
    target = getTarget(opts.target, localRoot);
    if (!target) {
      throw new FlagError(`No saved target "${opts.target}" (looked in targets/).`);
    }
  } else if (opts.host) {
    target = parseTargetFlags(opts);
  } else if (opts.remote) {
    const picked = await promptRemoteTarget(localRoot);
    if (!picked) return null;
    target = picked;
  } else if (flags.promptMode) {
    const mode = await promptInstallMode();
    if (mode === "remote") {
      const picked = await promptRemoteTarget(localRoot);
      if (!picked) return null;
      target = picked;
    }
  } else if (flags.promptTargetIfSaved && process.stdin.isTTY) {
    // doctor/list/uninstall: offer Local + saved targets when running interactively.
    const picked = await promptPickTarget(localRoot);
    if (picked === null) return null;
    if (picked !== "local") target = picked;
  }

  // 2a. Local.
  if (!target) {
    const executor = new LocalExecutor(localRoot, dryRun);
    const report = flags.skipPreflight
      ? OK_EMPTY
      : await preflight(detectPlatform(), executor.run);
    return { executor, isRemote: false, preflight: report };
  }

  // 2b. Remote.
  const run = sshRun(target, { dryRun });

  if (dryRun) {
    const executor = new RemoteExecutor(target, defaultDockerPrefix(target.sudo), true);
    return {
      executor,
      isRemote: true,
      target,
      preflight: {
        checks: [
          {
            name: "Remote checks skipped (--dry-run)",
            ok: true,
            detail: `would ssh into ${target.user}@${target.host}:${target.port}`,
          },
        ],
        ok: true,
      },
    };
  }

  if (flags.skipPreflight) {
    const { prefix } = await detectDockerPrefix(run, target.sudo);
    const executor = new RemoteExecutor(
      target,
      prefix ?? defaultDockerPrefix(target.sudo),
      false,
    );
    return { executor, isRemote: true, target, preflight: OK_EMPTY };
  }

  const { report, dockerPrefix } = await remotePreflight(target, run, { dryRun: false });
  const executor = new RemoteExecutor(target, dockerPrefix, false);
  return { executor, isRemote: true, target, preflight: report };
}
