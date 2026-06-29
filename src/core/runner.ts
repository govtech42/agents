import { execa } from "execa";
import pc from "picocolors";

export interface RunnerOptions {
  /** Print the command instead of executing it. */
  dryRun?: boolean;
  /** Working directory for the command (where docker-compose.yml lives). */
  cwd?: string;
}

/**
 * Thin wrapper around `docker compose ...` via execa. In dry-run mode it prints
 * the exact command (prefixed with `$`) and returns without executing.
 */
export class DockerRunner {
  constructor(private readonly opts: RunnerOptions = {}) {}

  /** Run `docker compose <args>`, streaming output to the terminal. */
  async compose(args: string[]): Promise<void> {
    const full = ["docker", "compose", ...args];
    if (this.opts.dryRun) {
      console.log(pc.dim("$ " + full.join(" ")));
      return;
    }
    await execa("docker", ["compose", ...args], {
      cwd: this.opts.cwd,
      stdio: "inherit",
    });
  }

  async up(opts: { build?: boolean } = {}): Promise<void> {
    const args = ["up", "-d"];
    if (opts.build) args.push("--build");
    await this.compose(args);
  }

  async down(opts: { volumes?: boolean } = {}): Promise<void> {
    const args = ["down"];
    if (opts.volumes) args.push("-v");
    await this.compose(args);
  }

  /**
   * `docker compose ps` as parsed JSON rows (one object per service). Returns []
   * in dry-run mode or when compose produces no output.
   */
  async ps(): Promise<DockerPsRow[]> {
    if (this.opts.dryRun) return [];
    try {
      const r = await execa("docker", ["compose", "ps", "--format", "json"], {
        cwd: this.opts.cwd,
        reject: false,
      });
      return parsePsOutput(r.stdout ?? "");
    } catch {
      return [];
    }
  }
}

export interface DockerPsRow {
  Name?: string;
  Service?: string;
  State?: string;
  Status?: string;
  [key: string]: unknown;
}

/**
 * `docker compose ps --format json` emits either a JSON array or one JSON object
 * per line depending on the Compose version. Handle both.
 */
export function parsePsOutput(stdout: string): DockerPsRow[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // NDJSON fallback.
    const rows: DockerPsRow[] = [];
    for (const line of trimmed.split("\n")) {
      const l = line.trim();
      if (!l) continue;
      try {
        rows.push(JSON.parse(l));
      } catch {
        /* ignore malformed line */
      }
    }
    return rows;
  }
}
