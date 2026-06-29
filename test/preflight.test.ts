import { describe, expect, it } from "vitest";
import { preflight, type CommandRunner } from "../src/core/preflight.js";
import { detectPlatform } from "../src/core/platform.js";
import type { Platform } from "../src/core/types.js";

const macos: Platform = { os: "macos", arch: "arm64", isWSL: false };

/** Build a mock runner from a map of "cmd args" → {stdout, exitCode}. */
function mockRunner(table: Record<string, { stdout: string; exitCode: number }>): CommandRunner {
  return async (cmd, args) => {
    const key = [cmd, ...args].join(" ");
    return table[key] ?? { stdout: "", exitCode: 127 };
  };
}

describe("preflight", () => {
  it("passes when docker, compose, and the daemon are all healthy", async () => {
    const run = mockRunner({
      "docker --version": { stdout: "Docker version 27.0.0", exitCode: 0 },
      "docker compose version": { stdout: "Docker Compose version v2.29.0", exitCode: 0 },
      "docker info --format {{.ServerVersion}}": { stdout: "27.0.0", exitCode: 0 },
    });
    const report = await preflight(macos, run);
    expect(report.ok).toBe(true);
    expect(report.checks.every((c) => c.ok)).toBe(true);
  });

  it("fails (with a hint) when docker is missing", async () => {
    const run = mockRunner({});
    const report = await preflight(macos, run);
    expect(report.ok).toBe(false);
    const dockerCheck = report.checks.find((c) => c.name === "Docker installed")!;
    expect(dockerCheck.ok).toBe(false);
    expect(dockerCheck.hint).toMatch(/get-docker/);
  });

  it("fails when the daemon is unreachable even if docker/compose exist", async () => {
    const run = mockRunner({
      "docker --version": { stdout: "Docker version 27.0.0", exitCode: 0 },
      "docker compose version": { stdout: "v2.29.0", exitCode: 0 },
      "docker info --format {{.ServerVersion}}": { stdout: "", exitCode: 1 },
    });
    const report = await preflight(macos, run);
    expect(report.ok).toBe(false);
    const daemon = report.checks.find((c) => c.name === "Docker daemon running")!;
    expect(daemon.ok).toBe(false);
  });

  it("adds a WSL2 check on Windows without WSL", async () => {
    const windows: Platform = { os: "windows", arch: "x64", isWSL: false };
    const run = mockRunner({
      "docker --version": { stdout: "Docker version 27.0.0", exitCode: 0 },
      "docker compose version": { stdout: "v2.29.0", exitCode: 0 },
      "docker info --format {{.ServerVersion}}": { stdout: "27.0.0", exitCode: 0 },
    });
    const report = await preflight(windows, run);
    const wsl = report.checks.find((c) => c.name === "WSL2 backend");
    expect(wsl).toBeDefined();
    expect(report.ok).toBe(false);
  });
});

describe("detectPlatform", () => {
  it("detects macos", () => {
    const p = detectPlatform({ platform: "darwin", arch: "arm64" });
    expect(p).toEqual({ os: "macos", arch: "arm64", isWSL: false });
  });

  it("detects plain linux (not WSL)", () => {
    const p = detectPlatform({
      platform: "linux",
      arch: "x64",
      release: "6.1.0-generic",
      env: {},
      readProcVersion: () => "Linux version 6.1.0 (gcc)",
    });
    expect(p.os).toBe("linux");
    expect(p.isWSL).toBe(false);
  });

  it("detects WSL2 via /proc/version", () => {
    const p = detectPlatform({
      platform: "linux",
      arch: "x64",
      release: "5.15.0-microsoft-standard-WSL2",
      env: {},
      readProcVersion: () => "Linux version 5.15.0 microsoft",
    });
    expect(p.isWSL).toBe(true);
  });

  it("detects WSL2 via env var", () => {
    const p = detectPlatform({
      platform: "linux",
      arch: "x64",
      release: "6.1.0",
      env: { WSL_DISTRO_NAME: "Ubuntu" },
      readProcVersion: () => "",
    });
    expect(p.isWSL).toBe(true);
  });
});
