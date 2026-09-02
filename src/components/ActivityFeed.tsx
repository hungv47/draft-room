"use client";

import { AlertTriangle, ArrowLeftRight, ClipboardPen, GitBranch, LayoutGrid, Minus, Plus, RotateCcw, Sparkles } from "lucide-react";
import { useDraftStore } from "@/lib/store";
import type { ActivityEntry, ActivityKind } from "@/lib/types";
import { ActorTag } from "./ActorTag";

function formatTime(at: number): string {
  const d = new Date(at);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
}

const ICON: Record<ActivityKind, typeof Plus> = {
  draft: Plus,
  remove: Minus,
  swap: ArrowLeftRight,
  autofill: Sparkles,
  formation: LayoutGrid,
  scenario: GitBranch,
  brief: ClipboardPen,
  reset: RotateCcw,
  error: AlertTriangle,
};

/** Every squad change and who made it. Lives inside the agent console's Activity tab. */
export function ActivityFeed() {
  const activity = useDraftStore((s) => s.activity);

  if (activity.length === 0) {
    return (
      <p className="px-4 py-6 text-[13px] text-fog-2">No activity yet.</p>
    );
  }

  return (
    <ol className="px-2 pb-3 pt-2" aria-live="polite" aria-relevant="additions">
      {activity.map((entry, index) => (
        <FeedRow key={entry.id} entry={entry} latest={index === 0} />
      ))}
    </ol>
  );
}

function FeedRow({ entry, latest }: { entry: ActivityEntry; latest: boolean }) {
  const isError = entry.kind === "error";
  const Icon = ICON[entry.kind];
  const agent = entry.actor === "agent";
  return (
    <li className={`flex items-start gap-2.5 rounded-md px-2 py-2 ${latest ? "anim-rise-in bg-white/[0.045]" : ""}`}>
      <span
        className={`mt-px inline-flex size-6 shrink-0 items-center justify-center rounded-md ${
          isError ? "bg-danger/15 text-danger" : agent ? "bg-agent/12 text-agent" : "bg-human/12 text-human"
        }`}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <ActorTag actor={entry.actor} />
          <time className="text-[11px] text-fog-3 tabular" dateTime={new Date(entry.at).toISOString()}>
            {formatTime(entry.at)}
          </time>
        </div>
        <p className={`mt-1 text-[12.5px] leading-snug ${isError ? "text-fog-2" : "text-fog"}`}>{entry.message}</p>
        {entry.detail && <p className="mt-0.5 line-clamp-3 text-[11.5px] leading-snug text-fog-3">{entry.detail}</p>}
      </div>
    </li>
  );
}
