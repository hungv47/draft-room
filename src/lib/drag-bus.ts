"use client";

import { useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import type { Player } from "@/lib/types";

/**
 * Drag session lives outside React context so R3F Canvas children (PitchCards) can read it.
 * The Canvas uses a separate reconciler and does not see providers around it.
 */

export interface DragSession {
  player: Player;
  fromSlotId: string | null;
  x: number;
  y: number;
  overSlotId: string | null;
  overPitch: boolean;
}

type BeginDrag = (player: Player, fromSlotId: string | null, event: ReactPointerEvent<Element>) => void;

let session: DragSession | null = null;
const listeners = new Set<() => void>();
let begin: BeginDrag = () => undefined;

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDragSession(): DragSession | null {
  return session;
}

export function publishDragSession(next: DragSession | null): void {
  session = next;
  emit();
}

export function setBeginDrag(fn: BeginDrag): void {
  begin = fn;
}

export function useDragSession(): DragSession | null {
  return useSyncExternalStore(subscribe, getDragSession, getDragSession);
}

export function useBeginDrag(): BeginDrag {
  return (player, fromSlotId, event) => begin(player, fromSlotId, event);
}
