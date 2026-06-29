import { execa } from "execa";
import { isAbsolute } from "node:path";
import pc from "picocolors";
import type { CheckResult, CommandRunner, PreflightReport } from "./preflight.js";
import type { FileOps } from "./fileops.js";
import type { SudoMode, Target } from "./targets.js";

/** Base ssh argv for a target, up to and including `user@host`. */
export function buildSshArgs(target: Target): string[] {
  return [
    "-i",
    target.keyPath,
    "-p",
    String(target.port),
    "-o",
    "BatchMode=yes", // key only — never block on a password prompt
    "-o",
    "StrictHostKeyChecking=accept-new", // TOFU: record host key on first connect
    "-o",
    "ConnectTimeout=10",
    `${target.user}@${target.host}`,
  ];
}

/**
 * Single-quote a token for the remote shell unless it is a safe bare word.
 * A leading `~` is intentionally kept bare so the remote shell expands it
 * (paths are generated/controlled, so leaving `~ / . : = @ % + ,` unquoted is safe).
 */
export function shQuote(s: string): string {
  if (/^[A-Za-z0-9_.~/:=@%,+-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Join argv into a remote shell command string with safe quoting. */
export function shJoin(parts: string[]): string {
  return parts.map(shQuote).join(" ");
}

/**
 * A CommandRunner that executes `<cmd> <args>` on the remote host over ssh.
 * Compatible with preflight(): returns { stdout, exitCode }. In dry-run mode it
 * prints the ssh invocation and returns success without connecting.
 */
export function sshRun(
  target: Target,
  opts: { dryRun?: boolean } = {},
): CommandRunner {
  const base = buildSshArgs(target);
  return async (cmd, args) => {
    const remote = shJoin([cmd, ...args]);
    if (opts.dryRun) {
      console.log(pc.dim(`$ ssh ${base.join(" ")} ${shQuote(remote)}`));
      return { stdout: "", exitCode: 0 };
    }
    const r = await execa("ssh", [...base, remote], { reject: false });
    return { stdout: r.stdout ?? "", exitCode: r.exitCode ?? 1 };
  };
}

/** Remote install dir + relative path → remote path (keeps ~ for shell expansion). */
function remotePath(target: Target, rel: string): string {
  return isAbsolute(rel) ? rel : `${target.remoteDir}/${rel}`;
}

function remoteDirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx <= 0 ? path : path.slice(0, idx);
}

/**
 * FileOps over ssh. Reads/writes/creates paths under the target's remoteDir.
 * Generated paths are controlled (alnum/slash/dot/dash) so they pass unquoted,
 * which also lets a leading `~` expand on the remote shell.
 */
export class RemoteFileOps implements FileOps {
  constructor(
    private readonly target: Target,
    private readonly run: CommandRunner,
    private readonly opts: { dryRun?: boolean } = {},
  ) {}

  async mkdirp(path: string): Promise<void> {
    await this.run("mkdir", ["-p", remotePath(this.target, path)]);
  }

  async writeFile(path: string, content: string): Promise<void> {
    const full = remotePath(this.target, path);
    const dir = remoteDirname(full);
    const remote = `mkdir -p ${dir} && cat > ${full}`;
    if (this.opts.dryRun) {
      console.log(
        pc.dim(`$ ssh ${buildSshArgs(this.target).join(" ")} ${shQuote(remote)}  # ← ${path}`),
      );
      return;
    }
    await execa("ssh", [...buildSshArgs(this.target), remote], { input: content });
  }

  async readFile(path: string): Promise<string | null> {
    const r = await this.run("cat", [remotePath(this.target, path)]);
    return r.exitCode === 0 ? r.stdout : null;
  }

  async exists(path: string): Promise<boolean> {
    const r = await this.run("test", ["-e", remotePath(this.target, path)]);
    return r.exitCode === 0;
  }

  async rm(path: string, recursive = false): Promise<void> {
    await this.run("rm", [recursive ? "-rf" : "-f", remotePath(this.target, path)]);
  }
}

/** Docker invocation prefix implied by a sudo mode when we cannot probe. */
export function defaultDockerPrefix(sudo: SudoMode): string[] {
  return sudo === "always" ? ["sudo", "docker"] : ["docker"];
}

/**
 * Decide how to invoke docker on the remote: directly, or via `sudo -n docker`.
 * Returns prefix=null when the daemon is unreachable both ways.
 */
export async function detectDockerPrefix(
  run: CommandRunner,
  sudo: SudoMode,
): Promise<{ prefix: string[] | null; detail: string }> {
  const fmt = ["info", "--format", "{{.ServerVersion}}"];

  if (sudo === "never") {
    const r = await run("docker", fmt);
    return r.exitCode === 0
      ? { prefix: ["docker"], detail: `server ${r.stdout.trim()}` }
      : { prefix: null, detail: "daemon unreachable as user (sudo disabled)" };
  }

  if (sudo === "always") {
    const r = await run("sudo", ["-n", "docker", ...fmt]);
    return r.exitCode === 0
      ? { prefix: ["sudo", "docker"], detail: `server ${r.stdout.trim()} (sudo)` }
      : { prefix: null, detail: "`sudo -n docker info` failed (needs NOPASSWD sudo)" };
  }

  // auto: prefer direct, fall back to passwordless sudo.
  const direct = await run("docker", fmt);
  if (direct.exitCode === 0) {
    return { prefix: ["docker"], detail: `server ${direct.stdout.trim()}` };
  }
  const viaSudo = await run("sudo", ["-n", "docker", ...fmt]);
  if (viaSudo.exitCode === 0) {
    return { prefix: ["sudo", "docker"], detail: `server ${viaSudo.stdout.trim()} (via sudo)` };
  }
  return { prefix: null, detail: "daemon unreachable as user or via `sudo -n`" };
}

/**
 * Remote environment check over ssh: docker present, compose v2, and a reachable
 * daemon (with automatic sudo detection). Returns the report plus the resolved
 * docker prefix to use for all subsequent commands.
 */
export async function remotePreflight(
  target: Target,
  run: CommandRunner,
  opts: { dryRun?: boolean } = {},
): Promise<{ report: PreflightReport; dockerPrefix: string[] }> {
  const checks: CheckResult[] = [];

  // In dry-run we cannot probe; assume the prefix implied by sudo mode.
  if (opts.dryRun) {
    return {
      report: {
        checks: [
          {
            name: "Remote checks skipped (--dry-run)",
            ok: true,
            detail: `would ssh into ${target.user}@${target.host}:${target.port}`,
          },
        ],
        ok: true,
      },
      dockerPrefix: defaultDockerPrefix(target.sudo),
    };
  }

  // 0. connectivity
  const probe = await run("echo", ["aai-ok"]);
  const connected = probe.exitCode === 0 && probe.stdout.includes("aai-ok");
  checks.push({
    name: "SSH connection",
    ok: connected,
    detail: connected
      ? `${target.user}@${target.host}:${target.port}`
      : "could not connect (key, host, port, or BatchMode auth)",
    hint: connected
      ? undefined
      : "Verify the host/IP, user, port and that the SSH key is authorized (key-only; no password prompt).",
  });
  if (!connected) {
    return { report: { checks, ok: false }, dockerPrefix: defaultDockerPrefix(target.sudo) };
  }

  // 1. docker present
  const dockerVersion = await run("docker", ["--version"]);
  const dockerOk = dockerVersion.exitCode === 0;
  checks.push({
    name: "Docker installed",
    ok: dockerOk,
    detail: dockerOk ? dockerVersion.stdout.trim() : "docker not found on the remote PATH",
    hint: dockerOk ? undefined : "Install Docker Engine on the VPS: https://docs.docker.com/engine/install/",
  });

  // 2. compose v2 present
  const composeVersion = await run("docker", ["compose", "version"]);
  const composeOk = composeVersion.exitCode === 0;
  checks.push({
    name: "Docker Compose v2",
    ok: composeOk,
    detail: composeOk ? composeVersion.stdout.trim() : "`docker compose` (v2) not available",
    hint: composeOk ? undefined : "Install the docker-compose-plugin (Compose v2) on the VPS.",
  });

  // 3. daemon reachable (+ sudo detection)
  const { prefix, detail } = await detectDockerPrefix(run, target.sudo);
  checks.push({
    name: "Docker daemon running",
    ok: prefix !== null,
    detail: prefix ? `${detail}${prefix[0] === "sudo" ? "" : ""}` : detail,
    hint: prefix
      ? undefined
      : "Add the SSH user to the `docker` group, or grant passwordless sudo for docker (NOPASSWD), or connect as root.",
  });

  const ok = checks.every((c) => c.ok);
  return { report: { checks, ok }, dockerPrefix: prefix ?? defaultDockerPrefix(target.sudo) };
}
