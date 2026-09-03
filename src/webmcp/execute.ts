import type * as z from "zod";
import type { StoreApi } from "zustand/vanilla";
import { briefLines, composeBrief } from "@/lib/assignments";
import {
  describeLineup,
  filterPlayers,
  findUpgrades,
  resolvePlayer,
  squadPlayers,
  summarize,
  valuePerMillion,
} from "@/lib/engine";
import { formatPrice } from "@/lib/format";
import { FORMATIONS } from "@/lib/formations";
import { playerOutlook, projectSquad, type SquadProjection } from "@/lib/model";
import { armbands, currentProjection, runScenario, type ScenarioOutcome, type ScenarioPlan } from "@/lib/scenarios";
import type { DraftStore } from "@/lib/store";
import { DUTY_LABEL, type DraftState, type ErrorCode, type Player } from "@/lib/types";
import { isToolName, type ToolName } from "./definitions";
import type { JsonObject, JsonValue } from "./json";
import { TOOL_INPUT, type ScenarioPlanInput } from "./schemas";

/*
 * Tool execution. Everything goes through the same store actions the UI uses, with actor "agent",
 * so the activity feed attributes every change correctly. Results are plain JSON-serialisable
 * objects; failures come back as { ok: false, error } instead of thrown exceptions so the agent
 * always gets a readable explanation. Every call, success or failure, is recorded for the console.
 */

export interface ToolFailure {
  ok: false;
  code: ErrorCode | "UNKNOWN_TOOL";
  error: string;
  /** Structured context for failures that have some (which scenario step broke, what it tried). */
  detail?: JsonObject;
}

export interface ToolSuccess {
  ok: true;
  /** One sentence an agent can relay verbatim. */
  message: string;
  [key: string]: JsonValue;
}

export type ToolResult = ToolFailure | ToolSuccess;

type Store = StoreApi<DraftStore>;

function invalidInput(error: z.ZodError): ToolFailure {
  const text = error.issues
    .map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
    .join(" ");
  return { ok: false, code: "INVALID_INPUT", error: text };
}

/**
 * Pairs a tool's parser with its handler so the handler only ever sees parsed input. Rejections are
 * written to the activity feed like engine failures, so a bad call is visible on screen.
 */
function tool<S extends z.ZodType>(
  name: ToolName,
  schema: S,
  handler: (store: Store, input: z.output<S>) => ToolResult,
) {
  return (store: Store, input: JsonObject): ToolResult => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const failure = invalidInput(parsed.error);
      store.getState().recordFailure("agent", `Rejected ${name} call — ${failure.error}`);
      return failure;
    }
    return handler(store, parsed.data);
  };
}

function stateOf(store: Store): DraftState {
  const s = store.getState();
  return { budgetTotal: s.budgetTotal, formation: s.formation, slots: s.slots, players: s.players, assignments: s.assignments };
}

function publicPlayer(player: Player) {
  const outlook = playerOutlook(player);
  return {
    id: player.id,
    name: player.name,
    position: player.position,
    team: player.team,
    price: player.price,
    projectedPoints: player.projectedPoints,
    pointsPerMillion: Math.round(valuePerMillion(player) * 10) / 10,
    floor: outlook.p10,
    ceiling: outlook.p90,
  };
}

function publicProjection(projection: SquadProjection) {
  return {
    mean: projection.mean,
    sd: projection.sd,
    p10: projection.p10,
    p50: projection.p50,
    p90: projection.p90,
    target: projection.target,
    probabilityAtLeast: projection.probabilityAtLeast,
    samples: projection.samples,
    clubStacks: projection.clubStacks,
  };
}

function squadSnapshot(store: Store) {
  const summary = summarize(stateOf(store));
  return {
    formation: summary.formation,
    filled: `${summary.filledSlots}/${summary.totalSlots}`,
    spent: summary.spent,
    remaining: summary.remaining,
    projectedPoints: summary.projectedPoints,
    emptySlotIds: summary.emptySlotIds,
    complete: summary.complete,
  };
}

function publicBrief(state: DraftState) {
  const lines = briefLines(state);
  const captain = state.assignments.captainId ? state.players.find((p) => p.id === state.assignments.captainId) : undefined;
  const vice = state.assignments.viceId ? state.players.find((p) => p.id === state.assignments.viceId) : undefined;
  return {
    captain: captain ? { id: captain.id, name: captain.name } : null,
    vice: vice ? { id: vice.id, name: vice.name } : null,
    protectedPlayerIds: lines.filter((line) => line.duties.includes("protected")).map((line) => line.playerId),
    players: lines.map((line) => ({
      id: line.playerId,
      name: line.name,
      slotId: line.slotId,
      armband: line.armband,
      duties: line.duties,
      note: line.note,
    })),
    text: composeBrief(state),
  };
}

