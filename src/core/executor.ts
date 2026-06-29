import { execa } from "execa";
import pc from "picocolors";
import type { CommandRunner } from "./preflight.js";
import { localCommandRunner } from "./preflight.js";
import type { FileOps } from "./fileops.js";
import { LocalFileOps } from "./fileops.js";
import { DockerRunner, parsePsOutput, type DockerPsRow } from "./runner.js";
import type { Target } from "./targets.js";
import { RemoteFileOps, buildSshArgs, shJoin, sshRun } from "./ssh.js";

/**
 * An execution environment for the installer: where files are written and where
 * `docker compose` runs. LocalExecutor targets this machine; RemoteExecutor
 * targets a VPS over ssh. install/doctor/list/uninstall orchestrate against this
 * interface and stay agnostic of local-vs-remote.
 */
export interface Executor {
  /** Human label for headers/reports, e.g. "local" or "prod (deploy@1.2.3.4)". */
  describe(): string;
  /** Install root: local cwd, or the remote dir on the VPS. */
  readonly root: string;
  /** Command runner (for preflight). */
  readonly run: CommandRunner;
  /** File materialization port. */
  readonly fileOps: FileOps;
  /** Docker invocation prefix: ["docker"] or ["sudo","docker"]. */
  readonly dockerPrefix: string[];
  compose(args: string[]): Promise<void>;
  up(opts?: { build?: boolean }): Promise<void>;
  down(opts?: { volumes?: boolean }): Promise<void>;
  ps(): Promise<DockerPsRow[]>;
}

/** Local executor — preserves the original behavior exactly. */
export class LocalExecutor implements Executor {
  readonly fileOps: FileOps;
  readonly run: CommandRunner = localCommandRunner;
  readonly dockerPrefix = ["docker"];
  private readonly runner: DockerRunner;

  constructor(
    public readonly root: string = process.cwd(),
    private readonly dryRun = false,
  ) {
    this.fileOps = new LocalFileOps(root);
    this.runner = new DockerRunner({ cwd: root, dryRun });
  }

  describe(): string {
    return "local";
  }
  compose(args: string[]): Promise<void> {
    return this.runner.compose(args);
  }
  up(opts: { build?: boolean } = {}): Promise<void> {
    return this.runner.up(opts);
  }
  down(opts: { volumes?: boolean } = {}): Promise<void> {
    return this.runner.down(opts);
  }
  ps(): Promise<DockerPsRow[]> {
    return this.runner.ps();
  }
}

/** Remote executor — files via ssh, `docker compose` run in the remote dir. */
export class RemoteExecutor implements Executor {
  readonly fileOps: FileOps;
  readonly run: CommandRunner;
  readonly root: string;

  constructor(
    private readonly target: Target,
    readonly dockerPrefix: string[],
    private readonly dryRun = false,
  ) {
    this.root = target.remoteDir;
    this.run = sshRun(target, { dryRun });
    this.fileOps = new RemoteFileOps(target, this.run, { dryRun });
  }

  describe(): string {
    return `${this.target.label} (${this.target.user}@${this.target.host})`;
  }

  /** `cd <remoteDir> && <prefix> compose <args>` over ssh. */
  compose(args: string[]): Promise<void> {
    const remote = `cd ${this.target.remoteDir} && ${shJoin([...this.dockerPrefix, "compose", ...args])}`;
    if (this.dryRun) {
      console.log(pc.dim(`$ ssh ${buildSshArgs(this.target).join(" ")} ${JSON.stringify(remote)}`));
      return Promise.resolve();
    }
    return execa("ssh", [...buildSshArgs(this.target), remote], { stdio: "inherit" }).then(
      () => undefined,
    );
  }

  up(opts: { build?: boolean } = {}): Promise<void> {
    const args = ["up", "-d"];
    if (opts.build) args.push("--build");
    return this.compose(args);
  }

  down(opts: { volumes?: boolean } = {}): Promise<void> {
    const args = ["down"];
    if (opts.volumes) args.push("-v");
    return this.compose(args);
  }

  async ps(): Promise<DockerPsRow[]> {
    if (this.dryRun) return [];
    const remote = `cd ${this.target.remoteDir} && ${shJoin([...this.dockerPrefix, "compose", "ps", "--format", "json"])}`;
    const r = await execa("ssh", [...buildSshArgs(this.target), remote], { reject: false });
    return parsePsOutput(r.stdout ?? "");
  }
}
