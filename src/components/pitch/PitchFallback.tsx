"use client";

import { useMemo } from "react";
import { PITCH, SLOT_COLOR, placementFor } from "@/lib/pitch-layout";
import { slotLabel } from "@/lib/format";
import { armbandFor, briefFor } from "@/lib/assignments";
import { playerInSlot } from "@/lib/engine";
import { useDraftStore } from "@/lib/store";
import { useBeginDrag, useDragSession } from "../DragController";
import { PlayerCard } from "../PlayerCard";

/**
 * Flat pitch for browsers without WebGL and for the instant before the renderer is ready. Same formation,
 * same cards, drawn in CSS over an SVG pitch.
 */
export function PitchFallback({ skeleton = false }: { skeleton?: boolean }) {
  const slots = useDraftStore((s) => s.slots);
  const players = useDraftStore((s) => s.players);
  const budgetTotal = useDraftStore((s) => s.budgetTotal);
  const formation = useDraftStore((s) => s.formation);
  const assignments = useDraftStore((s) => s.assignments);
  const selectedSlotId = useDraftStore((s) => s.selectedSlotId);
  const remove = useDraftStore((s) => s.remove);
  const select = useDraftStore((s) => s.select);
  const dragging = useDragSession();
  const beginDrag = useBeginDrag();
  const state = useMemo(() => ({ budgetTotal, formation, slots, players, assignments }), [budgetTotal, formation, slots, players, assignments]);

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <div className="relative aspect-[12/16.5] h-[92%] max-h-full" style={{ perspective: "1400px" }}>
        <div
          className="absolute inset-0 rounded-[10px]"
          style={{
            transform: "rotateX(38deg) scale(1.08)",
            transformOrigin: "50% 60%",
            background:
              "repeating-linear-gradient(180deg, #1c8a4d 0 7.14%, #187541 7.14% 14.28%)",
            boxShadow: "0 40px 80px -30px rgb(0 0 0 / 0.9), inset 0 0 120px rgb(0 0 0 / 0.55)",
          }}
        >
          <svg viewBox="0 0 68 105" className="absolute inset-0 h-full w-full" fill="none" stroke="rgba(240,255,245,0.85)" strokeWidth="0.45" aria-hidden>
            <rect x="3" y="3" width="62" height="99" />
            <line x1="3" y1="52.5" x2="65" y2="52.5" />
            <circle cx="34" cy="52.5" r="9.15" />
            <rect x="13.84" y="3" width="40.32" height="16.5" />
            <rect x="24.84" y="3" width="18.32" height="5.5" />
            <rect x="13.84" y="85.5" width="40.32" height="16.5" />
            <rect x="24.84" y="96.5" width="18.32" height="5.5" />
          </svg>
        </div>
        {!skeleton &&
          slots.map((slot) => {
            const player = playerInSlot(state, slot);
            const { x, z } = placementFor(formation, slot.id);
            const left = 50 + (x / PITCH.width) * 100 * 0.94;
            const top = 50 + (z / PITCH.depth) * 100 * 0.88;
            const valid = dragging !== null && dragging.player.position === slot.type;
            const over = dragging?.overSlotId === slot.id;
            const dimmed = selectedSlotId !== null && selectedSlotId !== slot.id && dragging === null;
            let emptyClass = "glass flex h-[72px] w-[72px] flex-col items-center justify-center rounded-full text-center";
            if (over && valid) emptyClass += " ring-2 ring-human";
            else if (valid) emptyClass += " ring-1 ring-human/50";
            else if (dragging) emptyClass += " opacity-40";
            return (
              <div
                key={slot.id}
                data-drop-slot={slot.id}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${left}%`, top: `${top}%` }}
                onPointerDown={(event) => {
                  if (!player || event.button !== 0) return;
                  if (event.target instanceof Element && event.target.closest("button")) return;
                  beginDrag(player, slot.id, event);
                }}
              >
                {player ? (
                  <div
                    className={`scale-[0.58] transition-opacity duration-300 sm:scale-[0.7] ${dimmed ? "opacity-45" : ""} ${dragging && !valid ? "opacity-40" : ""}`}
                    style={{ outline: over && valid ? "2px solid var(--human)" : undefined, outlineOffset: "3px" }}
                  >
                    <PlayerCard
                      player={player}
                      actor={slot.filledBy}
                      onRemove={() => remove({ slotId: slot.id }, "human")}
                      onSelect={() => select(selectedSlotId === slot.id ? null : slot.id)}
                      selected={selectedSlotId === slot.id}
                      armband={armbandFor(state, player.id)}
                      brief={briefFor(state, player.id)}
                    />
                  </div>
                ) : (
                  <div className={emptyClass} style={{ borderColor: `${SLOT_COLOR[slot.type]}66` }}>
                    <span className="text-[12px] font-semibold tabular">{slotLabel(slot.id)}</span>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
