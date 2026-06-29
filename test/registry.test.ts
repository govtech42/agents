import { describe, expect, it } from "vitest";
import {
  extras,
  extrasForAgent,
  extraAppliesTo,
  getExtra,
  getRecipe,
  recipes,
} from "../src/core/registry.js";

describe("registry", () => {
  it("exposes the five agents", () => {
    expect(recipes.map((r) => r.id)).toEqual([
      "openclaw",
      "nanoclaw",
      "ironclaw",
      "hermes",
      "paperclip",
    ]);
  });

  it("exposes the gbrain extra applying to hermes and openclaw", () => {
    expect(extras.map((e) => e.id)).toEqual(["gbrain"]);
    expect(extrasForAgent("hermes").map((e) => e.id)).toEqual(["gbrain"]);
    expect(extrasForAgent("openclaw").map((e) => e.id)).toEqual(["gbrain"]);
    expect(extrasForAgent("nanoclaw")).toEqual([]);
  });

  it("validates extra applicability", () => {
    expect(extraAppliesTo("gbrain", "hermes")).toBe(true);
    expect(extraAppliesTo("gbrain", "nanoclaw")).toBe(false);
    expect(extraAppliesTo("nope", "hermes")).toBe(false);
  });

  it("each recipe has a unique primary service name and volumes under data/ or config/", () => {
    const names = new Set<string>();
    for (const r of recipes) {
      expect(names.has(r.service.name)).toBe(false);
      names.add(r.service.name);
      for (const v of r.service.volumes ?? []) {
        const ok =
          v.hostPath.startsWith("data/") ||
          v.hostPath.startsWith("config/") ||
          v.hostPath.startsWith("/"); // absolute (e.g. docker socket)
        expect(ok, `${r.id} volume ${v.hostPath}`).toBe(true);
      }
    }
  });

  it("nanoclaw flags the docker socket mount as sensitive", () => {
    const nano = getRecipe("nanoclaw")!;
    expect(nano.service.warnings?.length).toBeGreaterThan(0);
    const hasSocket = nano.service.volumes?.some(
      (v) => v.hostPath === "/var/run/docker.sock",
    );
    expect(hasSocket).toBe(true);
  });

  it("gbrain contributes a single gbrain service (PGLite, no postgres)", () => {
    const g = getExtra("gbrain")!;
    expect(g.services.map((s) => s.name)).toEqual(["gbrain"]);
    expect(g.wireEnv?.GBRAIN_MCP_URL).toBe("http://gbrain:7077/mcp");
  });
});
