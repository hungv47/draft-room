import { FORMATIONS } from "./formations";
import type { FormationId, Position, RosterSlot } from "./types";

/** Pitch dimensions in scene units. x runs across the pitch, z runs goal to goal (camera sits at +z). */
export const PITCH = {
  width: 12,
  depth: 16.5,
  /** Height above the grass at which a card hovers. */
  cardHeight: 1.05,
} as const;

export interface SlotPlacement {
  x: number;
  z: number;
}

/** Goalkeeper at the far goal, forwards nearest the camera so the expensive cards read largest. */
const LINE_Z: Readonly<Record<Position, number>> = { GK: -6.7, DF: -3.9, MF: -0.7, FW: 3.9 };
const USABLE_WIDTH = 10.2;
const MAX_SPACING = 3.9;

function lineOf(count: number, z: number, curve: number): SlotPlacement[] {
  if (count <= 1) return [{ x: 0, z }];
  const spacing = Math.min(MAX_SPACING, USABLE_WIDTH / (count - 1));
  const centre = (count - 1) / 2;
  return Array.from({ length: count }, (_, i) => {
    const offset = i - centre;
    // Wide players bow the line: defenders push up as full-backs, forwards drop as wingers.
    const bow = curve * (offset / Math.max(1, centre)) ** 2;
    return { x: offset * spacing, z: z + bow };
  });
}

const layoutCache = new Map<FormationId, Map<string, SlotPlacement>>();

/** Where each slot of a formation stands. Stable per formation; cached. */
export function formationLayout(formation: FormationId): Map<string, SlotPlacement> {
  const cached = layoutCache.get(formation);
  if (cached) return cached;
  const spec = FORMATIONS[formation];
  const layout = new Map<string, SlotPlacement>();
  layout.set("GK", { x: 0, z: LINE_Z.GK });
  lineOf(spec.DF, LINE_Z.DF, 0.55).forEach((p, i) => layout.set(`DF${i + 1}`, p));
  lineOf(spec.MF, LINE_Z.MF, 0.25).forEach((p, i) => layout.set(`MF${i + 1}`, p));
  lineOf(spec.FW, LINE_Z.FW, -0.6).forEach((p, i) => layout.set(`FW${i + 1}`, p));
  layoutCache.set(formation, layout);
  return layout;
}

const CENTRE_SPOT: SlotPlacement = { x: 0, z: 0 };

export function placementFor(formation: FormationId, slotId: string): SlotPlacement {
  return formationLayout(formation).get(slotId) ?? CENTRE_SPOT;
}

export function placements(formation: FormationId, slots: readonly RosterSlot[]): { slot: RosterSlot; at: SlotPlacement }[] {
  return slots.map((slot) => ({ slot, at: placementFor(formation, slot.id) }));
}

/** Position colour used for empty markers on the pitch and position badges. */
export const SLOT_COLOR: Readonly<Record<Position, string>> = {
  GK: "#f4c95d",
  DF: "#6cf0a4",
  MF: "#8ceeff",
  FW: "#ff86ae",
};

export const ACTOR_COLOR = {
  human: "#ff3f7f",
  agent: "#34e1ff",
} as const;
