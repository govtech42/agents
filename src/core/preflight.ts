import { execa } from "execa";
import type { Platform } from "./types.js";

/** Result of one environment check. */
export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
  /** Guidance shown when the check fails. */
  hint?: string;
}

export interface PreflightReport {
  checks: CheckResult[];
  /** True only if every *required* check passed. */
  ok: boolean;
}

/** Minimal command runner so tests can mock `docker`/`docker compose`. */
export type CommandRunner = (
  cmd: string,
  args: string[],
) => Promise<{ stdout: string; exitCode: number }>;

/** Local command runner (execa). Exported for reuse by the LocalExecutor. */
export const localCommandRunner: CommandRunner = async (cmd, args) => {
  try {
    const r = await execa(cmd, args, { reject: false });
    return { stdout: r.stdout ?? "", exitCode: r.exitCode ?? 1 };
  } catch (err) {
    // Command not found, etc.
    return { stdout: "", exitCode: 127 };
  }
};

const defaultRunner: CommandRunner = localCommandRunner;

/**
 * Detect Docker, Docker Compose v2, the daemon, and (on Windows) WSL2.
 * Pure given a CommandRunner — the runner is the only side-effecting dependency.
 */
export async function preflight(
  platform: Platform,
  run: CommandRunner = defaultRunner,
): Promise<PreflightReport> {
  const checks: CheckResult[] = [];

  // 1. docker present
  const dockerVersion = await run("docker", ["--version"]);
  const dockerOk = dockerVersion.exitCode === 0;
  checks.push({
    name: "Docker installed",
    ok: dockerOk,
    detail: dockerOk ? dockerVersion.stdout.trim() : "docker not found on PATH",
    hint: dockerOk
      ? undefined
      : "Install Docker (Docker Desktop on macOS/Windows, Docker Engine on Linux): https://docs.docker.com/get-docker/",
  });

  // 2. compose v2 present (`docker compose version`)
  const composeVersion = await run("docker", ["compose", "version"]);
  const composeOk = composeVersion.exitCode === 0;
  checks.push({
    name: "Docker Compose v2",
    ok: composeOk,
    detail: composeOk
      ? composeVersion.stdout.trim()
      : "`docker compose` (v2) not available",
    hint: composeOk
      ? undefined
      : "Compose v2 ships with Docker Desktop / the docker-compose-plugin package. The legacy `docker-compose` (v1) is not supported.",
  });

  // 3. daemon reachable
  const daemon = await run("docker", ["info", "--format", "{{.ServerVersion}}"]);
  const daemonOk = daemon.exitCode === 0 && daemon.stdout.trim().length > 0;
  checks.push({
    name: "Docker daemon running",
    ok: daemonOk,
    detail: daemonOk
      ? `server ${daemon.stdout.trim()}`
      : "cannot reach the Docker daemon",
    hint: daemonOk
      ? undefined
      : "Start Docker Desktop, or the Docker service (`systemctl start docker`). On Windows this must run through WSL2.",
  });

  // 4. WSL2 advisory on Windows
  if (platform.os === "windows" && !platform.isWSL) {
    checks.push({
      name: "WSL2 backend",
      ok: false,
      detail: "Windows host detected without WSL2",
      hint: "Docker on Windows requires the WSL2 backend. Enable WSL2 and run this installer from inside your WSL2 distro.",
    });
  }

  const ok = checks.every((c) => c.ok);
  return { checks, ok };
}
