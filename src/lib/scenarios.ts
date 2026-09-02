import {
  autoFill,
  draftPlayer,
  projectedPoints,
  remaining,
  removePlayer,
  setFormation,
  spent,
  squadPlayers,
  swapPlayer,
} from "./engine";
import { formatPrice, slotLabel } from "./format";
import { projectSquad, type ProjectionOptions, type SquadProjection } from "./model";
import type { Actor, AutoFillStrategy, DraftState, Failure, FormationId, Objective, Pick as SquadPick } from "./types";

/*
 * Scenarios: an ordered plan of squad changes evaluated on a copy of the state. `simulate_scenarios`
 * runs several side by side and reports the outcome of each without touching the squad;
 * `apply_scenario` runs one and commits it atomically, so an agent can make a five-step change that
 * either lands whole or not at all. Steps run in this order: formation, removes, swaps, adds, fill.
 */

export interface ScenarioPlan {
  label: string;
  formation?: string;
  remove?: string[];
  swap?: { slotId: string; newPlayerId: string }[];
  add?: { playerId: string; slotId?: string }[];
  fill?: { strategy: AutoFillStrategy; objective: Objective } | null;
}

export interface ScenarioOutcome {
  label: string;
  state: DraftState;
  formation: FormationId;
  steps: string[];
  picks: SquadPick[];
  released: SquadPick[];
  spent: number;
  remaining: number;
  projectedPoints: number;
  projection: SquadProjection;
  complete: boolean;
}

export interface ScenarioFailure extends Failure {
  label: string;
  /** Steps that succeeded before the failing one. */
  steps: string[];
  failedStep: string;
}

export type ScenarioResult = { ok: true; value: ScenarioOutcome } | ScenarioFailure;

export interface ScenarioOptions {
  target?: number;
  samples?: number;
}

export function runScenario(
  initial: DraftState,
  plan: ScenarioPlan,
  actor: Actor,
  options: ScenarioOptions = {},
): ScenarioResult {
  let state = initial;
  const steps: string[] = [];
  const picks: SquadPick[] = [];
  const released: SquadPick[] = [];

  const abort = (failedStep: string, failure: Failure): ScenarioFailure => ({
    ok: false,
    code: failure.code,
    error: failure.error,
    label: plan.label,
    steps,
    failedStep,
  });

  if (plan.formation) {
    const step = `set formation ${plan.formation}`;
    const result = setFormation(state, { formation: plan.formation, force: false }, actor);
    if (!result.ok) return abort(step, result);
    state = result.value.state;
    released.push(...result.value.released);
    steps.push(`Formation ${result.value.from} → ${result.value.to}`);
  }

  for (const target of plan.remove ?? []) {
    const step = `remove ${target}`;
    const result = removePlayer(state, looksLikeSlot(state, target) ? { slotId: target } : { playerId: target }, actor);
    if (!result.ok) return abort(step, result);
    state = result.value.state;
    steps.push(`Removed ${result.value.player.name} from ${slotLabel(result.value.slotId)} (+${formatPrice(result.value.player.price)})`);
  }

  for (const swap of plan.swap ?? []) {
    const step = `swap ${swap.slotId} → ${swap.newPlayerId}`;
    const result = swapPlayer(state, swap, actor);
    if (!result.ok) return abort(step, result);
    state = result.value.state;
    picks.push(result.value.pick);
    const out = result.value.outgoing;
    steps.push(
      out
        ? `Swapped ${out.name} for ${result.value.pick.player.name} in ${slotLabel(result.value.pick.slotId)}`
        : `Drafted ${result.value.pick.player.name} into ${slotLabel(result.value.pick.slotId)}`,
    );
  }

  for (const add of plan.add ?? []) {
    const step = `add ${add.playerId}${add.slotId ? ` to ${add.slotId}` : ""}`;
    const result = draftPlayer(state, add, actor);
    if (!result.ok) return abort(step, result);
    state = result.value.state;
    picks.push(result.value.pick);
    steps.push(`Drafted ${result.value.pick.player.name} into ${slotLabel(result.value.pick.slotId)} (${formatPrice(result.value.pick.player.price)})`);
  }

  if (plan.fill) {
    const step = `auto-fill (${plan.fill.strategy}, ${plan.fill.objective})`;
    const result = autoFill(state, plan.fill, actor);
    if (!result.ok) {
      // A full squad is not a failed plan; there was just nothing left to fill.
      if (result.code !== "SQUAD_FULL") return abort(step, result);
      steps.push("Auto-fill skipped: squad already complete");
    } else {
      state = result.value.state;
      picks.push(...result.value.picks);
      steps.push(
        `Auto-filled ${result.value.picks.length} slot${result.value.picks.length === 1 ? "" : "s"} (${plan.fill.strategy}, ${plan.fill.objective})`,
      );
      for (const skip of result.value.skipped) steps.push(`Left ${slotLabel(skip.slotId)} empty: ${skip.reason}`);
    }
  }

  const players = squadPlayers(state);
  return {
    ok: true,
    value: {
      label: plan.label,
      state,
      formation: state.formation,
      steps,
      picks,
      released,
      spent: spent(state),
      remaining: remaining(state),
      projectedPoints: projectedPoints(state),
      projection: projectSquad(players, { target: options.target, samples: options.samples, ...armbands(state) }),
      complete: state.slots.every((slot) => slot.playerId !== null),
    },
  };
}

/** "FW1" / "gk" / "df 2" name slots; anything else is a player id or name. */
function looksLikeSlot(state: DraftState, text: string): boolean {
  const wanted = text.replace(/[\s_-]+/g, "").toUpperCase();
  return state.slots.some((slot) => slot.id.toUpperCase() === wanted);
}

export function currentProjection(state: DraftState, options: ScenarioOptions = {}): SquadProjection {
  return projectSquad(squadPlayers(state), { target: options.target, samples: options.samples, ...armbands(state) });
}

/** Captain and vice for the projection, so the armband shows up in every scenario's numbers. */
export function armbands(state: DraftState): Pick<ProjectionOptions, "captainId" | "viceId"> {
  return { captainId: state.assignments.captainId, viceId: state.assignments.viceId };
}
