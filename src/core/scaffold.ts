import type { ComposePlan } from "./compose.js";
import { serializeCompose } from "./compose.js";
import type { FileOps } from "./fileops.js";

export interface ScaffoldResult {
  /** Volume directories ensured (relative to root). */
  createdDirs: string[];
  /** Files written this run (relative to root). */
  writtenFiles: string[];
  /** Files that already existed and were left untouched. */
  skippedFiles: string[];
}

/**
 * Materialize a plan through a FileOps port (local fs or remote ssh):
 *  - ensure data/<agent> and config/<agent> volume dirs,
 *  - write Dockerfile templates (always regenerated),
 *  - write default env files (only if absent — never clobber user secrets),
 *  - write docker-compose.yml (always regenerated).
 *
 * Idempotent: existing config/env files are preserved; compose + Dockerfiles are
 * regenerated. Paths are relative; the FileOps resolves them against its root.
 */
export async function scaffold(plan: ComposePlan, fileOps: FileOps): Promise<ScaffoldResult> {
  const createdDirs: string[] = [];
  const writtenFiles: string[] = [];
  const skippedFiles: string[] = [];

  // 1. Volume directories.
  for (const dir of plan.volumeDirs) {
    await fileOps.mkdirp(dir);
    createdDirs.push(dir);
  }

  // 2. Dockerfile templates (always regenerated).
  for (const df of plan.dockerfiles) {
    await fileOps.writeFile(df.path, df.content);
    writtenFiles.push(df.path);
  }

  // 3. Env files — only create if missing (preserve user edits/secrets).
  for (const ef of plan.envFiles) {
    if (await fileOps.exists(ef.path)) {
      skippedFiles.push(ef.path);
      continue;
    }
    await fileOps.writeFile(ef.path, ef.content);
    writtenFiles.push(ef.path);
  }

  // 4. docker-compose.yml (always regenerated).
  await fileOps.writeFile("docker-compose.yml", serializeCompose(plan.compose));
  writtenFiles.push("docker-compose.yml");

  return { createdDirs, writtenFiles, skippedFiles };
}
