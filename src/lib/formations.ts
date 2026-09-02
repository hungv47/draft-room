import { FORMATION_IDS, type FormationId, type FormationSpec, type Position, type RosterSlot } from "./types";

export const DEFAULT_FORMATION: FormationId = "4-3-3";

export const FORMATIONS: Readonly<Record<FormationId, FormationSpec>> = {
  "4-3-3": { id: "4-3-3", DF: 4, MF: 3, FW: 3, note: "Balanced; three forwards for the highest-ceiling attackers." },
  "4-4-2": { id: "4-4-2", DF: 4, MF: 4, FW: 2, note: "Classic shape; midfield depth, two strikers." },
  "3-5-2": { id: "3-5-2", DF: 3, MF: 5, FW: 2, note: "Midfield-heavy; suits a pool where midfielders carry the points." },
  "3-4-3": { id: "3-4-3", DF: 3, MF: 4, FW: 3, note: "Front-loaded; the most attackers you can field." },
  "5-3-2": { id: "5-3-2", DF: 5, MF: 3, FW: 2, note: "Defensive; cheap floor from clean-sheet points." },
  "4-5-1": { id: "4-5-1", DF: 4, MF: 5, FW: 1, note: "One striker, five midfielders; spreads risk across the middle." },
  "5-4-1": { id: "5-4-1", DF: 5, MF: 4, FW: 1, note: "Most defensive; nine cheap outfielders around one star." },
};

export function isFormationId(value: string): value is FormationId {
  return FORMATION_IDS.some((id) => id === value);
}

/** Accepts "4-3-3", "433", "4 3 3", "4/3/3". */
export function parseFormation(text: string): FormationId | undefined {
  const digits = text.replace(/[^0-9]/g, "");
  if (digits.length !== 3) return undefined;
  const candidate = `${digits[0]}-${digits[1]}-${digits[2]}`;
  return isFormationId(candidate) ? candidate : undefined;
}

/** Slots in pitch order: GK, then defenders, midfielders, forwards. Ids are stable per position (DF1..DFn). */
export function createSlots(formation: FormationId): RosterSlot[] {
  const spec = FORMATIONS[formation];
  const slots: RosterSlot[] = [{ id: "GK", type: "GK", playerId: null, filledBy: null }];
  const line = (type: Exclude<Position, "GK">, count: number) => {
    for (let i = 1; i <= count; i++) slots.push({ id: `${type}${i}`, type, playerId: null, filledBy: null });
  };
  line("DF", spec.DF);
  line("MF", spec.MF);
  line("FW", spec.FW);
  return slots;
}

export function slotsPerPosition(formation: FormationId): Record<Position, number> {
  const spec = FORMATIONS[formation];
  return { GK: 1, DF: spec.DF, MF: spec.MF, FW: spec.FW };
}

export function formationLabel(formation: FormationId): string {
  return formation;
}
