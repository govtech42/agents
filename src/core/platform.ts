import { readFileSync } from "node:fs";
import os from "node:os";
import type { OS, Platform } from "./types.js";

/**
 * Detect the host OS, architecture, and whether we're inside WSL.
 *
 * Accepts injectable readers purely so tests can exercise the WSL/Windows
 * branches without a real environment.
 */
export function detectPlatform(
  deps: {
    platform?: NodeJS.Platform;
    arch?: string;
    release?: string;
    env?: NodeJS.ProcessEnv;
    readProcVersion?: () => string;
  } = {},
): Platform {
  const nodePlatform = deps.platform ?? process.platform;
  const arch = deps.arch ?? process.arch;
  const release = deps.release ?? os.release();
  const env = deps.env ?? process.env;
  const readProcVersion =
    deps.readProcVersion ?? (() => readFileSyncSafe("/proc/version"));

  let detectedOs: OS;
  if (nodePlatform === "darwin") detectedOs = "macos";
  else if (nodePlatform === "win32") detectedOs = "windows";
  else detectedOs = "linux";

  // WSL surfaces as Node platform "linux" but with "microsoft" in the kernel
  // release / /proc/version, or via the WSL_DISTRO_NAME env var.
  let isWSL = false;
  if (detectedOs === "linux") {
    const haystack = `${release} ${readProcVersion()}`.toLowerCase();
    isWSL =
      !!env.WSL_DISTRO_NAME ||
      haystack.includes("microsoft") ||
      haystack.includes("wsl");
  }

  return { os: detectedOs, arch, isWSL };
}

function readFileSyncSafe(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

export function describePlatform(p: Platform): string {
  const base = `${p.os} (${p.arch})`;
  return p.isWSL ? `${base} — WSL2` : base;
}