function toPlan(input: ScenarioPlanInput): ScenarioPlan {
  return {
    label: input.label,
    formation: input.formation,
    remove: input.remove,
    swap: input.swap,
    add: input.add,
    fill: input.fill,
  };
}

function publicScenario(outcome: ScenarioOutcome, baseline: { points: number; mean: number; p10: number; p90: number }) {
  return {
    label: outcome.label,
    ok: true,
    formation: outcome.formation,
    steps: outcome.steps,
    spent: outcome.spent,
    remaining: outcome.remaining,
    complete: outcome.complete,
    projectedPoints: outcome.projectedPoints,
    projection: publicProjection(outcome.projection),
    delta: {
      projectedPoints: outcome.projectedPoints - baseline.points,
      mean: outcome.projection.mean - baseline.mean,
      p10: outcome.projection.p10 - baseline.p10,
      p90: outcome.projection.p90 - baseline.p90,
    },
    picks: outcome.picks.map((pick) => ({ slotId: pick.slotId, player: publicPlayer(pick.player), reason: pick.reason ?? null })),
    released: outcome.released.map((pick) => ({ slotId: pick.slotId, player: publicPlayer(pick.player) })),
  };
}

function summaryLine(result: ToolResult): string {
  return result.ok ? result.message : result.error;
}

export function executeTool(store: Store, name: string, input: JsonObject): ToolResult {
  const started = nowMs();
  let result: ToolResult;
  try {
    if (!isToolName(name)) {
      const error = `Unknown tool "${name}".`;
      store.getState().recordFailure("agent", `Rejected call — ${error}`);
      result = { ok: false, code: "UNKNOWN_TOOL", error };
    } else {
      result = HANDLERS[name](store, input);
    }
  } catch (cause) {
    const error = `${name} could not complete: ${errorMessage(cause)}`;
    result = { ok: false, code: "INTERNAL_ERROR", error };
    try {
      store.getState().recordFailure("agent", `Tool failed safely — ${error}`);
    } catch {
      // Returning a result is more important than diagnostics if the store itself is damaged.
    }
  }
  try {
    store.getState().recordCall({
      tool: name,
      input: compactJson(input),
      ok: result.ok,
      summary: summaryLine(result),
      durationMs: Math.max(0, Math.round(nowMs() - started)),
    });
  } catch {
    // A broken diagnostic sink must never turn a tool result into a thrown exception.
  }
  return result;
}

function compactJson(value: JsonObject): string {
  let text: string;
  try {
    text = JSON.stringify(value) ?? "{}";
  } catch {
    return "[input could not be serialised]";
  }
  return text.length > 400 ? `${text.slice(0, 397)}...` : text;
}

function nowMs(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim()) return cause.message;
  return "unexpected internal error";
}

