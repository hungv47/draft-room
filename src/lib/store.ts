import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import { assign as engineAssign, type AssignChange, type AssignInput } from "./assignments";
import { loadPlayers } from "./data";
import {
  autoFill as engineAutoFill,
  draftPlayer,
  removePlayer,
  reseatPlayer,
  resetDraft,
  resolvePlayer,
  resolveSlot,
  setFormation as engineSetFormation,
  summarize,
  swapPlayer,
  type AutoFillInput,
  type AutoFillOutcome,
  type DraftInput,
  type FormationChange,
  type RemoveInput,
  type ReseatChange,
  type SetFormationInput,
  type SwapInput,
} from "./engine";
import { formatPrice, roundPrice, slotLabel } from "./format";
import { runScenario, type ScenarioOutcome, type ScenarioPlan, type ScenarioResult } from "./scenarios";
import { BUDGET_TOTAL, DEFAULT_FORMATION, createSlots } from "./slots";
import { EMPTY_ASSIGNMENTS, type ActivityEntry, type ActivityKind, type Actor, type DraftState, type Pick, type Player, type Result } from "./types";

export type WebMcpState = "pending" | "registered" | "unavailable";

export interface WebMcpStatus {
  state: WebMcpState;
  toolCount: number;
}

/** Slots filled by one action (a click fills one; an auto-fill can fill nine), flashed together. */
export interface FillFlash {
  slotIds: readonly string[];
  actor: Actor;
  at: number;
}

/** One WebMCP invocation, for the agent console. Inputs and results are kept as short JSON. */
export interface ToolCall {
  id: number;
  at: number;
  tool: string;
  input: string;
  ok: boolean;
  /** One line an onlooker can read: the tool's message or its error. */
  summary: string;
  durationMs: number;
}

export interface PlaceInput {
  playerId: string;
  slotId: string;
}

export type PlaceResult =
  | { action: "draft"; pick: Pick }
  | { action: "swap"; outgoing: Player | null; pick: Pick }
  | { action: "reseat"; change: ReseatChange };

export interface DraftStore extends DraftState {
  activity: ActivityEntry[];
  calls: ToolCall[];
  lastFill: FillFlash | null;
  webmcp: WebMcpStatus;
  /** Slot whose card is open in the inspector; null when nothing is selected. */
  selectedSlotId: string | null;

  draft(input: DraftInput, actor: Actor): Result<Pick>;
  remove(input: RemoveInput, actor: Actor): Result<{ slotId: string; player: Player }>;
  swap(input: SwapInput, actor: Actor): Result<{ outgoing: Player | null; pick: Pick }>;
  /** Click or drop a player onto a named slot: draft, swap, or reseat. */
  place(input: PlaceInput, actor: Actor): Result<PlaceResult>;
  autoFill(input: AutoFillInput, actor: Actor): Result<AutoFillOutcome>;
  setFormation(input: SetFormationInput, actor: Actor): Result<FormationChange>;
  /** Run a scenario and commit it atomically. Nothing changes if any step fails. */
  applyScenario(plan: ScenarioPlan, actor: Actor): ScenarioResult;
  /** Armband, duties, and note on a drafted player. Both actors may write; the feed says who did. */
  assign(input: AssignInput, actor: Actor): Result<AssignChange>;
  select(slotId: string | null): void;
  reset(actor: Actor): void;
  /** For failures that never reach the engine (malformed tool input, unknown tool). */
  recordFailure(actor: Actor, message: string): void;
  recordCall(call: Omit<ToolCall, "id" | "at">): void;
  setWebMcp(status: WebMcpStatus): void;
}

const MAX_ACTIVITY = 200;
const MAX_CALLS = 60;

