import type { Extra, Recipe } from "./types.js";
import { openclaw } from "../recipes/openclaw.js";
import { nanoclaw } from "../recipes/nanoclaw.js";
import { ironclaw } from "../recipes/ironclaw.js";
import { hermes } from "../recipes/hermes.js";
import { paperclip } from "../recipes/paperclip.js";
import { gbrain } from "../extras/gbrain.js";

/** All agent recipes, in display order. */
export const recipes: Recipe[] = [openclaw, nanoclaw, ironclaw, hermes, paperclip];

/** All available extras. */
export const extras: Extra[] = [gbrain];

const recipeById = new Map(recipes.map((r) => [r.id, r]));
const extraById = new Map(extras.map((e) => [e.id, e]));

export function getRecipe(id: string): Recipe | undefined {
  return recipeById.get(id);
}

export function getExtra(id: string): Extra | undefined {
  return extraById.get(id);
}

/** Extras that can be attached to a given agent. */
export function extrasForAgent(agentId: string): Extra[] {
  return extras.filter((e) => e.appliesTo.includes(agentId));
}

/** True when `extraId` is a valid extra and applies to `agentId`. */
export function extraAppliesTo(extraId: string, agentId: string): boolean {
  const extra = extraById.get(extraId);
  return !!extra && extra.appliesTo.includes(agentId);
}
