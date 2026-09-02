"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SITE } from "@/lib/site";
import { useDraftStore } from "@/lib/store";
import { TOOL_DEFINITIONS } from "@/webmcp/definitions";

/** One dot and a few words: is there an agent that can see the tools? */
export function WebMcpStatus() {
  const webmcp = useDraftStore((s) => s.webmcp);
  const live = webmcp.state === "registered";
  const pending = webmcp.state === "pending";

  const label = live ? `${webmcp.toolCount} tools live` : pending ? "Connecting" : `${TOOL_DEFINITIONS.length} tools · no agent`;

  const chip = (
    <div
      role="status"
      tabIndex={live || pending ? undefined : 0}
      className={`inline-flex h-7 shrink-0 items-center gap-2 rounded-full border px-2.5 text-[11.5px] font-medium ${
        live ? "border-agent/40 text-agent" : "border-line-2 text-fog-2"
      }`}
    >
      <span className={`size-1.5 rounded-full ${live ? "anim-pulse-dot bg-agent" : pending ? "bg-fog-3" : "bg-line-3"}`} aria-hidden />
      <span className="whitespace-nowrap">{label}</span>
    </div>
  );

  if (live || pending) return chip;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[260px]">
        Chrome 152+ with <code className="code">{SITE.chromeFlag}</code>
      </TooltipContent>
    </Tooltip>
  );
}
