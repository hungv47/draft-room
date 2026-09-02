import { playerById, playerInSlot, resolvePlayer, slotOf } from "./engine";
import { slotLabel } from "./format";
import { DUTIES, DUTY_LABEL, type Armband, type Assignments, type DraftState, type Duty, type ErrorCode, type Failure, type PlayerBrief, type Result } from "./types";

export { isProtectedPlayer as isProtected } from "./engine";

/*
 * Assignments are the manager's standing instructions on drafted players: the armband (captain scores
 * double; the vice takes over in a disrupted captain season), duties, and a free-text note. Together
 * they form the brief. Humans edit them by clicking a card on the pitch; agents read the brief with
 * `get_brief` and can write it with `set_assignment`. Protection is the one duty with teeth: an agent
 * cannot remove, swap out, or release a protected player without `force`.
 */

const EMPTY_BRIEF: PlayerBrief = { duties: [], note: "" };
const MAX_NOTE = 280;

function fail(code: ErrorCode, error: string): Failure {
  return { ok: false, code, error };
}

export function briefFor(state: DraftState, playerId: string): PlayerBrief {
  return state.assignments.briefs[playerId] ?? EMPTY_BRIEF;
}

export function armbandFor(state: DraftState, playerId: string): Armband {
  if (state.assignments.captainId === playerId) return "captain";
  if (state.assignments.viceId === playerId) return "vice";
  return "none";
}


export function hasAssignments(state: DraftState, playerId: string): boolean {
  const brief = briefFor(state, playerId);
  return armbandFor(state, playerId) !== "none" || brief.duties.length > 0 || brief.note.length > 0;
}

export interface AssignInput {
  playerId: string;
  armband?: Armband;
  /** Replaces the duty list when given. */
  duties?: Duty[];
  /** Replaces the note when given; an empty string clears it. */
  note?: string;
}

export interface AssignChange {
  state: DraftState;
  playerId: string;
  slotId: string;
  /** Human-readable lines, one per field that changed. */
  changes: string[];
}

function writeBrief(assignments: Assignments, playerId: string, brief: PlayerBrief): Assignments {
  const briefs = { ...assignments.briefs };
  if (brief.duties.length === 0 && brief.note === "") delete briefs[playerId];
  else briefs[playerId] = brief;
  return { ...assignments, briefs };
}

/** Apply any combination of armband, duties, and note to one drafted player. */
export function assign(state: DraftState, input: AssignInput): Result<AssignChange> {
  // A slot id ("FW1") names whoever is in it; anything else is a player id or name.
  const bySlot = state.slots.find((s) => s.id.toUpperCase() === input.playerId.replace(/[\s_-]+/g, "").toUpperCase());
  const found = bySlot ? resolvePlayer(state, bySlot.playerId ?? input.playerId) : resolvePlayer(state, input.playerId);
  if (!found.ok) return found;
  const player = found.value;
  const slot = slotOf(state, player.id);
  if (!slot) return fail("NOT_IN_SQUAD", `${player.name} is not in the squad; draft them before assigning duties.`);

  let assignments = state.assignments;
  const changes: string[] = [];

  if (input.armband !== undefined && input.armband !== armbandFor(state, player.id)) {
    const previousCaptain = assignments.captainId;
    const previousVice = assignments.viceId;
    let captainId = previousCaptain === player.id ? null : previousCaptain;
    let viceId = previousVice === player.id ? null : previousVice;
    if (input.armband === "captain") {
      // A captain who was vice, or a vice who becomes captain, leaves the other armband to the old holder.
      if (previousCaptain && previousCaptain !== player.id && previousVice === player.id) viceId = previousCaptain;
      captainId = player.id;
    } else if (input.armband === "vice") {
      if (previousVice && previousVice !== player.id && previousCaptain === player.id) captainId = previousVice;
      viceId = player.id;
    }
    assignments = { ...assignments, captainId, viceId };
    changes.push(
      input.armband === "none"
        ? `${player.name} hands back the armband`
        : `${player.name} is ${input.armband === "captain" ? "captain" : "vice-captain"}${
            input.armband === "captain" && previousCaptain && previousCaptain !== player.id
              ? ` (was ${playerById(state, previousCaptain)?.name ?? previousCaptain})`
              : ""
          }`,
    );
  }

  const current = briefFor(state, player.id);
  let next: PlayerBrief = current;
  if (input.duties !== undefined) {
    const duties = DUTIES.filter((duty) => input.duties?.includes(duty));
    if (duties.join() !== current.duties.join()) {
      next = { ...next, duties };
      changes.push(duties.length === 0 ? `${player.name} has no duties` : `${player.name}: ${duties.map((d) => DUTY_LABEL[d].toLowerCase()).join(", ")}`);
    }
  }
  if (input.note !== undefined) {
    const note = input.note.trim().slice(0, MAX_NOTE);
    if (note !== current.note) {
      next = { ...next, note };
      changes.push(note === "" ? `Note on ${player.name} cleared` : `Note on ${player.name}: “${note}”`);
    }
  }
  if (next !== current) assignments = writeBrief(assignments, player.id, next);

  return {
    ok: true,
    value: { state: assignments === state.assignments ? state : { ...state, assignments }, playerId: player.id, slotId: slot.id, changes },
  };
}

export interface BriefLine {
  playerId: string;
  name: string;
  slotId: string;
  armband: Armband;
  duties: Duty[];
  note: string;
}

/** Every drafted player with at least one assignment, in slot order. */
export function briefLines(state: DraftState): BriefLine[] {
  const lines: BriefLine[] = [];
  for (const slot of state.slots) {
    const player = playerInSlot(state, slot);
    if (!player || !hasAssignments(state, player.id)) continue;
    const brief = briefFor(state, player.id);
    lines.push({ playerId: player.id, name: player.name, slotId: slot.id, armband: armbandFor(state, player.id), duties: brief.duties, note: brief.note });
  }
  return lines;
}

/** The brief as prose an agent (or a human pasting into one) can act on. */
export function composeBrief(state: DraftState): string {
  const lines = briefLines(state);
  if (lines.length === 0) return "";
  const out: string[] = [`Manager's brief for the ${state.formation}:`];
  for (const line of lines) {
    const parts: string[] = [];
    if (line.armband === "captain") parts.push("captain (points count double)");
    if (line.armband === "vice") parts.push("vice-captain");
    for (const duty of line.duties) {
      parts.push(duty === "protected" ? "protected: do not remove or swap without asking" : DUTY_LABEL[duty].toLowerCase());
    }
    if (line.note) parts.push(`note: "${line.note}"`);
    out.push(`- ${line.name} (${slotLabel(line.slotId)}): ${parts.join("; ")}`);
  }
  return out.join("\n");
}

