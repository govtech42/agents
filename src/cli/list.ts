import { extras, extrasForAgent, recipes } from "../core/registry.js";
import { loadState } from "../core/state.js";
import type { DockerPsRow } from "../core/runner.js";
import { symbols, theme } from "../ui/theme.js";
import { resolveContext, type ResolveOptions } from "./resolve.js";

export type ListOptions = ResolveOptions;

/**
 * `aai list` — show every available agent and extra, mark which are installed on
 * the target (per aai.json), and show live `docker compose ps` status when a
 * compose file exists. Add `--target <label>` to inspect a remote VPS.
 */
export async function list(opts: ListOptions = {}): Promise<void> {
  const ctx = await resolveContext(opts, { promptTargetIfSaved: true, skipPreflight: true });
  if (!ctx) return;
  const { executor } = ctx;

  const state = await loadState(executor.fileOps);
  const installed = new Set(state.selection.agents);

  // Live status (best-effort).
  let psRows: DockerPsRow[] = [];
  if (await executor.fileOps.exists("docker-compose.yml")) {
    psRows = await executor.ps();
  }
  const statusByService = new Map<string, string>();
  for (const row of psRows) {
    const key = row.Service ?? row.Name;
    if (key) statusByService.set(key, row.State ?? row.Status ?? "");
  }

  console.log(`\n${symbols.bullet} Target: ${theme.agent(executor.describe())}`);

  console.log(theme.title("\nAgents"));
  for (const r of recipes) {
    const isInstalled = installed.has(r.id);
    const status = statusByService.get(r.service.name);
    const badge = isInstalled
      ? status
        ? theme.ok(`installed · ${status}`)
        : theme.ok("installed")
      : theme.dim("available");
    console.log(
      `  ${isInstalled ? symbols.ok : symbols.bullet} ${theme.agent(r.name)} ${theme.dim(`(${r.id})`)} — ${badge}`,
    );
    console.log(theme.dim(`      ${r.description}`));
    const applicable = extrasForAgent(r.id);
    if (applicable.length) {
      const attached = new Set(state.selection.extras[r.id] ?? []);
      const parts = applicable.map((e) =>
        attached.has(e.id) ? theme.ok(`${e.id} ✓`) : theme.dim(e.id),
      );
      console.log(theme.dim(`      extras: `) + parts.join(", "));
    }
  }

  console.log(theme.title("\nExtras"));
  for (const e of extras) {
    console.log(`  ${symbols.bullet} ${theme.agent(e.label)} ${theme.dim(`(${e.id})`)}`);
    console.log(theme.dim(`      ${e.description}`));
    console.log(theme.dim(`      applies to: ${e.appliesTo.join(", ")}`));
  }

  if (installed.size === 0) {
    console.log(theme.dim("\nNothing installed yet. Run `aai install` to begin."));
  }
  console.log("");
}
