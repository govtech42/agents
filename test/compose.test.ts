import { describe, expect, it } from "vitest";
import { buildPlan, serializeCompose, PlanError } from "../src/core/compose.js";
import { parseSelectionFlags } from "../src/cli/flags.js";

describe("buildPlan", () => {
  it("attaches gbrain to an agent: service, depends_on, env + Dockerfile wiring", () => {
    const selection = parseSelectionFlags({
      agents: "openclaw",
      extras: "openclaw:gbrain",
    });
    const plan = buildPlan(selection);

    // gbrain is a single service (PGLite — no separate postgres).
    expect(plan.services.map((s) => s.name).sort()).toEqual(["gbrain", "openclaw"]);

    const services = plan.compose.services as Record<string, any>;
    // Agent depends on gbrain and is pointed at its MCP URL.
    expect(services.openclaw.depends_on).toContain("gbrain");
    expect(services.openclaw.environment.GBRAIN_MCP_URL).toBe("http://gbrain:7077/mcp");

    // gbrain builds from a generated Dockerfile, persists to data/, on :7077.
    expect(services.gbrain.build.dockerfile).toBe("templates/gbrain.Dockerfile");
    expect(services.gbrain.volumes).toContain("./data/gbrain:/data");
    expect(services.gbrain.ports).toContain("7077:7077");

    // The extra's Dockerfile is materialized; volume dirs are scaffolded.
    expect(plan.dockerfiles.map((d) => d.path)).toContain("templates/gbrain.Dockerfile");
    expect(plan.volumeDirs).toContain("data/gbrain");
    expect(plan.volumeDirs).toContain("config/openclaw");
  });

  it("mounts the docker socket for nanoclaw and surfaces a warning", () => {
    const plan = buildPlan(parseSelectionFlags({ agents: "nanoclaw" }));
    const services = plan.compose.services as Record<string, any>;
    expect(services.nanoclaw.volumes).toContain(
      "/var/run/docker.sock:/var/run/docker.sock",
    );
    expect(plan.warnings.join(" ")).toMatch(/docker\.sock/);
  });

  it("does not duplicate shared extra services across agents", () => {
    const plan = buildPlan(
      parseSelectionFlags({
        agents: "hermes,openclaw",
        extras: "hermes:gbrain,openclaw:gbrain",
      }),
    );
    // gbrain appears once; both agents depend on it.
    const names = plan.services.map((s) => s.name).sort();
    expect(names).toEqual(["gbrain", "hermes", "openclaw"]);
    const services = plan.compose.services as Record<string, any>;
    expect(services.hermes.depends_on).toContain("gbrain");
    expect(services.openclaw.depends_on).toContain("gbrain");
  });

  it("collects Dockerfile templates for build-based recipes", () => {
    const plan = buildPlan(parseSelectionFlags({ agents: "openclaw" }));
    expect(plan.dockerfiles.map((d) => d.path)).toContain(
      "templates/openclaw.Dockerfile",
    );
  });

  it("rejects an empty selection", () => {
    expect(() => buildPlan({ agents: [], extras: {} })).toThrow(PlanError);
  });
});
