"use client";

import { Bot, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { describeLineup } from "@/lib/engine";
import { SITE } from "@/lib/site";
import { useDraftStore } from "@/lib/store";
import { AgentConsole } from "./AgentConsole";

export function Header() {
  const slots = useDraftStore((s) => s.slots);
  const formation = useDraftStore((s) => s.formation);
  const reset = useDraftStore((s) => s.reset);
  const autoFill = useDraftStore((s) => s.autoFill);
  const calls = useDraftStore((s) => s.calls.length);
  const anyFilled = slots.some((s) => s.playerId);
  const anyOpen = slots.some((s) => !s.playerId);

  return (
    <header className="flex h-[52px] items-center gap-3 px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="relative inline-flex size-6 items-center justify-center rounded-md bg-pitch" aria-hidden>
          <span className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-white/80" />
          <span className="size-2 rounded-full border border-white/80" />
        </span>
        <h1 className="display whitespace-nowrap text-[20px] text-fog">{SITE.name}</h1>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="ml-1 hidden h-7 items-center gap-1.5 rounded-full border border-line-2 px-2.5 text-[11.5px] sm:inline-flex"
            aria-label={`Formation ${formation}`}
          >
            <span className="size-1.5 rounded-full bg-agent" aria-hidden />
            <span className="tabular font-semibold text-fog">{formation}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {describeLineup(formation)} · <code className="code">set_formation</code>
        </TooltipContent>
      </Tooltip>

      <div className="ml-auto flex items-center gap-1">
        <Button type="button" variant="ghost" size="xs" aria-label="Fill open slots" onClick={() => autoFill({ strategy: "value", objective: "mean" }, "human")} disabled={!anyOpen} className="text-[12px] [&_svg]:size-4">
          <Sparkles className="text-fog-3" aria-hidden />
          <span className="hidden sm:inline">Fill</span>
        </Button>
        <Button type="button" variant="ghost" size="xs" aria-label="Reset squad" onClick={() => reset("human")} disabled={!anyFilled} className="text-[12px] [&_svg]:size-4">
          <RotateCcw className="text-fog-3" aria-hidden />
          <span className="hidden sm:inline">Reset</span>
        </Button>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="lg:hidden">
              <Bot aria-hidden />
              Agent
              {calls > 0 && <span className="tabular text-agent">{calls}</span>}
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[92vw] max-w-[420px] gap-0 border-line bg-night p-0">
            <SheetTitle className="sr-only">Agent console</SheetTitle>
            <div className="flex h-full flex-col p-2">
              <AgentConsole />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
