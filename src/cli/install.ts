import pc from "picocolors";
import type { Selection } from "../core/types.js";
import { buildPlan, serializeCompose, type ComposePlan } from "../core/compose.js";
import { scaffold } from "../core/scaffold.js";
import { loadState, mergeSelection, saveState } from "../core/state.js";
import { getRecipe } from "../core/registry.js";
import {
  bailOnCancel,
  confirm,
  intro,
  note,
  outro,
  promptSelection,
  spinner,
} from "../ui/prompts.js";
import { symbols, theme } from "../ui/theme.js";
import { parseSelectionFlags } from "./flags.js";
import { resolveContext, type ResolveOptions } from "./resolve.js";

export interface InstallOptions extends ResolveOptions {
  agents?: string;
  extras?: string;
  yes?: boolean;
}

/**
 * `aai install` — interactive when no `--agents` flag is given, otherwise driven
 * by flags. Works against a local OR remote (SSH) target, resolved by
 * resolveContext. Generates the compose file and brings services up (or prints
 * everything in --dry-run).
 */
export async function install(opts: InstallOptions): Promise<void> {
  const dryRun = !!opts.dryRun;

  intro(theme.title("aai · install"));

  // 1. Resolve target (local/remote) + preflight.
  const ctx = await resolveContext(opts, { promptMode: !opts.agents });
  if (!ctx) {
    outro(theme.warn("Aborted."));
    return;
  }
  const { executor, isRemote, target } = ctx;
  console.log(`${symbols.bullet} Target: ${theme.agent(executor.describe())}`);

  renderPreflight(ctx.preflight);
  if (!ctx.preflight.ok && !dryRun) {
    console.log(
      theme.err(
        "\nEnvironment is not ready. Resolve the issues above and retry, or use --dry-run to preview.",
      ),
    );
    process.exitCode = 1;
    return;
  }

  // 2. Resolve the selection (flags or interactive).
  let incoming: Selection;
  if (opts.agents) {
    incoming = parseSelectionFlags({ agents: opts.agents, extras: opts.extras });
  } else {
    incoming = await promptSelection();
  }

  // 3. Merge with existing state on the target (incremental add).
  const state = await loadState(executor.fileOps);
  const selection = mergeSelection(state.selection, incoming);

  // 4. Build the plan.
  const plan = buildPlan(selection);

  // 5. Show the summary.
  renderSummary(plan, isRemote ? target?.host : undefined);

  if (dryRun) {
    console.log(theme.dim("\n# docker-compose.yml (dry-run, not written):\n"));
    console.log(serializeCompose(plan.compose));
    console.log(theme.dim("# Commands that would run:"));
    await executor.up({ build: true });
    outro(theme.warn("Dry run — nothing was written or executed."));
    return;
  }

  // 6. Confirm (unless --yes).
  if (!opts.yes) {
    const proceed = bailOnCancel(
      await confirm({
        message: `Generate files on ${pc.cyan(executor.describe())} and run ${pc.cyan(
          "docker compose up -d --build",
        )}?`,
      }),
    );
    if (!proceed) {
      outro(theme.warn("Aborted."));
      return;
    }
  }

  // 7. Scaffold + up.
  const written = await scaffold(plan, executor.fileOps);
  note(
    [
      `${written.createdDirs.length} dirs ensured, ${written.writtenFiles.length} files written`,
      written.skippedFiles.length > 0
        ? theme.dim(`preserved: ${written.skippedFiles.join(", ")}`)
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    "Files",
  );

  const s = spinner();
  s.start("docker compose up -d --build");
  try {
    await executor.up({ build: true });
    s.stop("Services started.");
  } catch (err) {
    s.stop(theme.err("docker compose failed."));
    throw err;
  }

  await saveState(executor.fileOps, selection);
  renderFinalReport(selection, isRemote ? target?.host : undefined);
  outro(theme.ok("Done."));
}

function renderPreflight(report: {
  checks: { name: string; ok: boolean; detail: string; hint?: string }[];
}): void {
  for (const c of report.checks) {
    const mark = c.ok ? symbols.ok : symbols.fail;
    console.log(`  ${mark} ${c.name} ${theme.dim("— " + c.detail)}`);
    if (!c.ok && c.hint) console.log(theme.dim(`      ${symbols.arrow} ${c.hint}`));
  }
}

/** When `host` is set the install is remote: show host instead of localhost. */
function hostFor(host?: string): string {
  return host ?? "localhost";
}

function renderSummary(plan: ComposePlan, host?: string): void {
  console.log("\n" + theme.title("Plan summary"));
  for (const svc of plan.services) {
    console.log(`\n  ${theme.agent(svc.name)} ${theme.dim("(" + svc.origin + ")")}`);
    console.log(`    image:   ${svc.image}`);
    if (svc.ports.length) console.log(`    ports:   ${svc.ports.join(", ")}`);
    if (svc.volumes.length) {
      console.log(`    volumes: ${svc.volumes.join("\n             ")}`);
    }
    if (svc.dependsOn.length) console.log(`    depends: ${svc.dependsOn.join(", ")}`);
    for (const w of svc.warnings) {
      console.log(theme.warn(`    ${symbols.warn} ${w}`));
    }
  }
  if (plan.warnings.length > 0) {
    console.log("\n" + theme.warn(`${symbols.warn} Sensitive mounts in this install:`));
    for (const w of plan.warnings) console.log(theme.warn(`  • ${w}`));
  }
  if (host) {
    console.log(
      "\n" +
        theme.warn(
          `${symbols.warn} Remote install: published ports are reachable on ${host}. ` +
            `Make sure the VPS firewall only exposes what you intend.`,
        ),
    );
  }
}

function renderFinalReport(selection: Selection, host?: string): void {
  console.log("\n" + theme.title("Next steps"));
  for (const agentId of selection.agents) {
    const recipe = getRecipe(agentId);
    if (!recipe) continue;
    console.log(`\n  ${theme.agent(recipe.name)}`);
    for (const step of recipe.nextSteps ?? []) {
      // For remote installs, point URLs at the VPS host instead of localhost.
      console.log(`    ${symbols.arrow} ${host ? step.replaceAll("localhost", hostFor(host)) : step}`);
    }
    const extras = selection.extras[agentId] ?? [];
    if (extras.length) console.log(theme.dim(`    extras: ${extras.join(", ")}`));
  }
  if (host) {
    console.log(
      theme.dim(
        `\n${symbols.bullet} On the server, manage with docker from the remote dir, or re-run aai with --target.`,
      ),
    );
  }
}
