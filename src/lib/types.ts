export const POSITIONS = ["GK", "DF", "MF", "FW"] as const;
export type Position = (typeof POSITIONS)[number];

export const POSITION_LABEL: Readonly<Record<Position, string>> = {
  GK: "Goalkeeper",
  DF: "Defender",
  MF: "Midfielder",
  FW: "Forward",
};

export interface Player {
  id: string;
  name: string;
  position: Position;
  team: string;
  /** Price in £m, 0.5 increments. */
  price: number;
  projectedPoints: number;
  drafted: boolean;
}

export const FORMATION_IDS = ["4-3-3", "4-4-2", "3-5-2", "3-4-3", "5-3-2", "4-5-1", "5-4-1"] as const;
export type FormationId = (typeof FORMATION_IDS)[number];

export interface FormationSpec {
  id: FormationId;
  /** Outfield counts; the goalkeeper is always one. */
  DF: number;
  MF: number;
  FW: number;
  /** One line of tactical flavour an agent can quote back. */
  note: string;
}

/** Who caused a squad change. Tools always act as the agent; clicks are the human. */
export type Actor = "agent" | "human";

export interface RosterSlot {
  id: string;
  type: Position;
  playerId: string | null;
  /** Set when a slot is filled so the UI can show who made the pick. */
  filledBy: Actor | null;
}

/** Standing instructions the manager attaches to a drafted player; agents read them as the brief. */
export const DUTIES = ["penalties", "set_pieces", "protected"] as const;
export type Duty = (typeof DUTIES)[number];

export const DUTY_LABEL: Readonly<Record<Duty, string>> = {
  penalties: "Penalties",
  set_pieces: "Set pieces",
  protected: "Protected",
};

export type Armband = "captain" | "vice" | "none";

export interface PlayerBrief {
  duties: Duty[];
  /** Free-text instruction for the agent, e.g. "keep him unless a better ARS forward appears". */
  note: string;
}

export interface Assignments {
  captainId: string | null;
  viceId: string | null;
  /** Keyed by player id; absent means no duties and no note. */
  briefs: Record<string, PlayerBrief>;
}

export const EMPTY_ASSIGNMENTS: Assignments = { captainId: null, viceId: null, briefs: {} };

export interface DraftState {
  budgetTotal: number;
  formation: FormationId;
  slots: RosterSlot[];
  players: Player[];
  assignments: Assignments;
}

export type AutoFillStrategy = "value" | "stars_and_scrubs";

/** What a squad is optimised for: expected points, a safe floor (p10), or upside (p90). */
export type Objective = "mean" | "floor" | "ceiling";

export type ActivityKind =
  | "draft"
  | "remove"
  | "swap"
  | "autofill"
  | "formation"
  | "scenario"
  | "brief"
  | "reset"
  | "error";

export interface ActivityEntry {
  id: number;
  at: number;
  actor: Actor;
  kind: ActivityKind;
  message: string;
  /** Secondary line, e.g. the reasoning behind an auto-fill pick. */
  detail?: string;
  slotId?: string;
}

export interface Failure {
  ok: false;
  error: string;
  code: ErrorCode;
}

export type Result<T> = { ok: true; value: T } | Failure;

export type ErrorCode =
  | "PLAYER_NOT_FOUND"
  | "PLAYER_AMBIGUOUS"
  | "SLOT_NOT_FOUND"
  | "ALREADY_DRAFTED"
  | "SLOT_OCCUPIED"
  | "SLOT_EMPTY"
  | "NOT_ELIGIBLE"
  | "NO_ELIGIBLE_SLOT"
  | "OVER_BUDGET"
  | "SQUAD_FULL"
  | "NOTHING_TO_REMOVE"
  | "FORMATION_UNKNOWN"
  | "FORMATION_CONFLICT"
  | "SCENARIO_FAILED"
  | "PROTECTED"
  | "NOT_IN_SQUAD"
  | "IMPOSSIBLE_SQUAD"
  | "INTERNAL_ERROR"
  | "INVALID_INPUT";

export interface Pick {
  slotId: string;
  player: Player;
  /** Short, human-readable justification used by the activity feed and tool output. */
  reason?: string;
}

export interface SlotSummary {
  slotId: string;
  type: Position;
  player: {
    id: string;
    name: string;
    position: Position;
    team: string;
    price: number;
    projectedPoints: number;
  } | null;
  filledBy: Actor | null;
}

export interface RosterSummary {
  formation: FormationId;
  captainId: string | null;
  viceId: string | null;
  slots: SlotSummary[];
  filledSlots: number;
  totalSlots: number;
  emptySlotIds: string[];
  budgetTotal: number;
  spent: number;
  remaining: number;
  projectedPoints: number;
  complete: boolean;
}
