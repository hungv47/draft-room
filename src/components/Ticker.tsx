"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { useDraftStore } from "@/lib/store";
import type { ActivityEntry } from "@/lib/types";

const HOLD_MS = 4200;
const OUT_MS = 380;

/**
 * Broadcast lower-third over the pitch. The latest move slides in, holds, and leaves; every earlier move
 * stays in the activity rail.
 */
export function Ticker() {
  const latest = useDraftStore((s) => s.activity[0]);
  const [shown, setShown] = useState<ActivityEntry | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!latest) return;
    setShown(latest);
    setLeaving(false);
    const hold = window.setTimeout(() => setLeaving(true), HOLD_MS);
    const clear = window.setTimeout(() => setShown(null), HOLD_MS + OUT_MS);
    return () => {
      window.clearTimeout(hold);
      window.clearTimeout(clear);
    };
  }, [latest]);

  if (!shown) return null;
  const isError = shown.kind === "error";
  const agent = shown.actor === "agent";

  return (
    <div key={shown.id} className={`max-w-[560px] md:mr-[96px] ${leaving ? "anim-ticker-out" : "anim-ticker-in"}`} aria-hidden>
      <div className="glass flex items-stretch overflow-hidden rounded-[10px]">
        <div className={`flex w-[84px] shrink-0 items-center justify-center ${agent ? "bg-agent text-night" : "bg-human text-night"}`}>
          <span className="display text-[20px]">{agent ? "Agent" : "You"}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2 px-3.5 py-2.5">
          {isError && <AlertTriangle className={`h-4 w-4 shrink-0 ${agent ? "text-agent" : "text-human"}`} aria-hidden />}
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-fog">{shown.message}</p>
            {shown.detail && <p className="truncate text-[12px] text-fog-2">{shown.detail}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
