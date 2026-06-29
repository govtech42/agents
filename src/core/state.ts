import type { FileOps } from "./fileops.js";
import type { InstallerState, Selection } from "./types.js";

export const STATE_FILE = "aai.json";

const EMPTY: InstallerState = {
  version: 1,
  selection: { agents: [], extras: {} },
};

/** Load installer state from `<root>/aai.json` via FileOps, or empty if absent. */
export async function loadState(fileOps: FileOps): Promise<InstallerState> {
  const raw = await fileOps.readFile(STATE_FILE);
  if (raw === null) return structuredClone(EMPTY);
  try {
    const parsed = JSON.parse(raw) as InstallerState;
    if (parsed.version !== 1 || !parsed.selection) return structuredClone(EMPTY);
    parsed.selection.agents ??= [];
    parsed.selection.extras ??= {};
    return parsed;
  } catch {
    return structuredClone(EMPTY);
  }
}

/** Persist state (stamping updatedAt) via FileOps. */
export async function saveState(fileOps: FileOps, selection: Selection): Promise<InstallerState> {
  const state: InstallerState = {
    version: 1,
    selection,
    updatedAt: new Date().toISOString(),
  };
  await fileOps.writeFile(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
  return state;
}

/**
 * Merge a new selection into the existing one (incremental add). Agents union;
 * per-agent extras union. Returns the merged selection without persisting.
 */
export function mergeSelection(current: Selection, incoming: Selection): Selection {
  const agents = [...new Set([...current.agents, ...incoming.agents])];
  const extras: Record<string, string[]> = {};
  for (const agent of agents) {
    const merged = new Set([
      ...(current.extras[agent] ?? []),
      ...(incoming.extras[agent] ?? []),
    ]);
    if (merged.size > 0) extras[agent] = [...merged];
  }
  return { agents, extras };
}

/** Remove an agent (and its extras) from a selection. */
export function removeAgent(current: Selection, agentId: string): Selection {
  const agents = current.agents.filter((a) => a !== agentId);
  const extras: Record<string, string[]> = { ...current.extras };
  delete extras[agentId];
  return { agents, extras };
}
