import pc from "picocolors";
import { getRecipe } from "../core/registry.js";
import { buildPlan } from "../core/compose.js";
import { scaffold } from "../core/scaffold.js";
import { loadState, removeAgent, saveState, STATE_FILE } from "../core/state.js";
import { bailOnCancel, confirm, intro, outro } from "../ui/prompts.js";
import { symbols, theme } from "../ui/theme.js";
import { resolveContext, type ResolveOptions } from "./resolve.js";

export interface UninstallOptions extends ResolveOptions {
  /** Also remove persisted volume data (down -v / delete host data dirs). */
  volumes?: boolean;
  yes?: boolean;
}

/**
 * `aai uninstall <agent> [--volumes] [--target <label>]` — remove one agent,
 * locally or on a remote target. If it was the last one, the whole stack is
 * brought down; otherwise the compose file is regenerated without it and
 * `up --remove-orphans` reconciles.
 */
export async function uninstall(agentId: string, opts: UninstallOptions): Promise<void> {
  const dryRun = !!opts.dryRun;

  intro(theme.title(`aai · uninstall ${agentId}`));

  if (!getRecipe(agentId)) {
    console.log(theme.err(`Unknown agent "${agentId}".`));
    process.exitCode = 1;
    return;
  }

  const ctx = await resolveContext(opts, { promptTargetIfSaved: true });
  if (!ctx) {
    outro(theme.warn("Aborted."));
    return;
  }
  const { executor } = ctx;
  console.log(`${symbols.bullet} Target: ${theme.agent(executor.describe())}`);

  const state = await loadState(executor.fileOps);
  if (!state.selection.agents.includes(agentId)) {
    console.log(theme.warn(`"${agentId}" is not currently installed on this target.`));
    return;
  }

  const next = removeAgent(state.selection, agentId);

  // Confirm (destructive).
  if (!opts.yes && !dryRun) {
    const action =
      next.agents.length === 0
        ? `docker compose down${opts.volumes ? " -v" : ""}`
        : "regenerate compose and remove this service's container";
    const proceed = bailOnCancel(
      await confirm({ message: `Uninstall ${pc.cyan(agentId)} (${action})?` }),
    );
    if (!proceed) {
      outro(theme.warn("Aborted."));
      return;
    }
  }

  if (next.agents.length === 0) {
    // Last agent: tear the whole stack down.
    await executor.down({ volumes: opts.volumes });
    if (!dryRun) {
      await executor.fileOps.rm("docker-compose.yml");
      await executor.fileOps.rm(STATE_FILE);
      if (opts.volumes) await deleteAgentData(executor.fileOps, agentId);
    }
    outro(theme.ok("Removed. No agents remain."));
    return;
  }

  // Other agents remain: regenerate compose without this one and reconcile.
  const plan = buildPlan(next);
  if (!dryRun) await scaffold(plan, executor.fileOps);
  await executor.compose(["up", "-d", "--remove-orphans"]);
  if (!dryRun) {
    await saveState(executor.fileOps, next);
    if (opts.volumes) await deleteAgentData(executor.fileOps, agentId);
  }

  if (!opts.volumes) {
    console.log(
      theme.dim(
        `\n${symbols.bullet} Data preserved in data/${agentId} and config/${agentId}. ` +
          `Re-run with --volumes to delete it, or remove those folders manually.`,
      ),
    );
  }
  outro(theme.ok(`Removed ${agentId}. Remaining: ${next.agents.join(", ")}.`));
}

/** Delete the agent's data/config directories through the FileOps port. */
async function deleteAgentData(
  fileOps: import("../core/fileops.js").FileOps,
  agentId: string,
): Promise<void> {
  await fileOps.rm(`data/${agentId}`, true);
  await fileOps.rm(`config/${agentId}`, true);
}
