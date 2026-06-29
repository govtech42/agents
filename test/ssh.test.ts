import { describe, expect, it } from "vitest";
import {
  RemoteFileOps,
  buildSshArgs,
  detectDockerPrefix,
  shJoin,
  shQuote,
} from "../src/core/ssh.js";
import type { CommandRunner } from "../src/core/preflight.js";
import type { Target } from "../src/core/targets.js";

const target: Target = {
  label: "prod",
  host: "1.2.3.4",
  user: "deploy",
  keyPath: "/home/me/.ssh/id",
  port: 2222,
  remoteDir: "~/aai",
  sudo: "auto",
};

function runnerFrom(
  handler: (cmd: string, args: string[]) => { stdout?: string; exitCode: number },
): CommandRunner {
  return async (cmd, args) => {
    const r = handler(cmd, args);
    return { stdout: r.stdout ?? "", exitCode: r.exitCode };
  };
}

describe("buildSshArgs", () => {
  it("includes key, port, batch/strict opts and user@host", () => {
    expect(buildSshArgs(target)).toEqual([
      "-i",
      "/home/me/.ssh/id",
      "-p",
      "2222",
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=accept-new",
      "-o",
      "ConnectTimeout=10",
      "deploy@1.2.3.4",
    ]);
  });
});

describe("shQuote / shJoin", () => {
  it("leaves safe words bare and quotes special tokens", () => {
    expect(shQuote("docker")).toBe("docker");
    expect(shQuote("~/aai/data")).toBe("~/aai/data");
    expect(shQuote("{{.ServerVersion}}")).toBe("'{{.ServerVersion}}'");
    expect(shQuote("a b")).toBe("'a b'");
    expect(shJoin(["docker", "compose", "up", "-d"])).toBe("docker compose up -d");
  });
});

describe("detectDockerPrefix", () => {
  it("auto: uses docker directly when reachable", async () => {
    const run = runnerFrom((c, a) =>
      c === "docker" && a[0] === "info" ? { stdout: "27.0", exitCode: 0 } : { exitCode: 1 },
    );
    expect((await detectDockerPrefix(run, "auto")).prefix).toEqual(["docker"]);
  });

  it("auto: falls back to passwordless sudo", async () => {
    const run = runnerFrom((c) => (c === "sudo" ? { stdout: "27.0", exitCode: 0 } : { exitCode: 1 }));
    expect((await detectDockerPrefix(run, "auto")).prefix).toEqual(["sudo", "docker"]);
  });

  it("auto: returns null when neither works", async () => {
    expect((await detectDockerPrefix(runnerFrom(() => ({ exitCode: 1 })), "auto")).prefix).toBeNull();
  });

  it("never: does not attempt sudo", async () => {
    let sudoTried = false;
    const run = runnerFrom((c) => {
      if (c === "sudo") {
        sudoTried = true;
        return { exitCode: 0 };
      }
      return { exitCode: 1 };
    });
    const r = await detectDockerPrefix(run, "never");
    expect(r.prefix).toBeNull();
    expect(sudoTried).toBe(false);
  });

  it("always: uses sudo docker", async () => {
    const run = runnerFrom((c) => (c === "sudo" ? { stdout: "27", exitCode: 0 } : { exitCode: 1 }));
    expect((await detectDockerPrefix(run, "always")).prefix).toEqual(["sudo", "docker"]);
  });
});

describe("RemoteFileOps", () => {
  it("builds remote commands rooted at remoteDir", async () => {
    const calls: [string, string[]][] = [];
    const run = runnerFrom((c, a) => {
      calls.push([c, a]);
      return c === "test" ? { exitCode: 0 } : { stdout: "data", exitCode: 0 };
    });
    const fo = new RemoteFileOps(target, run);

    await fo.mkdirp("data/hermes");
    const present = await fo.exists("docker-compose.yml");
    await fo.rm("data/x", true);
    const body = await fo.readFile("aai.json");

    expect(calls[0]).toEqual(["mkdir", ["-p", "~/aai/data/hermes"]]);
    expect(calls[1]).toEqual(["test", ["-e", "~/aai/docker-compose.yml"]]);
    expect(calls[2]).toEqual(["rm", ["-rf", "~/aai/data/x"]]);
    expect(calls[3]).toEqual(["cat", ["~/aai/aai.json"]]);
    expect(present).toBe(true);
    expect(body).toBe("data");
  });
});
