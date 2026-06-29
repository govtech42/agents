import { describe, expect, it } from "vitest";
import { FlagError, parseSelectionFlags } from "../src/cli/flags.js";

describe("parseSelectionFlags", () => {
  it("parses a single agent", () => {
    expect(parseSelectionFlags({ agents: "hermes" })).toEqual({
      agents: ["hermes"],
      extras: {},
    });
  });

  it("parses multiple agents and an agent:extra pair", () => {
    const sel = parseSelectionFlags({
      agents: "hermes,openclaw",
      extras: "hermes:gbrain",
    });
    expect(sel.agents.sort()).toEqual(["hermes", "openclaw"]);
    expect(sel.extras).toEqual({ hermes: ["gbrain"] });
  });

  it("tolerates whitespace and dedupes extras", () => {
    const sel = parseSelectionFlags({
      agents: " hermes , openclaw ",
      extras: "hermes:gbrain, hermes:gbrain",
    });
    expect(sel.extras).toEqual({ hermes: ["gbrain"] });
  });

  it("requires --agents", () => {
    expect(() => parseSelectionFlags({})).toThrow(FlagError);
  });

  it("rejects unknown agents", () => {
    expect(() => parseSelectionFlags({ agents: "ghost" })).toThrow(/Unknown agent/);
  });

  it("rejects malformed extras", () => {
    expect(() =>
      parseSelectionFlags({ agents: "hermes", extras: "gbrain" }),
    ).toThrow(/Expected "agent:extra"/);
  });

  it("rejects extras whose agent is not selected", () => {
    expect(() =>
      parseSelectionFlags({ agents: "hermes", extras: "openclaw:gbrain" }),
    ).toThrow(/not in --agents/);
  });

  it("rejects extras that do not apply to the agent", () => {
    expect(() =>
      parseSelectionFlags({ agents: "nanoclaw", extras: "nanoclaw:gbrain" }),
    ).toThrow(/does not apply/);
  });

  it("rejects unknown extras", () => {
    expect(() =>
      parseSelectionFlags({ agents: "hermes", extras: "hermes:nope" }),
    ).toThrow(/Unknown extra/);
  });
});
