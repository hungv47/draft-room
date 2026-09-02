"use client";

import { Html } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import { PITCH, SLOT_COLOR, placementFor } from "@/lib/pitch-layout";
import { slotLabel } from "@/lib/format";
import { armbandFor, briefFor } from "@/lib/assignments";
import { playerInSlot } from "@/lib/engine";
import { useDraftStore } from "@/lib/store";
import type { Armband, FormationId, Player, PlayerBrief, RosterSlot } from "@/lib/types";
import { useBeginDrag, useDragSession } from "../DragController";
import { PlayerCard } from "../PlayerCard";

const LEAVE_MS = 380;
const STAGGER_MS = 90;

interface PitchCardsProps {
  /** Scene units per 400 CSS px; smaller makes cards smaller. */
  distanceFactor: number;
}

export function PitchCards({ distanceFactor }: PitchCardsProps) {
  const slots = useDraftStore((s) => s.slots);
  const players = useDraftStore((s) => s.players);
  const budgetTotal = useDraftStore((s) => s.budgetTotal);
  const formation = useDraftStore((s) => s.formation);
  const assignments = useDraftStore((s) => s.assignments);
  const lastFill = useDraftStore((s) => s.lastFill);
  const selectedSlotId = useDraftStore((s) => s.selectedSlotId);
  const remove = useDraftStore((s) => s.remove);
  const select = useDraftStore((s) => s.select);
  const state = useMemo(() => ({ budgetTotal, formation, slots, players, assignments }), [budgetTotal, formation, slots, players, assignments]);

  return (
    <group>
      {slots.map((slot) => {
        const player = playerInSlot(state, slot) ?? null;
        const order = lastFill?.slotIds.indexOf(slot.id) ?? -1;
        return (
          <SlotCard
            key={slot.id}
            slot={slot}
            formation={formation}
            player={player}
            staggerIndex={order}
            distanceFactor={distanceFactor}
            selected={selectedSlotId === slot.id}
            dimmed={selectedSlotId !== null && selectedSlotId !== slot.id}
            armband={player ? armbandFor(state, player.id) : "none"}
            brief={player ? briefFor(state, player.id) : undefined}
            onRemove={() => remove({ slotId: slot.id }, "human")}
            onSelect={() => select(selectedSlotId === slot.id ? null : slot.id)}
          />
        );
      })}
    </group>
  );
}

type Phase = "landing" | "idle" | "leaving";

function SlotCard({
  slot,
  formation,
  player,
  staggerIndex,
  distanceFactor,
  selected,
  dimmed,
  armband,
  brief,
  onRemove,
  onSelect,
}: {
  slot: RosterSlot;
  formation: FormationId;
  player: Player | null;
  staggerIndex: number;
  distanceFactor: number;
  selected: boolean;
  /** Another card is open in the inspector; step back so it reads as the focus. */
  dimmed: boolean;
  armband: Armband;
  brief: PlayerBrief | undefined;
  onRemove: () => void;
  onSelect: () => void;
}) {
  const { x, z } = placementFor(formation, slot.id);
  const [shown, setShown] = useState<Player | null>(player);
  const [phase, setPhase] = useState<Phase>(player ? "idle" : "leaving");
  const [landKey, setLandKey] = useState(0);
  const previousId = useRef<string | null>(player?.id ?? null);

  useEffect(() => {
    const nextId = player?.id ?? null;
    if (nextId === previousId.current) return;
    previousId.current = nextId;
    if (player) {
      setShown(player);
      setPhase("landing");
      setLandKey((k) => k + 1);
      return;
    }
    setPhase("leaving");
    const timer = window.setTimeout(() => setShown(null), LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [player]);

  const delay = phase === "landing" && staggerIndex > 0 ? staggerIndex * STAGGER_MS : 0;
  const dragging = useDragSession();
  const beginDrag = useBeginDrag();
  const dropLive = dragging !== null;
  const validDrop = dragging !== null && dragging.player.position === slot.type;
  const over = dragging?.overSlotId === slot.id;
  const blockPointer = phase === "leaving" || (dimmed && !dropLive);

  return (
    <group position={[x, PITCH.cardHeight, z]}>
      <Html transform sprite center distanceFactor={distanceFactor} zIndexRange={selected ? [8, 7] : [6, 1]} style={{ pointerEvents: "none" }}>
        {shown ? (
          <div
            key={landKey}
            data-drop-slot={slot.id}
            className={`${phase === "leaving" ? "anim-card-leave" : "anim-card-land"} transition-opacity duration-300`}
            style={{
              animationDelay: `${delay}ms`,
              pointerEvents: blockPointer ? "none" : "auto",
              opacity: dimmed && !dropLive ? 0.45 : dropLive && !validDrop ? 0.4 : undefined,
              outline: over && validDrop ? "2px solid var(--human)" : undefined,
              outlineOffset: "3px",
            }}
            onAnimationEnd={() => {
              if (phase === "landing") setPhase("idle");
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              if (event.target instanceof Element && event.target.closest("button")) return;
              beginDrag(shown, slot.id, event);
            }}
          >
            <PlayerCard
              player={shown}
              actor={slot.filledBy}
              onRemove={onRemove}
              onSelect={onSelect}
              selected={selected}
              armband={armband}
              brief={brief}
              lit={phase === "landing"}
            />
          </div>
        ) : (
          <EmptySlotChip slot={slot} />
        )}
      </Html>
    </group>
  );
}

/** Sits in the card's footprint so the eye reads an open place in the formation, not a missing card. */
function EmptySlotChip({ slot }: { slot: RosterSlot }) {
  const colour = SLOT_COLOR[slot.type];
  const dragging = useDragSession();
  const valid = dragging !== null && dragging.player.position === slot.type;
  const over = dragging?.overSlotId === slot.id;
  let chipExtra = "";
  if (dragging && valid && over) chipExtra = "ring-2 ring-human";
  else if (dragging && valid) chipExtra = "ring-1 ring-human/50";
  else if (dragging) chipExtra = "opacity-40";
  return (
    <div data-drop-slot={slot.id} className="flex h-[204px] w-[150px] items-end justify-center pb-4" style={{ pointerEvents: "auto" }}>
      <div className={`glass flex items-center gap-2 rounded-full px-3 py-1.5 ${chipExtra}`} style={{ borderColor: `${colour}66` }}>
        <span className="h-2 w-2 rounded-full" style={{ background: colour, boxShadow: `0 0 10px ${colour}` }} aria-hidden />
        <span className="text-[13px] font-semibold tabular leading-none text-fog">{slotLabel(slot.id)}</span>
      </div>
    </div>
  );
}