export function createDraftStore(players: Player[], now: () => number = Date.now): StoreApi<DraftStore> {
  let nextId = 1;
  let nextCallId = 1;

  return createStore<DraftStore>((set, get) => {
    const snapshot = (): DraftState => {
      const { budgetTotal, formation, slots, players: pool, assignments } = get();
      return { budgetTotal, formation, slots, players: pool, assignments };
    };

    const log = (
      entries: ActivityEntry[],
      actor: Actor,
      kind: ActivityKind,
      message: string,
      slotId?: string,
      detail?: string,
    ): ActivityEntry[] => {
      const entry: ActivityEntry = { id: nextId++, at: now(), actor, kind, message, slotId, detail };
      return [entry, ...entries].slice(0, MAX_ACTIVITY);
    };

    // A null flash leaves the previous one in place so an earlier slot keeps glowing through a remove.
    const commit = (state: DraftState, activity: ActivityEntry[], lastFill: FillFlash | null) => {
      // A selection outlives a change only while its slot still holds a player.
      const selected = get().selectedSlotId;
      const stillFilled = selected !== null && state.slots.some((slot) => slot.id === selected && slot.playerId !== null);
      const next = {
        formation: state.formation,
        slots: state.slots,
        players: state.players,
        assignments: state.assignments,
        activity,
        selectedSlotId: stillFilled ? selected : null,
      };
      if (lastFill) set({ ...next, lastFill });
      else set(next);
    };

    const fillActivity = (activity: ActivityEntry[], outcome: AutoFillOutcome, actor: Actor): ActivityEntry[] => {
      let entries = activity;
      for (const pick of outcome.picks) {
        entries = log(
          entries,
          actor,
          "autofill",
          `Auto-filled ${slotLabel(pick.slotId)} with ${pick.player.name} — ${formatPrice(pick.player.price)}`,
          pick.slotId,
          pick.reason,
        );
      }
      for (const skip of outcome.skipped) {
        entries = log(entries, actor, "error", `Left ${slotLabel(skip.slotId)} empty — ${skip.reason}`, skip.slotId);
      }
      return entries;
    };

    return {
      budgetTotal: BUDGET_TOTAL,
      formation: DEFAULT_FORMATION,
      slots: createSlots(DEFAULT_FORMATION),
      players,
      assignments: EMPTY_ASSIGNMENTS,
      activity: [],
      calls: [],
      lastFill: null,
      webmcp: { state: "pending", toolCount: 0 },
      selectedSlotId: null,

      // Feed messages omit the actor: the row already carries an Agent/You tag in colour.
      draft(input, actor) {
        const result = draftPlayer(snapshot(), input, actor);
        if (!result.ok) {
          set({ activity: log(get().activity, actor, "error", `Draft failed — ${result.error}`) });
          return result;
        }
        const { state, pick } = result.value;
        const message = `Drafted ${pick.player.name} into ${slotLabel(pick.slotId)} — ${formatPrice(pick.player.price)}`;
        commit(state, log(get().activity, actor, "draft", message, pick.slotId), {
          slotIds: [pick.slotId],
          actor,
          at: now(),
        });
        return { ok: true, value: pick };
      },

      remove(input, actor) {
        const result = removePlayer(snapshot(), input, actor);
        if (!result.ok) {
          set({ activity: log(get().activity, actor, "error", `Remove failed — ${result.error}`) });
          return result;
        }
        const { state, slotId, player } = result.value;
        const message = `Removed ${player.name} from ${slotLabel(slotId)} — ${formatPrice(player.price)} back in the budget`;
        commit(state, log(get().activity, actor, "remove", message, slotId), null);
        return { ok: true, value: { slotId, player } };
      },

      swap(input, actor) {
        const result = swapPlayer(snapshot(), input, actor);
        if (!result.ok) {
          set({ activity: log(get().activity, actor, "error", `Swap failed — ${result.error}`) });
          return result;
        }
        const { state, outgoing, pick } = result.value;
        const delta = roundPrice(pick.player.price - (outgoing?.price ?? 0));
        const deltaText = delta === 0 ? "same price" : delta > 0 ? `+${formatPrice(delta)}` : `saves ${formatPrice(-delta)}`;
        const message = outgoing
          ? `Swapped ${outgoing.name} for ${pick.player.name} in ${slotLabel(pick.slotId)} — ${deltaText}`
          : `Drafted ${pick.player.name} into ${slotLabel(pick.slotId)} — ${formatPrice(pick.player.price)}`;
        commit(state, log(get().activity, actor, "swap", message, pick.slotId), {
          slotIds: [pick.slotId],
          actor,
          at: now(),
        });
        return { ok: true, value: { outgoing, pick } };
      },

      place(input, actor) {
        const current = snapshot();
        const found = resolvePlayer(current, input.playerId);
        if (!found.ok) {
          set({ activity: log(get().activity, actor, "error", `Place failed — ${found.error}`) });
          return found;
        }
        if (found.value.drafted) {
          const result = reseatPlayer(current, input, actor);
          if (!result.ok) {
            set({ activity: log(get().activity, actor, "error", `Move failed — ${result.error}`) });
            return result;
          }
          const change = result.value;
          const message = change.exchanged
            ? `Swapped ${change.player.name} and ${change.exchanged.name} — ${slotLabel(change.fromSlotId)} ↔ ${slotLabel(change.toSlotId)}`
            : `Moved ${change.player.name} to ${slotLabel(change.toSlotId)}`;
          const slotIds = change.exchanged ? [change.fromSlotId, change.toSlotId] : [change.toSlotId];
          commit(change.state, log(get().activity, actor, "swap", message, change.toSlotId), {
            slotIds,
            actor,
            at: now(),
          });
          return { ok: true, value: { action: "reseat", change } };
        }
        const slot = resolveSlot(current, input.slotId);
        if (!slot.ok) {
          set({ activity: log(get().activity, actor, "error", `Place failed — ${slot.error}`) });
          return slot;
        }
        if (slot.value.playerId) {
          const swapped = get().swap({ slotId: input.slotId, newPlayerId: found.value.id }, actor);
          if (!swapped.ok) return swapped;
          return { ok: true, value: { action: "swap", outgoing: swapped.value.outgoing, pick: swapped.value.pick } };
        }
        const drafted = get().draft({ playerId: found.value.id, slotId: input.slotId }, actor);
        if (!drafted.ok) return drafted;
        return { ok: true, value: { action: "draft", pick: drafted.value } };
      },

      autoFill(input, actor) {
        const result = engineAutoFill(snapshot(), input, actor);
        if (!result.ok) {
          set({ activity: log(get().activity, actor, "error", `Auto-fill failed — ${result.error}`) });
          return result;
        }
        const outcome = result.value;
        let activity = fillActivity(get().activity, outcome, actor);
        const spentNow = roundPrice(outcome.picks.reduce((sum, pick) => sum + pick.player.price, 0));
        const label = outcome.strategy === "value" ? "value" : "stars & scrubs";
        const objective = outcome.objective === "mean" ? "" : `, ${outcome.objective}`;
        const after = summarize(outcome.state);
        activity = log(
          activity,
          actor,
          "autofill",
          `Auto-filled ${outcome.picks.length} slot${outcome.picks.length === 1 ? "" : "s"} (${label}${objective}) — ${formatPrice(spentNow)} spent`,
          undefined,
          `${formatPrice(after.remaining)} left · squad projects ${after.projectedPoints.toLocaleString("en-GB")} pts`,
        );
        const slotIds = outcome.picks.map((pick) => pick.slotId);
        commit(outcome.state, activity, slotIds.length > 0 ? { slotIds, actor, at: now() } : null);
        return { ok: true, value: outcome };
      },

      setFormation(input, actor) {
        const result = engineSetFormation(snapshot(), input, actor);
        if (!result.ok) {
          set({ activity: log(get().activity, actor, "error", `Formation change failed — ${result.error}`) });
          return result;
        }
        const change = result.value;
        let activity = get().activity;
        for (const drop of change.released) {
          activity = log(
            activity,
            actor,
            "remove",
            `Released ${drop.player.name} from ${slotLabel(drop.slotId)} — no ${drop.player.position} slot left in the ${change.to}`,
            drop.slotId,
          );
        }
        activity = log(
          activity,
          actor,
          "formation",
          `Switched formation ${change.from} → ${change.to}`,
          undefined,
          change.moved.length > 0 ? `${change.moved.length} player${change.moved.length === 1 ? "" : "s"} re-seated` : undefined,
        );
        commit(change.state, activity, null);
        return { ok: true, value: change };
      },

      applyScenario(plan, actor) {
        const result = runScenario(snapshot(), plan, actor);
        if (!result.ok) {
          set({
            activity: log(
              get().activity,
              actor,
              "error",
              `Scenario "${plan.label}" rolled back — ${result.error}`,
              undefined,
              `Failed at step: ${result.failedStep}`,
            ),
          });
          return result;
        }
        const outcome: ScenarioOutcome = result.value;
        let activity = get().activity;
        for (const step of [...outcome.steps].reverse()) {
          activity = log(activity, actor, "scenario", step);
        }
        activity = log(
          activity,
          actor,
          "scenario",
          `Applied scenario "${outcome.label}" — ${outcome.steps.length} step${outcome.steps.length === 1 ? "" : "s"}, ${outcome.formation}`,
          undefined,
          `${formatPrice(outcome.remaining)} left · projects ${outcome.projectedPoints.toLocaleString("en-GB")} pts (p10 ${outcome.projection.p10.toLocaleString("en-GB")} · p90 ${outcome.projection.p90.toLocaleString("en-GB")})`,
        );
        const slotIds = outcome.picks.map((pick) => pick.slotId);
        commit(outcome.state, activity, slotIds.length > 0 ? { slotIds, actor, at: now() } : null);
        return result;
      },

      assign(input, actor) {
        const result = engineAssign(snapshot(), input);
        if (!result.ok) {
          set({ activity: log(get().activity, actor, "error", `Assignment failed — ${result.error}`) });
          return result;
        }
        const change = result.value;
        if (change.changes.length === 0) return result;
        let activity = get().activity;
        for (const line of [...change.changes].reverse()) activity = log(activity, actor, "brief", line, change.slotId);
        commit(change.state, activity, null);
        return result;
      },

      select(slotId) {
        if (slotId === null) {
          set({ selectedSlotId: null });
          return;
        }
        const slot = get().slots.find((s) => s.id === slotId);
        set({ selectedSlotId: slot?.playerId ? slotId : null });
      },

      reset(actor) {
        const cleared = resetDraft(snapshot());
        const state: DraftState = { ...cleared, formation: DEFAULT_FORMATION, slots: createSlots(DEFAULT_FORMATION) };
        commit(state, log(get().activity, actor, "reset", `Reset the draft — ${formatPrice(BUDGET_TOTAL)} back in the budget`), null);
      },

      recordFailure(actor, message) {
        set({ activity: log(get().activity, actor, "error", message) });
      },

      recordCall(call) {
        const entry: ToolCall = { id: nextCallId++, at: now(), ...call };
        set({ calls: [entry, ...get().calls].slice(0, MAX_CALLS) });
      },

      setWebMcp(status) {
        set({ webmcp: status });
      },
    };
  });
}

let singleton: StoreApi<DraftStore> | null = null;

/** App-wide store. Tools and components share this exact instance. */
export function getDraftStore(): StoreApi<DraftStore> {
  if (!singleton) singleton = createDraftStore(loadPlayers());
  return singleton;
}

export function useDraftStore<T>(selector: (store: DraftStore) => T): T {
  return useStore(getDraftStore(), selector);
}
