import { symbols, theme } from "../ui/theme.js";
import { resolveContext, type ResolveOptions } from "./resolve.js";

export type DoctorOptions = ResolveOptions;

/**
 * `aai doctor` — check the target environment can run the installer: Docker,
 * Compose v2, a running daemon (and, on a remote target, SSH connectivity +
 * whether docker needs sudo). Add `--target <label>` / `--remote` to check a VPS.
 */
export async function doctor(opts: DoctorOptions = {}): Promise<void> {
  const ctx = await resolveContext(opts, { promptTargetIfSaved: true });
  if (!ctx) return;

  console.log(theme.title("\naai · doctor"));
  console.log(`${symbols.bullet} Target: ${theme.agent(ctx.executor.describe())}\n`);

  for (const c of ctx.preflight.checks) {
    const mark = c.ok ? symbols.ok : symbols.fail;
    console.log(`  ${mark} ${c.name}`);
    console.log(theme.dim(`      ${c.detail}`));
    if (!c.ok && c.hint) {
      console.log(theme.warn(`      ${symbols.arrow} ${c.hint}`));
    }
  }

  if (ctx.preflight.ok) {
    console.log(theme.ok(`\n${symbols.ok} Environment is ready.\n`));
  } else {
    console.log(
      theme.err(`\n${symbols.fail} Environment is not ready — see hints above.\n`),
    );
    process.exitCode = 1;
  }
}
