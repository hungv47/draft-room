"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { playerInSlot, projectedPoints, remaining, squadPlayers } from "@/lib/engine";
import { formatPoints, formatPrice, roundPrice } from "@/lib/format";
import { projectSquad } from "@/lib/model";
import { useTweenedNumber } from "@/lib/motion";
import { useDraftStore } from "@/lib/store";
import type { Actor } from "@/lib/types";

/** Scoreboard Monte Carlo runs on every squad change; 1,500 samples keep it under a frame on a laptop. */
const BOARD_SAMPLES = 1500;

/**
 * The score bug. Dot-matrix numerals like a stadium board: budget left in the centre, each actor's spend
 * either side, projected points with the model's floor and ceiling on the right.
 */
export function Scoreboard() {
  const budgetTotal = useDraftStore((s) => s.budgetTotal);
  const slots = useDraftStore((s) => s.slots);
  const players = useDraftStore((s) => s.players);
  const formation = useDraftStore((s) => s.formation);
  const assignments = useDraftStore((s) => s.assignments);

  const { left, byActor, filled, points, outlook } = useMemo(() => {
    const state = { budgetTotal, formation, slots, players, assignments };
    const split: Record<Actor, number> = { human: 0, agent: 0 };
    let count = 0;
    for (const slot of slots) {
      const player = playerInSlot(state, slot);
      if (player && slot.filledBy) {
        split[slot.filledBy] = roundPrice(split[slot.filledBy] + player.price);
        count++;
      }
    }
    const squad = squadPlayers(state);
    const projection = squad.length > 0 ? projectSquad(squad, { samples: BOARD_SAMPLES, captainId: assignments.captainId, viceId: assignments.viceId }) : null;
    return { left: remaining(state), byActor: split, filled: count, points: projectedPoints(state), outlook: projection };
  }, [budgetTotal, formation, slots, players, assignments]);

  const shownLeft = useTweenedNumber(left, 10);
  const shownPoints = useTweenedNumber(points, 10);
  const shownHuman = useTweenedNumber(byActor.human, 10);
  const shownAgent = useTweenedNumber(byActor.agent, 10);

  const previous = useRef(left);
  const [delta, setDelta] = useState<{ value: number; key: number } | null>(null);
  useEffect(() => {
    const change = roundPrice(left - previous.current);
    previous.current = left;
    if (change === 0) return;
    setDelta({ value: change, key: Date.now() });
    const timer = window.setTimeout(() => setDelta(null), 2600);
    return () => window.clearTimeout(timer);
  }, [left]);

  const humanPct = (byActor.human / budgetTotal) * 100;
  const agentPct = (byActor.agent / budgetTotal) * 100;

  return (
    <div className="glass pointer-events-auto flex max-w-full min-w-0 items-stretch rounded-xl" role="group" aria-label="Scoreboard">
      <Side actor="human" value={shownHuman} label="You" />

      <div className="flex min-w-0 flex-col items-center justify-center px-3 py-2 sm:min-w-[190px] sm:px-4">
        <div className="flex items-baseline gap-2">
          <output aria-live="polite" aria-label="Budget remaining" className={`board text-[30px] leading-none sm:text-[36px] ${left === 0 ? "text-fog-2" : "text-fog"}`}>
            {formatPrice(shownLeft)}
          </output>
          {delta && (
            <span key={delta.key} className={`anim-rise-in board text-[12px] leading-none ${delta.value < 0 ? "text-human-2" : "text-pitch-glow"}`} aria-hidden>
              {delta.value > 0 ? "+" : "−"}
              {formatPrice(Math.abs(delta.value))}
            </span>
          )}
        </div>
        <div className="eyebrow mt-1" aria-live="polite">
          <span className="sm:hidden">{formation} · </span>
          {filled}/{slots.length}
          {filled === slots.length && <span> · Full</span>}
          {left === 0 && <span> · No budget</span>}
        </div>
        <div className="mt-2 flex h-[3px] w-full overflow-hidden rounded-full bg-white/10" role="img" aria-label={`${formatPrice(byActor.human)} spent by you, ${formatPrice(byActor.agent)} spent by the agent`}>
          <span className="h-full bg-human transition-[width] duration-500 ease-out" style={{ width: `${humanPct}%` }} />
          <span className="h-full bg-agent transition-[width] duration-500 ease-out" style={{ width: `${agentPct}%` }} />
        </div>
      </div>

      <Side actor="agent" value={shownAgent} label="Agent" />

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="hidden cursor-help flex-col items-end justify-center border-l border-line px-4 py-2 sm:flex">
            <div className="board text-[22px] leading-none text-fog">
              {formatPoints(shownPoints)}
              <span className="ml-1 text-[10px] text-fog-3">pts</span>
            </div>
            <div className="eyebrow mt-1 tabular">
              {outlook ? `${formatPoints(outlook.p10)} – ${formatPoints(outlook.p90)}` : "—"}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Projected points · floor–ceiling (p10–p90, {BOARD_SAMPLES.toLocaleString("en-GB")} seasons)
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function Side({ actor, value, label }: { actor: Actor; value: number; label: string }) {
  const colour = actor === "agent" ? "text-agent" : "text-human";
  return (
    <div className={`flex flex-col justify-center px-3.5 py-2 ${actor === "human" ? "items-start border-r border-line" : "items-end border-l border-line"}`}>
      <div className={`board text-[18px] leading-none sm:text-[20px] ${colour}`}>{formatPrice(value)}</div>
      <div className={`eyebrow mt-1 ${colour}`}>{label}</div>
    </div>
  );
}
