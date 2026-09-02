"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  publishDragSession,
  setBeginDrag,
  type DragSession,
} from "@/lib/drag-bus";
import { kitFor } from "@/lib/kits";
import { getDraftStore } from "@/lib/store";
import type { Player } from "@/lib/types";
import { KitMini } from "./Kit";
import { splitName } from "./PlayerCard";

export { useBeginDrag, useDragSession, type DragSession } from "@/lib/drag-bus";

const THRESHOLD = 8;

interface DropHit {
  slotId: string | null;
  pitch: boolean;
}

function hitAt(x: number, y: number): DropHit {
  const miss: DropHit = { slotId: null, pitch: false };
  const el = document.elementFromPoint(x, y);
  if (!el) return miss;
  if (el.closest("[data-drop-ignore]")) return miss;
  const slot = el.closest("[data-drop-slot]");
  if (slot instanceof HTMLElement && slot.dataset.dropSlot) {
    return { slotId: slot.dataset.dropSlot, pitch: true };
  }
  return { slotId: null, pitch: el.closest("[data-drop-pitch]") !== null };
}

function suppressNextClick(): void {
  const kill = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    window.removeEventListener("click", kill, true);
  };
  window.addEventListener("click", kill, true);
  window.setTimeout(() => window.removeEventListener("click", kill, true), 80);
}

function drop(session: DragSession): void {
  const store = getDraftStore().getState();
  if (session.overSlotId && session.overSlotId !== session.fromSlotId) {
    store.place({ playerId: session.player.id, slotId: session.overSlotId }, "human");
    return;
  }
  if (session.overPitch && session.fromSlotId === null) {
    store.draft({ playerId: session.player.id }, "human");
  }
}

function pushSession(next: DragSession | null, setSession: (s: DragSession | null) => void): void {
  setSession(next);
  publishDragSession(next);
}

/**
 * Pointer drag from the pool (or a pitch card) onto a named slot or the grass.
 * Clicks still draft / open the inspector: a drag only starts after 8px of movement.
 */
export function DragController({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<DragSession | null>(null);
  const pending = useRef<{
    player: Player;
    fromSlotId: string | null;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const cancelled = useRef(false);
  sessionRef.current = session;

  const finish = useCallback((commit: boolean) => {
    const current = sessionRef.current;
    const hadPending = pending.current !== null;
    pending.current = null;
    cancelled.current = !commit && (current !== null || hadPending);
    document.documentElement.classList.remove("dragging");
    sessionRef.current = null;
    pushSession(null, setSession);
    if (commit && current) {
      suppressNextClick();
      drop(current);
    }
  }, []);

  const beginPointer = useCallback((player: Player, fromSlotId: string | null, event: ReactPointerEvent<Element>) => {
    if (event.button !== 0) return;
    pending.current = {
      player,
      fromSlotId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  }, []);

  useEffect(() => {
    setBeginDrag(beginPointer);
    return () => setBeginDrag(() => undefined);
  }, [beginPointer]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const start = pending.current;
      const live = sessionRef.current;
      if (!start && !live) return;
      if (start && event.pointerId !== start.pointerId) return;
      if (live && start && event.pointerId !== start.pointerId) return;

      if (start && !live) {
        const dx = event.clientX - start.startX;
        const dy = event.clientY - start.startY;
        if (dx * dx + dy * dy < THRESHOLD * THRESHOLD) return;
        event.preventDefault();
        document.documentElement.classList.add("dragging");
        getDraftStore().getState().select(null);
        const hit = hitAt(event.clientX, event.clientY);
        const next: DragSession = {
          player: start.player,
          fromSlotId: start.fromSlotId,
          x: event.clientX,
          y: event.clientY,
          overSlotId: hit.slotId,
          overPitch: hit.pitch,
        };
        sessionRef.current = next;
        pushSession(next, setSession);
        return;
      }

      if (!live) return;
      event.preventDefault();
      const hit = hitAt(event.clientX, event.clientY);
      const next: DragSession = {
        ...live,
        x: event.clientX,
        y: event.clientY,
        overSlotId: hit.slotId,
        overPitch: hit.pitch,
      };
      sessionRef.current = next;
      pushSession(next, setSession);
    };

    const onUp = (event: PointerEvent) => {
      const start = pending.current;
      if (start && event.pointerId !== start.pointerId) return;
      if (cancelled.current) {
        cancelled.current = false;
        pending.current = null;
        suppressNextClick();
        return;
      }
      const live = sessionRef.current;
      if (live) {
        event.preventDefault();
        finish(true);
        return;
      }
      pending.current = null;
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && (pending.current || sessionRef.current)) {
        event.preventDefault();
        finish(false);
      }
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [finish]);

  return (
    <>
      {children}
      {session && <Ghost session={session} />}
    </>
  );
}

function Ghost({ session }: { session: DragSession }) {
  const kit = kitFor(session.player.team, session.player.position);
  const { family } = splitName(session.player.name);
  const valid = session.overSlotId !== null || session.overPitch;
  return (
    <div
      className="pointer-events-none fixed z-[200] flex items-center gap-2 rounded-lg border border-line-2 bg-night-2 px-2 py-1.5 shadow-panel"
      style={{
        left: session.x,
        top: session.y,
        transform: "translate(-20%, -110%)",
        opacity: valid ? 1 : 0.7,
      }}
      aria-hidden
    >
      <KitMini kit={kit} size={28} />
      <span className="display text-[15px] leading-none text-fog">{family}</span>
    </div>
  );
}
