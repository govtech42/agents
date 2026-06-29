import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  expandTilde,
  getTarget,
  isValidLabel,
  loadTargets,
  parseTarget,
  saveTarget,
  serializeTarget,
  type Target,
} from "../src/core/targets.js";
import { FlagError, parseTargetFlags } from "../src/cli/flags.js";

const t: Target = {
  label: "prod",
  host: "1.2.3.4",
  user: "deploy",
  keyPath: "/k/id",
  port: 2222,
  remoteDir: "~/aai",
  sudo: "auto",
};

describe("target serialize/parse", () => {
  it("round-trips a target", () => {
    expect(parseTarget(serializeTarget(t))).toEqual(t);
  });

  it("returns null when required fields are missing", () => {
    expect(parseTarget("AAI_TARGET_LABEL=x")).toBeNull();
  });

  it("applies defaults for optional fields", () => {
    const p = parseTarget("AAI_TARGET_LABEL=a\nAAI_TARGET_HOST=h\nAAI_TARGET_USER=u\nAAI_TARGET_KEY=/k");
    expect(p?.port).toBe(22);
    expect(p?.remoteDir).toBe("~/aai");
    expect(p?.sudo).toBe("auto");
  });
});

describe("isValidLabel / expandTilde", () => {
  it("accepts safe labels and rejects path-like ones", () => {
    expect(isValidLabel("prod-1.eu")).toBe(true);
    expect(isValidLabel("a/b")).toBe(false);
    expect(isValidLabel("")).toBe(false);
  });

  it("expands a leading ~", () => {
    expect(expandTilde("~/x")).toBe(join(homedir(), "x"));
    expect(expandTilde("/abs")).toBe("/abs");
  });
});

describe("save / load targets", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "aai-tg-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("saves and loads targets by label", () => {
    saveTarget(t, root);
    saveTarget({ ...t, label: "stg", host: "5.6.7.8" }, root);
    expect(loadTargets(root).map((x) => x.label)).toEqual(["prod", "stg"]);
    expect(getTarget("prod", root)?.host).toBe("1.2.3.4");
  });

  it("rejects an unsafe label", () => {
    expect(() => saveTarget({ ...t, label: "a/b" }, root)).toThrow();
  });
});

describe("parseTargetFlags", () => {
  let root: string;
  let key: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "aai-fl-"));
    key = join(root, "id");
    writeFileSync(key, "KEY");
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("requires host, user and key", () => {
    expect(() => parseTargetFlags({ host: "h", user: "u" })).toThrow(FlagError);
  });

  it("fails when the key file does not exist", () => {
    expect(() => parseTargetFlags({ host: "h", user: "u", key: "/nope/x" })).toThrow(/key not found/);
  });

  it("builds a target with defaults", () => {
    expect(parseTargetFlags({ host: "h", user: "u", key })).toMatchObject({
      host: "h",
      user: "u",
      keyPath: key,
      port: 22,
      remoteDir: "~/aai",
      sudo: "auto",
      label: "h",
    });
  });

  it("validates port and sudo", () => {
    expect(() => parseTargetFlags({ host: "h", user: "u", key, port: "abc" })).toThrow();
    expect(() => parseTargetFlags({ host: "h", user: "u", key, sudo: "maybe" })).toThrow();
  });
});
