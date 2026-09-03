import { formatPrice, roundPrice, slotLabel } from "./format";
import { FORMATIONS, createSlots, parseFormation, slotsPerPosition } from "./formations";
import { objectiveScore, playerOutlook } from "./model";
import type {
  Actor,
  AutoFillStrategy,
  DraftState,
  ErrorCode,
  Failure,
  FormationId,
  Objective,
  Pick,
  Player,
  Position,
  Result,
  RosterSlot,
  RosterSummary,
} from "./types";
import { POSITIONS } from "./types";

/*
 * Pure draft engine. Every function takes a DraftState and returns a Result with a new state.
 * The Zustand store and the WebMCP tools both call these, so click handlers and agent calls
 * can never disagree about the rules. Inputs arrive already parsed: the WebMCP boundary
 * (src/webmcp/schemas.ts) turns loose agent JSON into these typed shapes.
 */

const MIN_RESERVE_PER_SLOT = 0.5;

function fail(code: ErrorCode, error: string): Failure {
  return { ok: false, code, error };
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function slugify(text: string): string {
  return normalize(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function listNames(players: Player[]): string {
  return players.map((p) => `${p.name} (${p.id})`).join(", ");
}

// ---------------------------------------------------------------------------
// Reads

export function playerById(state: DraftState, id: string): Player | undefined {
  return state.players.find((p) => p.id === id);
}

export function playerInSlot(state: DraftState, slot: RosterSlot): Player | undefined {
  return slot.playerId ? playerById(state, slot.playerId) : undefined;
}

export function squadPlayers(state: DraftState): Player[] {
  const players: Player[] = [];
  for (const slot of state.slots) {
    const player = playerInSlot(state, slot);
    if (player) players.push(player);
  }
  return players;
}

export function spent(state: DraftState): number {
  return roundPrice(squadPlayers(state).reduce((sum, p) => sum + p.price, 0));
}

export function remaining(state: DraftState): number {
  return roundPrice(Math.max(0, state.budgetTotal - spent(state)));
}

/** Squad projection including the captain's double, when a captain is named. */
export function projectedPoints(state: DraftState): number {
  const base = squadPlayers(state).reduce((sum, p) => sum + p.projectedPoints, 0);
  const captain = state.assignments.captainId ? playerById(state, state.assignments.captainId) : undefined;
  return base + (captain?.drafted ? captain.projectedPoints : 0);
}

/** The "protected" duty: an agent needs `force` to move this player. */
export function isProtectedPlayer(state: DraftState, playerId: string): boolean {
  return state.assignments.briefs[playerId]?.duties.includes("protected") ?? false;
}

/** Everything attached to a player goes with them when they leave the squad. */
function dropAssignments(state: DraftState, playerId: string | null): DraftState {
  if (!playerId) return state;
  const a = state.assignments;
  if (a.captainId !== playerId && a.viceId !== playerId && !(playerId in a.briefs)) return state;
  const briefs = { ...a.briefs };
  delete briefs[playerId];
  return {
    ...state,
    assignments: {
      captainId: a.captainId === playerId ? null : a.captainId,
      viceId: a.viceId === playerId ? null : a.viceId,
      briefs,
    },
  };
}

function protectedFailure(state: DraftState, player: Player, verb: string): Failure {
  return fail(
    "PROTECTED",
    `${player.name} is protected by the manager's brief; ${verb} needs force=true, or ask the manager to lift protection (get_brief shows why).`,
  );
}

export function emptySlots(state: DraftState): RosterSlot[] {
  return state.slots.filter((slot) => slot.playerId === null);
}

export function isComplete(state: DraftState): boolean {
  return emptySlots(state).length === 0;
}

export function summarize(state: DraftState): RosterSummary {
  const slots = state.slots.map((slot) => {
    const player = playerInSlot(state, slot);
    return {
      slotId: slot.id,
      type: slot.type,
      player: player
        ? {
            id: player.id,
            name: player.name,
            position: player.position,
            team: player.team,
            price: player.price,
            projectedPoints: player.projectedPoints,
          }
        : null,
      filledBy: slot.filledBy,
    };
  });
  const empty = emptySlots(state);
  return {
    formation: state.formation,
    captainId: state.assignments.captainId,
    viceId: state.assignments.viceId,
    slots,
    filledSlots: state.slots.length - empty.length,
    totalSlots: state.slots.length,
    emptySlotIds: empty.map((s) => s.id),
    budgetTotal: state.budgetTotal,
    spent: spent(state),
    remaining: remaining(state),
    projectedPoints: projectedPoints(state),
    complete: empty.length === 0,
  };
}

export type PlayerSort = "points" | "price" | "value" | "floor" | "ceiling";

export interface PlayerFilter {
  position?: Position;
  team?: string;
  maxPrice?: number;
  minPrice?: number;
  search?: string;
  includeDrafted?: boolean;
  sort?: PlayerSort;
  limit?: number;
}

export function filterPlayers(state: DraftState, filter: PlayerFilter = {}): Player[] {
  const search = filter.search ? normalize(filter.search) : "";
  const team = filter.team ? normalize(filter.team) : "";
  const matches = state.players
    .filter((p) => filter.includeDrafted || !p.drafted)
    .filter((p) => !filter.position || p.position === filter.position)
    .filter((p) => !team || normalize(p.team) === team)
    .filter((p) => filter.maxPrice === undefined || p.price <= filter.maxPrice)
    .filter((p) => filter.minPrice === undefined || p.price >= filter.minPrice)
    .filter(
      (p) =>
        !search ||
        normalize(p.name).includes(search) ||
        normalize(p.team).includes(search) ||
        p.id.includes(search),
    )
    .sort(comparatorFor(filter.sort ?? "points"));
  return filter.limit !== undefined ? matches.slice(0, filter.limit) : matches;
}

export function byPointsDesc(a: Player, b: Player): number {
  if (b.projectedPoints !== a.projectedPoints) return b.projectedPoints - a.projectedPoints;
  if (a.price !== b.price) return a.price - b.price;
  return a.name.localeCompare(b.name);
}

function comparatorFor(sort: PlayerSort): (a: Player, b: Player) => number {
  switch (sort) {
    case "points":
      return byPointsDesc;
    case "price":
      return (a, b) => b.price - a.price || byPointsDesc(a, b);
    case "value":
      return (a, b) => valuePerMillion(b) - valuePerMillion(a) || byPointsDesc(a, b);
    case "floor":
      return (a, b) => playerOutlook(b).p10 - playerOutlook(a).p10 || byPointsDesc(a, b);
    case "ceiling":
      return (a, b) => playerOutlook(b).p90 - playerOutlook(a).p90 || byPointsDesc(a, b);
  }
}

export function valuePerMillion(player: Player): number {
  return player.price > 0 ? player.projectedPoints / player.price : 0;
}

/**
 * Resolve a player from an id, an exact name, or a unique partial name. Agents frequently
 * pass names instead of slugs, so being forgiving here removes a whole class of failed calls.
 */
export function resolvePlayer(state: DraftState, query: string): Result<Player> {
  const raw = query.trim();
  if (raw === "") {
    return fail("INVALID_INPUT", "playerId is required (use the id from list_available_players, or the player's name).");
  }
  const slug = slugify(raw);
  const norm = normalize(raw);

  const byId = state.players.find((p) => p.id === raw || p.id === slug);
  if (byId) return { ok: true, value: byId };

  const byName = state.players.filter((p) => normalize(p.name) === norm);
  if (byName.length === 1) return { ok: true, value: byName[0] };

  const partial = state.players.filter(
    (p) => normalize(p.name).includes(norm) || p.id.includes(slug),
  );
  if (partial.length === 1) return { ok: true, value: partial[0] };
  if (partial.length > 1) {
    return fail(
      "PLAYER_AMBIGUOUS",
      `"${raw}" matches ${partial.length} players: ${listNames(partial.slice(0, 6))}. Use the exact id.`,
    );
  }
  return fail("PLAYER_NOT_FOUND", `No player matches "${raw}". Call list_available_players to see ids.`);
}

export function resolveSlot(state: DraftState, slotId: string): Result<RosterSlot> {
  if (slotId.trim() === "") {
    return fail("INVALID_INPUT", `slotId is required. Valid slots: ${state.slots.map((s) => s.id).join(", ")}.`);
  }
  const wanted = slotId.replace(/[\s_-]+/g, "").toUpperCase();
  const slot = state.slots.find((s) => s.id.toUpperCase() === wanted);
  if (!slot) {
    return fail("SLOT_NOT_FOUND", `Unknown slot "${slotId}". Valid slots in ${state.formation}: ${state.slots.map((s) => s.id).join(", ")}.`);
  }
  return { ok: true, value: slot };
}

export function slotAccepts(slot: RosterSlot, position: Position): boolean {
  return slot.type === position;
}

export function firstEligibleEmptySlot(state: DraftState, position: Position): RosterSlot | undefined {
  return state.slots.find((slot) => slot.playerId === null && slotAccepts(slot, position));
}

export function slotOf(state: DraftState, playerId: string): RosterSlot | undefined {
  return state.slots.find((slot) => slot.playerId === playerId);
}

export function resolveFormation(text: string): Result<FormationId> {
  const parsed = parseFormation(text);
  if (!parsed) {
    return fail(
      "FORMATION_UNKNOWN",
      `Unknown formation "${text}". Choose one of ${Object.keys(FORMATIONS).join(", ")}.`,
    );
  }
  return { ok: true, value: parsed };
}

// ---------------------------------------------------------------------------
// Writes (all immutable)

function setSlot(state: DraftState, slotId: string, playerId: string | null, actor: Actor | null): DraftState {
  const previous = state.slots.find((s) => s.id === slotId)?.playerId ?? null;
  const base = previous && previous !== playerId ? dropAssignments(state, previous) : state;
  return {
    ...base,
    slots: state.slots.map((slot) =>
      slot.id === slotId ? { ...slot, playerId, filledBy: playerId ? actor : null } : slot,
    ),
    players: state.players.map((p) => {
      if (p.id === playerId) return { ...p, drafted: true };
      if (previous && p.id === previous) return { ...p, drafted: false };
      return p;
    }),
  };
}

export interface DraftInput {
  playerId: string;
  slotId?: string;
}

export function draftPlayer(
  state: DraftState,
  input: DraftInput,
  actor: Actor,
): Result<{ state: DraftState; pick: Pick }> {
  const found = resolvePlayer(state, input.playerId);
  if (!found.ok) return found;
  const player = found.value;

  if (player.drafted) {
    const where = slotOf(state, player.id);
    return fail(
      "ALREADY_DRAFTED",
      `${player.name} is already in your squad${where ? ` (${slotLabel(where.id)})` : ""}.`,
    );
  }

  let slot: RosterSlot | undefined;
  if (input.slotId) {
    const resolved = resolveSlot(state, input.slotId);
    if (!resolved.ok) return resolved;
    slot = resolved.value;
    if (!slotAccepts(slot, player.position)) {
      return fail(
        "NOT_ELIGIBLE",
        `${player.name} is a ${player.position}; ${slotLabel(slot.id)} only takes ${slot.type}.`,
      );
    }
    if (slot.playerId) {
      const occupant = playerInSlot(state, slot);
      return fail(
        "SLOT_OCCUPIED",
        `${slotLabel(slot.id)} already has ${occupant?.name ?? "a player"}. Use swap_player to replace them, or remove_player first.`,
      );
    }
  } else {
    slot = firstEligibleEmptySlot(state, player.position);
    if (!slot) {
      if (isComplete(state)) {
        return fail(
          "SQUAD_FULL",
          `The squad is full (${state.slots.length}/${state.slots.length}). Use swap_player or remove_player to make room.`,
        );
      }
      const open = emptySlots(state).map((s) => s.id);
      return fail(
        "NO_ELIGIBLE_SLOT",
        `Every ${player.position} slot in the ${state.formation} is taken. Open slots: ${open.join(", ")}. Change formation with set_formation to field more ${player.position}s.`,
      );
    }
  }

  const budgetLeft = remaining(state);
  if (player.price > budgetLeft) {
    return fail(
      "OVER_BUDGET",
      `${player.name} costs ${formatPrice(player.price)} but only ${formatPrice(budgetLeft)} remains (short by ${formatPrice(player.price - budgetLeft)}).`,
    );
  }

  return {
    ok: true,
    value: {
      state: setSlot(state, slot.id, player.id, actor),
      pick: { slotId: slot.id, player },
    },
  };
}

export interface RemoveInput {
  slotId?: string;
  playerId?: string;
  /** Agents only: override the manager's protection. */
  force?: boolean;
}

export function removePlayer(
  state: DraftState,
  input: RemoveInput,
  actor: Actor = "human",
): Result<{ state: DraftState; slotId: string; player: Player }> {
  const slotId = input.slotId?.trim();
  const playerId = input.playerId?.trim();
  if (!slotId && !playerId) {
    return fail("INVALID_INPUT", "Provide slotId or playerId to remove.");
  }

  let slot: RosterSlot | undefined;
  if (slotId) {
    const resolved = resolveSlot(state, slotId);
    if (!resolved.ok) return resolved;
    slot = resolved.value;
    if (!slot.playerId) return fail("SLOT_EMPTY", `${slotLabel(slot.id)} is already empty.`);
  }

  if (playerId) {
    const found = resolvePlayer(state, playerId);
    if (!found.ok) return found;
    const inSlot = slotOf(state, found.value.id);
    if (!inSlot) return fail("NOTHING_TO_REMOVE", `${found.value.name} is not in your squad.`);
    if (slot && slot.id !== inSlot.id) {
      return fail(
        "INVALID_INPUT",
        `${found.value.name} is in ${slotLabel(inSlot.id)}, not ${slotLabel(slot.id)}. Pass one or the other.`,
      );
    }
    slot = inSlot;
  }

  if (!slot) return fail("INVALID_INPUT", "Provide slotId or playerId to remove.");
  const player = playerInSlot(state, slot);
  if (!player) return fail("SLOT_EMPTY", `${slotLabel(slot.id)} is already empty.`);
  if (actor === "agent" && !input.force && isProtectedPlayer(state, player.id)) {
    return protectedFailure(state, player, "removing them");
  }
  return {
    ok: true,
    value: { state: setSlot(state, slot.id, null, null), slotId: slot.id, player },
  };
}

export interface SwapInput {
  slotId: string;
  newPlayerId: string;
  /** Agents only: override the manager's protection on the outgoing player. */
  force?: boolean;
}

export function swapPlayer(
  state: DraftState,
  input: SwapInput,
  actor: Actor,
): Result<{ state: DraftState; outgoing: Player | null; pick: Pick }> {
  const resolvedSlot = resolveSlot(state, input.slotId);
  if (!resolvedSlot.ok) return resolvedSlot;
  const slot = resolvedSlot.value;

  const found = resolvePlayer(state, input.newPlayerId);
  if (!found.ok) return found;
  const incoming = found.value;

  if (slot.playerId === incoming.id) {
    return fail("ALREADY_DRAFTED", `${incoming.name} is already in ${slotLabel(slot.id)}.`);
  }
  if (incoming.drafted) {
    const where = slotOf(state, incoming.id);
    return fail(
      "ALREADY_DRAFTED",
      `${incoming.name} is already in your squad${where ? ` (${slotLabel(where.id)})` : ""}.`,
    );
  }
  if (!slotAccepts(slot, incoming.position)) {
    return fail(
      "NOT_ELIGIBLE",
      `${incoming.name} is a ${incoming.position}; ${slotLabel(slot.id)} only takes ${slot.type}.`,
    );
  }

  const outgoing = playerInSlot(state, slot) ?? null;
  if (outgoing && actor === "agent" && !input.force && isProtectedPlayer(state, outgoing.id)) {
    return protectedFailure(state, outgoing, "swapping them out");
  }
  const budgetAfter = roundPrice(remaining(state) + (outgoing?.price ?? 0) - incoming.price);
  if (budgetAfter < 0) {
    return fail(
      "OVER_BUDGET",
      `Swapping ${outgoing ? `${outgoing.name} (${formatPrice(outgoing.price)})` : "an empty slot"} for ${incoming.name} (${formatPrice(incoming.price)}) would overspend by ${formatPrice(-budgetAfter)}.`,
    );
  }

  return {
    ok: true,
    value: {
      state: setSlot(state, slot.id, incoming.id, actor),
      outgoing,
      pick: { slotId: slot.id, player: incoming },
    },
  };
}

export interface ReseatInput {
  playerId: string;
  slotId: string;
  /** Agents only: override the manager's protection on either player being moved. */
  force?: boolean;
}

export interface ReseatChange {
  state: DraftState;
  player: Player;
  fromSlotId: string;
  toSlotId: string;
  exchanged: Player | null;
}

/**
 * Move a drafted player to another slot of the same position. If the target is occupied, the two
 * swap places. Actor tags stay with the players; only the activity feed records who dragged.
 */
export function reseatPlayer(
  state: DraftState,
  input: ReseatInput,
  actor: Actor,
): Result<ReseatChange> {
  const found = resolvePlayer(state, input.playerId);
  if (!found.ok) return found;
  const player = found.value;
  const from = slotOf(state, player.id);
  if (!from) {
    return fail("NOT_IN_SQUAD", `${player.name} is not in your squad. Draft them first.`);
  }

  const resolved = resolveSlot(state, input.slotId);
  if (!resolved.ok) return resolved;
  const to = resolved.value;

  if (to.id === from.id) {
    return fail("ALREADY_DRAFTED", `${player.name} is already in ${slotLabel(to.id)}.`);
  }
  if (!slotAccepts(to, player.position)) {
    return fail(
      "NOT_ELIGIBLE",
      `${player.name} is a ${player.position}; ${slotLabel(to.id)} only takes ${to.type}.`,
    );
  }

  const occupant = playerInSlot(state, to) ?? null;
  if (occupant && !slotAccepts(from, occupant.position)) {
    return fail(
      "NOT_ELIGIBLE",
      `Cannot exchange ${player.name} (${player.position}) with ${occupant.name} (${occupant.position}).`,
    );
  }

  if (actor === "agent" && !input.force) {
    if (isProtectedPlayer(state, player.id)) {
      return protectedFailure(state, player, "moving them");
    }
    if (occupant && isProtectedPlayer(state, occupant.id)) {
      return protectedFailure(state, occupant, "moving them");
    }
  }

  const fromFilledBy = from.filledBy;
  const toFilledBy = to.filledBy;
  const next: DraftState = {
    ...state,
    slots: state.slots.map((slot) => {
      if (slot.id === from.id) {
        return { ...slot, playerId: occupant ? occupant.id : null, filledBy: occupant ? toFilledBy : null };
      }
      if (slot.id === to.id) {
        return { ...slot, playerId: player.id, filledBy: fromFilledBy };
      }
      return slot;
    }),
  };

  return {
    ok: true,
    value: { state: next, player, fromSlotId: from.id, toSlotId: to.id, exchanged: occupant },
  };
}

export function resetDraft(state: DraftState): DraftState {
  return {
    ...state,
    slots: state.slots.map((slot) => ({ ...slot, playerId: null, filledBy: null })),
    players: state.players.map((p) => (p.drafted ? { ...p, drafted: false } : p)),
    assignments: { captainId: null, viceId: null, briefs: {} },
  };
}

// ---------------------------------------------------------------------------
// Formation

export interface FormationChange {
  state: DraftState;
  from: FormationId;
  to: FormationId;
  /** Players who no longer fit and were released back to the pool (only with `force`). */
  released: Pick[];
  /** Slots whose id changed because their line was renumbered. */
  moved: { playerId: string; from: string; to: string }[];
}

export interface SetFormationInput {
  formation: string;
  /** Release the lowest-projected surplus players instead of failing. */
  force?: boolean;
}

/**
 * Re-shape the squad. Players keep their positions and their actor attribution; within a line they
 * are re-seated in their existing order. Surplus players (more forwards than the new shape fields)
 * make the call fail unless `force` is set, in which case the lowest projected are released and named.
 */
export function setFormation(state: DraftState, input: SetFormationInput, actor: Actor = "human"): Result<FormationChange> {
  const resolved = resolveFormation(input.formation);
  if (!resolved.ok) return resolved;
  const to = resolved.value;
  const from = state.formation;
  const capacity = slotsPerPosition(to);

  const byLine: Record<Position, { slot: RosterSlot; player: Player }[]> = { GK: [], DF: [], MF: [], FW: [] };
  for (const slot of state.slots) {
    const player = playerInSlot(state, slot);
    if (player) byLine[slot.type].push({ slot, player });
  }

  const surplus: { slot: RosterSlot; player: Player }[] = [];
  for (const position of POSITIONS) {
    const line = byLine[position];
    if (line.length <= capacity[position]) continue;
    // Keep protected players, then the highest projected; release the rest.
    const ranked = [...line].sort(
      (a, b) => Number(isProtectedPlayer(state, b.player.id)) - Number(isProtectedPlayer(state, a.player.id)) || byPointsDesc(a.player, b.player),
    );
    surplus.push(...ranked.slice(capacity[position]));
  }

  const protectedSurplus = surplus.filter(({ player }) => isProtectedPlayer(state, player.id));
  if (protectedSurplus.length > 0 && actor === "agent") {
    return fail(
      "PROTECTED",
      `${to} would release ${protectedSurplus.map(({ player }) => player.name).join(", ")}, who ${protectedSurplus.length === 1 ? "is" : "are"} protected by the manager's brief. Remove them yourself first, or ask the manager to lift protection.`,
    );
  }

  if (surplus.length > 0 && !input.force) {
    const names = surplus.map(({ player, slot }) => `${player.name} (${slotLabel(slot.id)})`).join(", ");
    return fail(
      "FORMATION_CONFLICT",
      `${to} fields ${describeLineup(to)}; ${surplus.length} current pick${surplus.length === 1 ? "" : "s"} would not fit: ${names}. Remove them first, or call again with force=true to release the lowest projected automatically.`,
    );
  }

  const releasedIds = new Set(surplus.map(({ player }) => player.id));
  const slots = createSlots(to);
  const moved: FormationChange["moved"] = [];
  for (const position of POSITIONS) {
    const keep = byLine[position].filter(({ player }) => !releasedIds.has(player.id));
    const targets = slots.filter((slot) => slot.type === position);
    keep.forEach(({ slot, player }, index) => {
      const target = targets[index];
      target.playerId = player.id;
      target.filledBy = slot.filledBy;
      if (target.id !== slot.id) moved.push({ playerId: player.id, from: slot.id, to: target.id });
    });
  }

  const players = state.players.map((p) => (releasedIds.has(p.id) ? { ...p, drafted: false } : p));
  let next: DraftState = { ...state, formation: to, slots, players };
  for (const id of releasedIds) next = dropAssignments(next, id);
  return {
    ok: true,
    value: {
      state: next,
      from,
      to,
      released: surplus.map(({ slot, player }) => ({ slotId: slot.id, player })),
      moved,
    },
  };
}

export function describeLineup(formation: FormationId): string {
  const spec = FORMATIONS[formation];
  return `1 GK, ${spec.DF} DF, ${spec.MF} MF, ${spec.FW} FW`;
}

// ---------------------------------------------------------------------------
// Auto-fill

export interface AutoFillOutcome {
  state: DraftState;
  picks: Pick[];
  skipped: { slotId: string; reason: string }[];
  strategy: AutoFillStrategy;
  objective: Objective;
}

function candidatesFor(state: DraftState, slot: RosterSlot): Player[] {
  return state.players.filter((p) => !p.drafted && slotAccepts(slot, p.position));
}

function cheapestFor(state: DraftState, slot: RosterSlot): number {
  const candidates = candidatesFor(state, slot);
  if (candidates.length === 0) return MIN_RESERVE_PER_SLOT;
  return Math.max(MIN_RESERVE_PER_SLOT, Math.min(...candidates.map((p) => p.price)));
}

/**
 * Budget to keep untouched while filling `slot` so other open slots can still take their cheapest
 * option. When the money cannot stretch to every slot, reserve for as many of the others as fit
 * (cheapest first) rather than for all of them; otherwise a short budget strands every slot at once.
 */
function reserveExcluding(state: DraftState, slot: RosterSlot): number {
  const budgetLeft = remaining(state);
  const mine = cheapestFor(state, slot);
  const others = emptySlots(state)
    .filter((other) => other.id !== slot.id)
    .map((other) => cheapestFor(state, other))
    .sort((a, b) => a - b);
  let reserve = 0;
  for (const price of others) {
    if (roundPrice(reserve + price + mine) > budgetLeft) break;
    reserve = roundPrice(reserve + price);
  }
  return reserve;
}

function spendingCap(state: DraftState, slot: RosterSlot): number {
  return roundPrice(remaining(state) - reserveExcluding(state, slot));
}

function skippedSlots(state: DraftState): AutoFillOutcome["skipped"] {
  const budgetLeft = remaining(state);
  return emptySlots(state).map((slot) => ({
    slotId: slot.id,
    reason: `no available ${slot.type} fits under the ${formatPrice(budgetLeft)} left`,
  }));
}

const OBJECTIVE_NOUN: Readonly<Record<Objective, string>> = {
  mean: "projected points",
  floor: "floor (p10) points",
  ceiling: "ceiling (p90) points",
};

function byObjectiveDesc(objective: Objective): (a: Player, b: Player) => number {
  return (a, b) => objectiveScore(b, objective) - objectiveScore(a, objective) || byPointsDesc(a, b);
}

/**
 * Spend leftover budget by repeatedly making the single upgrade that gains the most on the objective
 * among the given slots. Only touches slots this auto-fill run filled.
 */
function upgradePass(
  state: DraftState,
  picks: Pick[],
  eligibleSlotIds: Set<string>,
  actor: Actor,
  objective: Objective,
) {
  let current = state;
  let currentPicks = picks;
  for (let iterations = 0; iterations < 32; iterations++) {
    const budgetLeft = remaining(current);
    let best: { slot: RosterSlot; from: Player; to: Player; gain: number } | null = null;
    for (const slot of current.slots) {
      if (!eligibleSlotIds.has(slot.id)) continue;
      const from = playerInSlot(current, slot);
      if (!from) continue;
      for (const to of candidatesFor(current, slot)) {
        const delta = roundPrice(to.price - from.price);
        if (delta > budgetLeft) continue;
        const gain = objectiveScore(to, objective) - objectiveScore(from, objective);
        if (gain <= 0) continue;
        if (!best || gain > best.gain || (gain === best.gain && delta < roundPrice(best.to.price - best.from.price))) {
          best = { slot, from, to, gain };
        }
      }
    }
    if (!best) break;
    current = setSlot(current, best.slot.id, best.to.id, actor);
    const upgraded = best;
    currentPicks = currentPicks.map((pick) =>
      pick.slotId === upgraded.slot.id
        ? {
            slotId: pick.slotId,
            player: upgraded.to,
            reason: `${pick.reason ?? "auto pick"}; upgraded from ${upgraded.from.name} with spare budget (+${upgraded.gain} ${OBJECTIVE_NOUN[objective]})`,
          }
        : pick,
    );
  }
  return { state: current, picks: currentPicks };
}

function autoFillValue(state: DraftState, actor: Actor, objective: Objective): AutoFillOutcome {
  let current = state;
  const picks: Pick[] = [];
  const filledHere = new Set<string>();

  while (true) {
    const open = emptySlots(current);
    if (open.length === 0) break;

    let best: { slot: RosterSlot; player: Player; ratio: number } | null = null;
    for (const slot of open) {
      const cap = spendingCap(current, slot);
      for (const player of candidatesFor(current, slot)) {
        if (player.price > cap) continue;
        const ratio = objectiveScore(player, objective) / player.price;
        if (
          !best ||
          ratio > best.ratio ||
          (ratio === best.ratio && player.projectedPoints > best.player.projectedPoints)
        ) {
          best = { slot, player, ratio };
        }
      }
    }
    if (!best) break;
    current = setSlot(current, best.slot.id, best.player.id, actor);
    filledHere.add(best.slot.id);
    picks.push({
      slotId: best.slot.id,
      player: best.player,
      reason: `best ${OBJECTIVE_NOUN[objective]} per £m among ${best.slot.type} (${best.ratio.toFixed(1)}/£m)`,
    });
  }

  const upgraded = upgradePass(current, picks, filledHere, actor, objective);
  return { state: upgraded.state, picks: upgraded.picks, skipped: skippedSlots(upgraded.state), strategy: "value", objective };
}

function autoFillStarsAndScrubs(state: DraftState, actor: Actor, objective: Objective): AutoFillOutcome {
  let current = state;
  const picks: Pick[] = [];
  const open = emptySlots(current);
  if (open.length === 0) return { state, picks, skipped: [], strategy: "stars_and_scrubs", objective };
  const rank = byObjectiveDesc(objective);

  // Highest-need slots are the ones where the best available player scores the most.
  const ranked = [...open].sort((a, b) => {
    const topA = Math.max(0, ...candidatesFor(current, a).map((p) => objectiveScore(p, objective)));
    const topB = Math.max(0, ...candidatesFor(current, b).map((p) => objectiveScore(p, objective)));
    return topB - topA;
  });
  const starCount = Math.max(1, Math.ceil(ranked.length / 2));
  const stars = ranked.slice(0, starCount);
  const scrubs = ranked.slice(starCount);
  const starIds = new Set(stars.map((s) => s.id));

  for (const slot of stars) {
    const cap = spendingCap(current, slot);
    const affordable = candidatesFor(current, slot).filter((p) => p.price <= cap);
    if (affordable.length === 0) continue;
    const star = affordable.sort(rank)[0];
    current = setSlot(current, slot.id, star.id, actor);
    picks.push({
      slotId: slot.id,
      player: star,
      reason: `star pick: highest ${OBJECTIVE_NOUN[objective]} available for ${slot.type}`,
    });
  }

  for (const slot of scrubs) {
    const cap = spendingCap(current, slot);
    const candidates = candidatesFor(current, slot).filter((p) => p.price <= cap);
    if (candidates.length === 0) continue;
    // Cheap tier: within £1.0m of the cheapest eligible option, take the best on the objective.
    const floor = Math.min(...candidates.map((p) => p.price));
    const tierCap = roundPrice(floor + 1.0);
    const tier = candidates.filter((p) => p.price <= tierCap).sort(rank);
    const scrub = tier[0];
    current = setSlot(current, slot.id, scrub.id, actor);
    picks.push({
      slotId: slot.id,
      player: scrub,
      reason: `scrub pick: best ${OBJECTIVE_NOUN[objective]} in the budget tier (≤ ${formatPrice(tierCap)}) for ${slot.type}`,
    });
  }

  // Leftover money goes back into the stars, never the scrubs, so the shape survives.
  const upgraded = upgradePass(current, picks, starIds, actor, objective);
  return {
    state: upgraded.state,
    picks: upgraded.picks,
    skipped: skippedSlots(upgraded.state),
    strategy: "stars_and_scrubs",
    objective,
  };
}

export interface AutoFillInput {
  strategy: AutoFillStrategy;
  objective: Objective;
}

export function autoFill(state: DraftState, input: AutoFillInput, actor: Actor): Result<AutoFillOutcome> {
  if (isComplete(state)) {
    return fail("SQUAD_FULL", "Every slot is already filled. Remove or swap a player to change the squad.");
  }
  const outcome =
    input.strategy === "value"
      ? autoFillValue(state, actor, input.objective)
      : autoFillStarsAndScrubs(state, actor, input.objective);
  if (outcome.skipped.length > 0) {
    const open = outcome.skipped.map((slot) => slotLabel(slot.slotId)).join(", ");
    return fail(
      "IMPOSSIBLE_SQUAD",
      `Cannot fill the remaining ${outcome.skipped.length} slot${outcome.skipped.length === 1 ? "" : "s"} within ${formatPrice(remaining(state))}: ${open}. Remove or swap an expensive player, then try again.`,
    );
  }
  return { ok: true, value: outcome };
}

// ---------------------------------------------------------------------------
// Upgrade search (read-only)

export interface Upgrade {
  slotId: string;
  from: Player;
  to: Player;
  /** Change in the objective score (points). */
  gain: number;
  /** Price change; negative means the swap saves money. */
  cost: number;
  /** Gain per £m of extra spend; Infinity when the swap is free or saves money. */
  efficiency: number;
}

export interface UpgradeQuery {
  objective: Objective;
  slotId?: string;
  position?: Position;
  /** Cap on extra spend for one swap; defaults to the remaining budget. */
  maxCost?: number;
  limit: number;
}

/** Every single-swap improvement that fits the budget, best gain first. */
export function findUpgrades(state: DraftState, query: UpgradeQuery): Result<Upgrade[]> {
  let slots = state.slots.filter((slot) => slot.playerId !== null);
  if (query.slotId) {
    const resolved = resolveSlot(state, query.slotId);
    if (!resolved.ok) return resolved;
    if (!resolved.value.playerId) return fail("SLOT_EMPTY", `${slotLabel(resolved.value.id)} is empty; use draft_player instead.`);
    slots = [resolved.value];
  }
  if (query.position) slots = slots.filter((slot) => slot.type === query.position);
  if (!query.slotId) slots = slots.filter((slot) => !slot.playerId || !isProtectedPlayer(state, slot.playerId));
  if (slots.length === 0) {
    return fail("SLOT_EMPTY", "No filled, unprotected slots match; draft players first, then look for upgrades.");
  }

  const budgetLeft = remaining(state);
  const cap = Math.min(budgetLeft, query.maxCost ?? budgetLeft);
  const upgrades: Upgrade[] = [];
  for (const slot of slots) {
    const from = playerInSlot(state, slot);
    if (!from) continue;
    for (const to of candidatesFor(state, slot)) {
      const cost = roundPrice(to.price - from.price);
      if (cost > cap) continue;
      const gain = objectiveScore(to, query.objective) - objectiveScore(from, query.objective);
      if (gain <= 0) continue;
      upgrades.push({
        slotId: slot.id,
        from,
        to,
        gain,
        cost,
        efficiency: cost > 0 ? Math.round((gain / cost) * 10) / 10 : Number.POSITIVE_INFINITY,
      });
    }
  }
  upgrades.sort((a, b) => b.gain - a.gain || a.cost - b.cost);
  return { ok: true, value: upgrades.slice(0, query.limit) };
}

export function positionCounts(state: DraftState): Record<Position, number> {
  const counts: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 };
  for (const position of POSITIONS) {
    counts[position] = state.players.filter((p) => p.position === position && !p.drafted).length;
  }
  return counts;
}