const HANDLERS: Record<ToolName, (store: Store, input: JsonObject) => ToolResult> = {
  list_available_players: tool("list_available_players", TOOL_INPUT.list_available_players, (store, input) => {
    const state = stateOf(store);
    const all = filterPlayers(state, { ...input, limit: undefined });
    const players = all.slice(0, input.limit);
    const squad = squadSnapshot(store);
    return {
      ok: true,
      message: `${all.length} player${all.length === 1 ? "" : "s"} match; showing ${players.length}, sorted by ${input.sort}.`,
      count: all.length,
      filters: {
        position: input.position ?? null,
        team: input.team ?? null,
        maxPrice: input.maxPrice ?? null,
        minPrice: input.minPrice ?? null,
        search: input.search ?? null,
        sort: input.sort,
      },
      budgetRemaining: squad.remaining,
      emptySlotIds: squad.emptySlotIds,
      players: players.map(publicPlayer),
    };
  }),

  get_roster_summary: tool("get_roster_summary", TOOL_INPUT.get_roster_summary, (store) => {
    const state = stateOf(store);
    const summary = summarize(state);
    const projection = currentProjection(state);
    return {
      ok: true,
      message: `${summary.formation}, ${summary.filledSlots}/${summary.totalSlots} filled, ${formatPrice(summary.remaining)} left, ${summary.projectedPoints} projected points (p10 ${projection.p10}, p90 ${projection.p90}).`,
      formation: summary.formation,
      lineup: describeLineup(summary.formation),
      budget: {
        total: summary.budgetTotal,
        spent: summary.spent,
        remaining: summary.remaining,
      },
      projectedPoints: summary.projectedPoints,
      projection: publicProjection(projection),
      filledSlots: summary.filledSlots,
      totalSlots: summary.totalSlots,
      complete: summary.complete,
      slots: summary.slots.map((slot) => ({
        slotId: slot.slotId,
        position: slot.type,
        player: slot.player,
        filledBy: slot.filledBy,
      })),
      brief: publicBrief(state),
      availableFormations: Object.values(FORMATIONS).map((f) => ({ id: f.id, lineup: describeLineup(f.id), note: f.note })),
    };
  }),

  draft_player: tool("draft_player", TOOL_INPUT.draft_player, (store, input) => {
    const result = store.getState().draft(input, "agent");
    if (!result.ok) return result;
    const { slotId, player } = result.value;
    return {
      ok: true,
      message: `Drafted ${player.name} (${player.position}, ${player.team}) into ${slotId} for ${formatPrice(player.price)}.`,
      pick: { slotId, player: publicPlayer(player) },
      squad: squadSnapshot(store),
    };
  }),

  remove_player: tool("remove_player", TOOL_INPUT.remove_player, (store, input) => {
    const result = store.getState().remove(input, "agent");
    if (!result.ok) return result;
    const { slotId, player } = result.value;
    return {
      ok: true,
      message: `Removed ${player.name} from ${slotId}; ${formatPrice(player.price)} returned to the budget.`,
      removed: { slotId, player: publicPlayer(player) },
      squad: squadSnapshot(store),
    };
  }),

  swap_player: tool("swap_player", TOOL_INPUT.swap_player, (store, input) => {
    const result = store.getState().swap(input, "agent");
    if (!result.ok) return result;
    const { outgoing, pick } = result.value;
    return {
      ok: true,
      message: outgoing
        ? `Swapped ${outgoing.name} (${formatPrice(outgoing.price)}) for ${pick.player.name} (${formatPrice(pick.player.price)}) in ${pick.slotId}.`
        : `${pick.slotId} was empty, so ${pick.player.name} was drafted into it for ${formatPrice(pick.player.price)}.`,
      outgoing: outgoing ? publicPlayer(outgoing) : null,
      incoming: publicPlayer(pick.player),
      slotId: pick.slotId,
      squad: squadSnapshot(store),
    };
  }),

  auto_fill_roster: tool("auto_fill_roster", TOOL_INPUT.auto_fill_roster, (store, input) => {
    const result = store.getState().autoFill(input, "agent");
    if (!result.ok) return result;
    const outcome = result.value;
    const squad = squadSnapshot(store);
    const label = outcome.strategy === "value" ? "value" : "stars and scrubs";
    return {
      ok: true,
      strategy: outcome.strategy,
      objective: outcome.objective,
      message: `Filled ${outcome.picks.length} slot${outcome.picks.length === 1 ? "" : "s"} using the ${label} strategy for ${outcome.objective}. ${formatPrice(squad.remaining)} remains; projected ${squad.projectedPoints} points.`,
      picks: outcome.picks.map((pick) => ({
        slotId: pick.slotId,
        player: publicPlayer(pick.player),
        reason: pick.reason ?? null,
      })),
      skipped: outcome.skipped,
      squad,
    };
  }),

  set_formation: tool("set_formation", TOOL_INPUT.set_formation, (store, input) => {
    const result = store.getState().setFormation(input, "agent");
    if (!result.ok) return result;
    const change = result.value;
    const released = change.released.map((pick) => pick.player.name);
    return {
      ok: true,
      message: `Formation ${change.from} → ${change.to} (${describeLineup(change.to)}).${released.length > 0 ? ` Released ${released.join(", ")}.` : ""}${change.moved.length > 0 ? ` ${change.moved.length} player${change.moved.length === 1 ? "" : "s"} re-seated.` : ""}`,
      from: change.from,
      to: change.to,
      lineup: describeLineup(change.to),
      released: change.released.map((pick) => ({ slotId: pick.slotId, player: publicPlayer(pick.player) })),
      moved: change.moved,
      squad: squadSnapshot(store),
    };
  }),

  simulate_scenarios: tool("simulate_scenarios", TOOL_INPUT.simulate_scenarios, (store, input) => {
    const state = stateOf(store);
    const current = currentProjection(state, { target: input.target });
    const summary = summarize(state);
    const baseline = { points: summary.projectedPoints, mean: current.mean, p10: current.p10, p90: current.p90 };
    const runs = input.scenarios.map((plan) => runScenario(state, toPlan(plan), "agent", { target: input.target }));
    const scenarios = runs.map((result) =>
      result.ok
        ? publicScenario(result.value, baseline)
        : {
            label: result.label,
            ok: false,
            code: result.code,
            error: result.error,
            failedStep: result.failedStep,
            stepsBeforeFailure: result.steps,
          },
    );
    const valid = runs.filter((run) => run.ok).map((run) => run.value);
    const best = [...valid].sort((a, b) => b.projectedPoints - a.projectedPoints)[0];
    return {
      ok: true,
      message: `${valid.length} of ${runs.length} scenario${runs.length === 1 ? "" : "s"} valid.${best ? ` Highest projection: "${best.label}" (${best.projectedPoints} pts).` : ""} Nothing was changed.`,
      current: {
        formation: summary.formation,
        spent: summary.spent,
        remaining: summary.remaining,
        projectedPoints: summary.projectedPoints,
        projection: publicProjection(current),
      },
      scenarios,
    };
  }),

  apply_scenario: tool("apply_scenario", TOOL_INPUT.apply_scenario, (store, input) => {
    const before = summarize(stateOf(store));
    const beforeProjection = currentProjection(stateOf(store));
    const result = store.getState().applyScenario(toPlan(input.scenario), "agent");
    if (!result.ok) {
      const failure: ToolFailure = {
        ok: false,
        code: "SCENARIO_FAILED",
        error: `Scenario "${result.label}" was rolled back at step "${result.failedStep}": ${result.error}`,
        detail: { failedStep: result.failedStep, stepsBeforeFailure: result.steps, cause: result.code },
      };
      return failure;
    }
    const outcome = publicScenario(result.value, {
      points: before.projectedPoints,
      mean: beforeProjection.mean,
      p10: beforeProjection.p10,
      p90: beforeProjection.p90,
    });
    return {
      ok: true,
      message: `Applied "${outcome.label}": ${outcome.steps.length} step${outcome.steps.length === 1 ? "" : "s"}, now ${outcome.formation} with ${formatPrice(outcome.remaining)} left and ${outcome.projectedPoints} projected points (${outcome.delta.projectedPoints >= 0 ? "+" : ""}${outcome.delta.projectedPoints}).`,
      scenario: outcome,
      squad: squadSnapshot(store),
    };
  }),

  project_points: tool("project_points", TOOL_INPUT.project_points, (store, input) => {
    const state = stateOf(store);
    let players: Player[];
    if (input.playerIds && input.playerIds.length > 0) {
      const resolved: Player[] = [];
      for (const query of input.playerIds) {
        const found = resolvePlayer(state, query);
        if (!found.ok) return found;
        resolved.push(found.value);
      }
      players = resolved;
    } else {
      players = squadPlayers(state);
    }
    if (players.length === 0) {
      return { ok: false, code: "SLOT_EMPTY", error: "The squad is empty; draft players or pass playerIds to project." };
    }
    const projection = projectSquad(players, {
      target: input.target,
      samples: input.samples,
      // Hypothetical lists still pick up the armband if that player is in the list.
      ...armbands(state),
    });
    const contributions = players
      .map((player) => {
        const outlook = playerOutlook(player);
        return {
          id: player.id,
          name: player.name,
          position: player.position,
          team: player.team,
          mean: outlook.mean,
          p10: outlook.p10,
          p90: outlook.p90,
          startProbability: outlook.startProbability,
          share: Math.round((player.projectedPoints / Math.max(1, projection.mean)) * 1000) / 10,
        };
      })
      .sort((a, b) => b.mean - a.mean);
    const targetText =
      projection.target !== null && projection.probabilityAtLeast !== null
        ? ` P(≥ ${projection.target}) = ${Math.round(projection.probabilityAtLeast * 100)}%.`
        : "";
    const stackText = projection.clubStacks.length > 0 ? ` Club stacks: ${projection.clubStacks.map((s) => `${s.team} ×${s.count}`).join(", ")}.` : "";
    return {
      ok: true,
      message: `${players.length} players project ${projection.mean} points (sd ${projection.sd}; p10 ${projection.p10}, p90 ${projection.p90}).${targetText}${stackText}`,
      scope: input.playerIds && input.playerIds.length > 0 ? "hypothetical" : "squad",
      projection: publicProjection(projection),
      contributions,
    };
  }),

  player_outlook: tool("player_outlook", TOOL_INPUT.player_outlook, (store, input) => {
    const state = stateOf(store);
    const players: Player[] = [];
    for (const query of input.playerIds) {
      const found = resolvePlayer(state, query);
      if (!found.ok) return found;
      players.push(found.value);
    }
    const outlooks = players.map((player) => {
      const outlook = playerOutlook(player);
      const inSlot = state.slots.find((slot) => slot.playerId === player.id);
      const projection = input.target !== undefined ? projectSquad([player], { target: input.target, samples: 4000 }) : null;
      return {
        ...publicPlayer(player),
        drafted: player.drafted,
        slotId: inSlot?.id ?? null,
        outlook: {
          mean: outlook.mean,
          sd: outlook.sd,
          p10: outlook.p10,
          p50: outlook.p50,
          p90: outlook.p90,
          startProbability: outlook.startProbability,
          volatility: outlook.volatility,
          probabilityAtLeast: projection?.probabilityAtLeast ?? null,
          target: input.target ?? null,
        },
        profile: outlook.volatility >= 0.24 ? "boom-or-bust" : outlook.startProbability >= 0.9 ? "bankable" : "steady",
      };
    });
    const line = outlooks.map((o) => `${o.name} ${o.outlook.p10}–${o.outlook.p90} (start ${Math.round(o.outlook.startProbability * 100)}%)`).join("; ");
    return { ok: true, message: `Outlook: ${line}.`, players: outlooks };
  }),

  find_upgrades: tool("find_upgrades", TOOL_INPUT.find_upgrades, (store, input) => {
    const state = stateOf(store);
    const result = findUpgrades(state, input);
    if (!result.ok) return result;
    const upgrades = result.value.map((upgrade) => ({
      slotId: upgrade.slotId,
      out: publicPlayer(upgrade.from),
      in: publicPlayer(upgrade.to),
      gain: upgrade.gain,
      cost: upgrade.cost,
      gainPerMillion: Number.isFinite(upgrade.efficiency) ? upgrade.efficiency : null,
    }));
    const summary = summarize(state);
    return {
      ok: true,
      message:
        upgrades.length === 0
          ? `No single swap improves ${input.objective} within ${formatPrice(summary.remaining)}.`
          : `${upgrades.length} upgrade${upgrades.length === 1 ? "" : "s"} for ${input.objective}; best: ${upgrades[0].out.name} → ${upgrades[0].in.name} (+${upgrades[0].gain}, ${upgrades[0].cost >= 0 ? "+" : ""}${formatPrice(upgrades[0].cost)}).`,
      objective: input.objective,
      budgetRemaining: summary.remaining,
      upgrades,
    };
  }),

  get_brief: tool("get_brief", TOOL_INPUT.get_brief, (store) => {
    const state = stateOf(store);
    const brief = publicBrief(state);
    const count = brief.players.length;
    return {
      ok: true,
      message:
        count === 0
          ? "The manager has left no brief yet: no captain, no duties, no notes. You have a free hand."
          : `${count} player${count === 1 ? " has" : "s have"} instructions.${brief.captain ? ` Captain: ${brief.captain.name}.` : ""}${brief.vice ? ` Vice: ${brief.vice.name}.` : ""}${brief.protectedPlayerIds.length > 0 ? ` Protected: ${brief.protectedPlayerIds.length}.` : ""} Read text before changing the squad.`,
      ...brief,
    };
  }),

  set_assignment: tool("set_assignment", TOOL_INPUT.set_assignment, (store, input) => {
    const result = store.getState().assign(input, "agent");
    if (!result.ok) return result;
    const change = result.value;
    const state = stateOf(store);
    const player = state.players.find((p) => p.id === change.playerId);
    const line = briefLines(state).find((entry) => entry.playerId === change.playerId);
    return {
      ok: true,
      message: change.changes.length === 0 ? `${player?.name ?? change.playerId} already had those assignments; nothing changed.` : `${change.changes.join(". ")}.`,
      playerId: change.playerId,
      slotId: change.slotId,
      armband: line?.armband ?? "none",
      duties: (line?.duties ?? []).map((duty) => DUTY_LABEL[duty]),
      note: line?.note ?? "",
      changes: change.changes,
      brief: publicBrief(state),
    };
  }),
};
