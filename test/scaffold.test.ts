import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPlan } from "../src/core/compose.js";
import { scaffold } from "../src/core/scaffold.js";
import { LocalFileOps } from "../src/core/fileops.js";
import { parseSelectionFlags } from "../src/cli/flags.js";
import { loadState, mergeSelection, removeAgent, saveState } from "../src/core/state.js";

let root: string;
let fs: LocalFileOps;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aai-test-"));
  fs = new LocalFileOps(root);
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("scaffold", () => {
  it("materializes dirs, Dockerfile, env file, and compose", async () => {
    const plan = buildPlan(parseSelectionFlags({ agents: "hermes", extras: "hermes:gbrain" }));
    const result = await scaffold(plan, fs);

    expect(existsSync(join(root, "data/hermes"))).toBe(true);
    expect(existsSync(join(root, "config/hermes"))).toBe(true);
    expect(existsSync(join(root, "data/gbrain"))).toBe(true);
    expect(existsSync(join(root, "templates/hermes.Dockerfile"))).toBe(true);
    expect(existsSync(join(root, "config/hermes/.env"))).toBe(true);
    expect(existsSync(join(root, "docker-compose.yml"))).toBe(true);

    expect(result.writtenFiles).toContain("docker-compose.yml");
    const compose = readFileSync(join(root, "docker-compose.yml"), "utf8");
    expect(compose).toContain("dockerfile: templates/hermes.Dockerfile");
  });

  it("never clobbers an existing env file (preserves user secrets)", async () => {
    const plan = buildPlan(parseSelectionFlags({ agents: "hermes" }));
    await scaffold(plan, fs);
    const envPath = join(root, "config/hermes/.env");
    writeFileSync(envPath, "ANTHROPIC_API_KEY=secret\n");

    const result = await scaffold(plan, fs);
    expect(result.skippedFiles).toContain("config/hermes/.env");
    expect(readFileSync(envPath, "utf8")).toBe("ANTHROPIC_API_KEY=secret\n");
  });
});

describe("state", () => {
  it("round-trips a selection through aai.json", async () => {
    const sel = parseSelectionFlags({ agents: "hermes", extras: "hermes:gbrain" });
    await saveState(fs, sel);
    const loaded = await loadState(fs);
    expect(loaded.selection).toEqual(sel);
    expect(loaded.updatedAt).toBeTypeOf("string");
  });

  it("returns an empty selection when no state file exists", async () => {
    expect((await loadState(fs)).selection).toEqual({ agents: [], extras: {} });
  });

  it("merges selections incrementally", () => {
    const a = parseSelectionFlags({ agents: "hermes", extras: "hermes:gbrain" });
    const b = parseSelectionFlags({ agents: "openclaw" });
    const merged = mergeSelection(a, b);
    expect(merged.agents.sort()).toEqual(["hermes", "openclaw"]);
    expect(merged.extras).toEqual({ hermes: ["gbrain"] });
  });

  it("removes an agent and its extras", () => {
    const a = parseSelectionFlags({ agents: "hermes,openclaw", extras: "hermes:gbrain" });
    const next = removeAgent(a, "hermes");
    expect(next.agents).toEqual(["openclaw"]);
    expect(next.extras.hermes).toBeUndefined();
  });
});
