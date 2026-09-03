"use client";

import { Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { EXAMPLE_PROMPTS } from "@/lib/site";
import { useDraftStore } from "@/lib/store";
import { CopyButton } from "./CopyButton";
import { useDragSession } from "./DragController";
import type { Backend } from "./pitch/PitchScene";
import { PitchFallback } from "./pitch/PitchFallback";
import { PlayerInspector } from "./PlayerInspector";
import { Scoreboard } from "./Scoreboard";
import { Ticker } from "./Ticker";

const PitchScene = dynamic(() => import("./pitch/PitchScene").then((m) => m.PitchScene), {
  ssr: false,
  loading: () => <PitchFallback skeleton />,
});

const BACKEND_LABEL: Record<Exclude<Backend, "webgpu">, string> = {
  webgl: "WebGL",
  none: "Flat pitch",
};

/** The centre of the room: the stadium with the score bug and the ticker laid over it. */
export function PitchPanel() {
  const [backend, setBackend] = useState<Backend | null>(null);
  const [pitchReady, setPitchReady] = useState(false);
  const [forceFallback, setForceFallback] = useState(false);
  const empty = useDraftStore((s) => s.slots.every((slot) => slot.playerId === null));
  const calls = useDraftStore((s) => s.calls.length);
  const selected = useDraftStore((s) => s.selectedSlotId !== null);
  const select = useDraftStore((s) => s.select);
  const dragging = useDragSession();

  useEffect(() => {
    if (pitchReady) return;
    // The dynamic 3D module or its adapter can stall before PitchScene mounts. The flat pitch is a
    // complete renderer, so promote it instead of leaving the loading cover up forever.
    const timeout = window.setTimeout(() => {
      setForceFallback(true);
      setBackend("none");
      setPitchReady(true);
    }, 10_000);
    return () => window.clearTimeout(timeout);
  }, [pitchReady]);

  return (
    <section
      aria-label="Squad on the pitch"
      data-drop-pitch
      data-pitch-backend={backend ?? "pending"}
      data-pitch-ready={pitchReady ? "true" : "false"}
      className="relative isolate min-h-0 flex-1 overflow-hidden rounded-xl border border-line bg-night-2 shadow-panel"
    >
      <div className="absolute inset-0 z-0">
        {forceFallback ? <PitchFallback /> : <PitchScene onBackend={setBackend} onReady={() => setPitchReady(true)} />}
      </div>

      <div data-drop-ignore className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center p-2.5 sm:p-3 [transform:translateZ(0)]">
        <Scoreboard />
      </div>

      {!pitchReady && (
        <p role="status" aria-live="polite" data-drop-ignore className="glass pointer-events-none absolute left-2.5 top-2.5 z-20 rounded-md px-2 py-1 text-[11px] font-medium text-fog-2 sm:left-3 sm:top-3">
          Loading pitch…
        </p>
      )}

      {empty && calls === 0 && !selected && !dragging && (
        <div data-drop-ignore className="pointer-events-none absolute inset-x-0 top-[96px] z-20 flex justify-center px-4 sm:top-[104px] [transform:translateZ(0)]">
          <div className="glass pointer-events-auto anim-rise-in flex max-w-[min(100%,440px)] items-start gap-2 rounded-xl px-3 py-2.5">
            <Sparkles className="mt-[3px] size-3 shrink-0 text-agent" aria-hidden />
            <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-fog">{EXAMPLE_PROMPTS[0]}</p>
            <CopyButton text={EXAMPLE_PROMPTS[0]} label="Copy prompt" className="-mr-1 -mt-0.5" />
          </div>
        </div>
      )}

      {selected && (
        <div data-drop-ignore className="absolute inset-0 z-30 [transform:translateZ(0)]">
          <button type="button" aria-label="Close inspector" className="absolute inset-0 bg-night/50" onClick={() => select(null)} />
          <div className="pointer-events-none absolute inset-x-2.5 bottom-[64px] top-[92px] flex items-end sm:inset-x-3 sm:top-[100px]">
            <PlayerInspector />
          </div>
        </div>
      )}

      {backend && backend !== "webgpu" && (
        <div data-drop-ignore className="pointer-events-none absolute bottom-2.5 right-2.5 z-20 hidden sm:bottom-3 sm:right-3 md:block [transform:translateZ(0)]">
          <div role="status" className={`glass rounded-md px-2 py-1 text-[11px] font-medium ${backend === "none" ? "text-danger" : "text-fog-3"}`}>
            {backend === "none" ? "3D unavailable · flat pitch active" : BACKEND_LABEL[backend]}
          </div>
        </div>
      )}

      <div data-drop-ignore className="pointer-events-none absolute inset-x-2.5 bottom-2.5 z-20 sm:inset-x-3 sm:bottom-3 [transform:translateZ(0)]">
        <Ticker />
      </div>
    </section>
  );
}
