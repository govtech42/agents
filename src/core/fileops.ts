import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

/**
 * Filesystem port used by scaffold/state so the same orchestration works on the
 * local machine (LocalFileOps) or on a remote VPS over SSH (RemoteFileOps in
 * core/ssh.ts). All paths are relative to the executor's `root` unless absolute.
 */
export interface FileOps {
  /** Create a directory (and parents). No-op if it already exists. */
  mkdirp(path: string): Promise<void>;
  /** Write a file, creating parent dirs. Overwrites existing content. */
  writeFile(path: string, content: string): Promise<void>;
  /** Read a file, or return null when it does not exist. */
  readFile(path: string): Promise<string | null>;
  /** True when the path exists (file or directory). */
  exists(path: string): Promise<boolean>;
  /** Remove a path. `recursive` deletes directories. No-op if absent. */
  rm(path: string, recursive?: boolean): Promise<void>;
}

/**
 * Local filesystem implementation. Paths are resolved against `root` (defaults
 * to the process cwd) unless already absolute.
 */
export class LocalFileOps implements FileOps {
  constructor(private readonly root: string = process.cwd()) {}

  private abs(path: string): string {
    return isAbsolute(path) ? path : resolve(this.root, path);
  }

  async mkdirp(path: string): Promise<void> {
    mkdirSync(this.abs(path), { recursive: true });
  }

  async writeFile(path: string, content: string): Promise<void> {
    const target = this.abs(path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
  }

  async readFile(path: string): Promise<string | null> {
    const target = this.abs(path);
    if (!existsSync(target)) return null;
    try {
      return readFileSync(target, "utf8");
    } catch {
      return null;
    }
  }

  async exists(path: string): Promise<boolean> {
    return existsSync(this.abs(path));
  }

  async rm(path: string, recursive = false): Promise<void> {
    const target = this.abs(path);
    if (existsSync(target)) rmSync(target, { recursive, force: true });
  }
}
