"use client";

import { Bot, ChevronRight, Flag, Lock, PanelRightClose, PanelRightOpen, Sparkles, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { briefLines, composeBrief, type BriefLine } from "@/lib/assignments";
import { EXAMPLE_PROMPTS, SITE } from "@/lib/site";
import { useDraftStore, type ToolCall } from "@/lib/store";
import { DUTY_LABEL, type Duty } from "@/lib/types";
import { TOOL_DEFINITIONS, type ToolDefinition, type ToolGroup } from "@/webmcp/definitions";
import { ActivityFeed } from "./ActivityFeed";
import { CopyButton } from "./CopyButton";
import { WebMcpStatus } from "./WebMcpStatus";

const GROUP_LABEL: Readonly<Record<ToolGroup, string>> = {
  squad: "Squad",
  formation: "Formation",
  brief: "Brief",
  scenarios: "Scenarios",
  model: "Model",
};

const GROUP_ORDER: readonly ToolGroup[] = ["scenarios", "model", "formation", "brief", "squad"];

/**
 * The right rail. This is where WebMCP stops being a footnote: every tool the page registers, which ones
 * only an agent can reach, every call the agent has made, and the squad's activity log.
 */
export function AgentConsole({
  collapsed = false,
  onCollapsedChange,
}: {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  const calls = useDraftStore((s) => s.calls);
  const activity = useDraftStore((s) => s.activity);
  const briefCount = useDraftStore((s) => {
    const withDuties = Object.keys(s.assignments.briefs).length;
    const armbands = [s.assignments.captainId, s.assignments.viceId].filter((id) => id !== null && !(id in s.assignments.briefs)).length;
    return withDuties + armbands;
  });

  if (collapsed) {
    return (
      <section aria-label="Agent console" className="panel flex min-h-0 flex-1 flex-col items-center rounded-xl">
        <header className="flex h-12 shrink-0 items-center justify-center">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Expand agent console"
            title="Expand agent console"
            onClick={() => onCollapsedChange?.(false)}
            className="text-fog-3 hover:text-fog"
          >
            <PanelRightOpen aria-hidden />
          </Button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col items-center gap-3 border-t border-line py-3">
          <Bot className="size-4 text-agent" aria-hidden />
          <span className="board text-[12px] text-fog-2">{TOOL_DEFINITIONS.length}</span>
          <span className="eyebrow mt-1 rotate-180 [writing-mode:vertical-rl]">Agent</span>
          {calls.length > 0 && (
            <span className="mt-auto flex flex-col items-center gap-1 pb-1 text-[10.5px] text-agent" title={`${calls.length} calls`}>
              <span className="size-1.5 rounded-full bg-agent shadow-[0_0_8px_var(--agent)]" aria-hidden />
              <span className="tabular">{calls.length}</span>
            </span>
          )}
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="agent-heading" className="panel flex min-h-0 flex-1 flex-col rounded-xl">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 px-3">
        <h2 id="agent-heading" className="text-[15px] font-semibold text-fog">
          Agent
        </h2>
        <div className="flex items-center gap-1">
          <WebMcpStatus />
          {onCollapsedChange && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Collapse agent console"
              title="Collapse agent console"
              onClick={() => onCollapsedChange(true)}
              className="hidden text-fog-3 hover:text-fog lg:inline-flex"
            >
              <PanelRightClose aria-hidden />
            </Button>
          )}
        </div>
      </header>

      <Tabs defaultValue="tools" className="min-h-0 flex-1 gap-0">
        <TabsList variant="line" className="h-8 w-full justify-start gap-0 rounded-none border-b border-line px-2">
          <ConsoleTab value="tools" label="Tools" count={TOOL_DEFINITIONS.length} />
          <ConsoleTab value="calls" label="Calls" count={calls.length} live={calls.length > 0} />
          <ConsoleTab value="brief" label="Brief" count={briefCount} />
          <ConsoleTab value="activity" label="Activity" count={activity.length} />
        </TabsList>

        <TabsContent value="tools" className="min-h-0 flex-1">
          <ScrollArea className="scroll-fade h-full [&>[data-radix-scroll-area-viewport]>div]:!block">
            <ToolDirectory />
          </ScrollArea>
        </TabsContent>
        <TabsContent value="calls" className="min-h-0 flex-1">
          <ScrollArea className="scroll-fade h-full [&>[data-radix-scroll-area-viewport]>div]:!block">
            <CallLog calls={calls} />
          </ScrollArea>
        </TabsContent>
        <TabsContent value="brief" className="min-h-0 flex-1">
          <ScrollArea className="scroll-fade h-full [&>[data-radix-scroll-area-viewport]>div]:!block">
            <BriefView />
          </ScrollArea>
        </TabsContent>
        <TabsContent value="activity" className="min-h-0 flex-1">
          <ScrollArea className="scroll-fade h-full [&>[data-radix-scroll-area-viewport]>div]:!block">
            <ActivityFeed />
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <footer className="flex h-10 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-3 text-[11px] text-fog-3">
        <a href={SITE.webmcpSpecUrl} target="_blank" rel="noreferrer" className="hover:text-fog-2">
          WebMCP spec
        </a>
        <a href={SITE.repoUrl} target="_blank" rel="noreferrer" className="hover:text-fog-2">
          Source
        </a>
        <a href={SITE.licenseUrl} target="_blank" rel="noreferrer" className="hover:text-fog-2">
          MIT
        </a>
        <span className="ml-auto">Illustrative data</span>
      </footer>
    </section>
  );
}

function ConsoleTab({ value, label, count, live = false }: { value: string; label: string; count: number; live?: boolean }) {
  return (
    <TabsTrigger value={value} className="h-8 gap-1.5 rounded-none border-b-2 border-transparent px-2.5 text-[12px] data-[state=active]:border-fog data-[state=active]:bg-transparent data-[state=active]:shadow-none">
      {label}
      <span className={`tabular text-[11px] ${live ? "text-agent" : "text-fog-3"}`}>{count}</span>
    </TabsTrigger>
  );
}

function ToolDirectory() {
  const [open, setOpen] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<ToolGroup>>(() => new Set());
  const toggleGroup = (group: ToolGroup) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  return (
    <div className="px-1.5 pb-3 pt-1">
      {GROUP_ORDER.map((group) => {
        const tools = TOOL_DEFINITIONS.filter((tool) => tool.group === group);
        const shut = collapsed.has(group);
        return (
          <div key={group} className="mb-1">
            <button
              type="button"
              onClick={() => toggleGroup(group)}
              aria-expanded={!shut}
              className="group/label eyebrow flex h-8 w-full items-center gap-2 px-2 text-left transition-colors hover:text-fog-2"
            >
              {GROUP_LABEL[group]}
              <ChevronRight
                className={`ml-auto size-4 text-fog-3 opacity-0 transition-[transform,opacity] group-hover/label:opacity-100 group-focus-visible/label:opacity-100 ${shut ? "" : "rotate-90"}`}
                aria-hidden
              />
            </button>
            {!shut && (
              <ul className="flex flex-col">
                {tools.map((tool) => (
                  <ToolRow key={tool.name} tool={tool} open={open === tool.name} onToggle={() => setOpen(open === tool.name ? null : tool.name)} />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function toolKind(tool: ToolDefinition): string {
  if (tool.annotations.readOnlyHint) return "read";
  if (tool.annotations.destructiveHint) return "writes";
  return "adds";
}

function ToolRow({ tool, open, onToggle }: { tool: ToolDefinition; open: boolean; onToggle: () => void }) {
  return (
    <li className={`rounded-md transition-colors ${open ? "bg-white/[0.06]" : "hover:bg-white/[0.045]"}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex h-8 w-full items-center gap-2 px-2 text-left"
      >
        <ChevronRight className={`size-4 shrink-0 text-fog-3 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
        <code className={`min-w-0 truncate code text-[12.5px] ${open ? "font-semibold text-fog" : "text-fog"}`}>{tool.name}</code>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {tool.agentOnly && (
            <span className="size-1.5 rounded-full bg-agent shadow-[0_0_8px_var(--agent)]" title="Only reachable through an agent" aria-label="agent-only" />
          )}
          <span className="text-[11px] text-fog-3">{toolKind(tool)}</span>
        </span>
      </button>
      {open && (
        <div className="anim-rise-in px-2 pb-2.5 pl-8">
          <p className="text-[12.5px] leading-relaxed text-fog-2">{tool.description}</p>
          <div className="mt-2 flex items-start gap-1.5 rounded-md border border-line bg-night px-2.5 py-2">
            <Sparkles className="mt-[3px] size-4 shrink-0 text-agent" aria-hidden />
            <p className="min-w-0 flex-1 text-[12px] italic leading-snug text-fog">{`"${tool.example}"`}</p>
            <CopyButton text={tool.example} label="Copy prompt" className="-mr-1 -mt-0.5" />
          </div>
        </div>
      )}
    </li>
  );
}

function CallLog({ calls }: { calls: ToolCall[] }) {
  if (calls.length === 0) {
    return (
      <div className="px-4 py-6">
        <p className="text-[13px] text-fog-2">No calls yet.</p>
        <ul className="mt-3 flex flex-col gap-2">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <li key={prompt} className="flex items-start gap-1.5 rounded-md border border-line bg-night px-2.5 py-2">
              <Sparkles className="mt-[3px] size-4 shrink-0 text-agent" aria-hidden />
              <p className="min-w-0 flex-1 text-[12px] leading-snug text-fog">{prompt}</p>
              <CopyButton text={prompt} label="Copy prompt" className="-mr-1 -mt-0.5" />
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <ol className="flex flex-col px-2 pb-3 pt-2" aria-label="Tool calls, newest first">
      {calls.map((call, index) => (
        <li key={call.id} className={`rounded-md px-2 py-2 ${index === 0 ? "anim-rise-in bg-white/[0.045]" : "hover:bg-white/[0.03]"}`}>
          <div className="flex items-center gap-2">
            <span className={`size-1.5 shrink-0 rounded-full ${call.ok ? "bg-agent" : "bg-danger"}`} aria-label={call.ok ? "ok" : "failed"} />
            <code className="truncate code text-[12px] text-fog">{call.tool}</code>
            <span className="ml-auto shrink-0 text-[10.5px] tabular text-fog-3">{call.durationMs} ms</span>
          </div>
          <p className={`mt-1 line-clamp-3 break-words pl-3.5 text-[12px] leading-snug ${call.ok ? "text-fog-2" : "text-danger"}`}>{call.summary}</p>
          {call.input !== "{}" && (
            <code className="code mt-1 block truncate pl-3.5 text-[10.5px] text-fog-3" title={call.input}>
              {call.input}
            </code>
          )}
        </li>
      ))}
    </ol>
  );
}

const DUTY_ICON: Readonly<Record<Duty, typeof Lock>> = { penalties: Target, set_pieces: Flag, protected: Lock };

/** The manager's brief as the agent sees it through get_brief, with the same text ready to paste. */
function BriefView() {
  const slots = useDraftStore((s) => s.slots);
  const players = useDraftStore((s) => s.players);
  const budgetTotal = useDraftStore((s) => s.budgetTotal);
  const formation = useDraftStore((s) => s.formation);
  const assignments = useDraftStore((s) => s.assignments);
  const select = useDraftStore((s) => s.select);
  const state = useMemo(() => ({ budgetTotal, formation, slots, players, assignments }), [budgetTotal, formation, slots, players, assignments]);
  const lines = useMemo(() => briefLines(state), [state]);
  const text = useMemo(() => composeBrief(state), [state]);
  const anyDrafted = slots.some((slot) => slot.playerId !== null);

  if (lines.length === 0) {
    return (
      <div className="px-4 py-6">
        <p className="text-[13px] text-fog-2">{anyDrafted ? "Click a card on the pitch to brief the agent." : "Draft a player, then click their card."}</p>
      </div>
    );
  }

  return (
    <div className="px-2 pb-3 pt-2">
      <ul className="flex flex-col gap-px">
        {lines.map((line) => (
          <BriefRow key={line.playerId} line={line} onOpen={() => select(line.slotId)} />
        ))}
      </ul>
      <div className="mt-3 rounded-md border border-line bg-night px-2.5 py-2">
        <div className="eyebrow flex items-center justify-between">
          <code className="code normal-case tracking-normal">get_brief</code>
          <CopyButton text={text} label="Copy brief" className="-my-1" />
        </div>
        <pre className="code mt-1.5 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-fog-2">{text}</pre>
      </div>
    </div>
  );
}

function BriefRow({ line, onOpen }: { line: BriefLine; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-white/[0.045]"
      >
        <span
          className={`mt-px inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${
            line.armband === "captain" ? "bg-gold text-night" : line.armband === "vice" ? "bg-night-3 text-fog ring-1 ring-line-2" : "text-fog-3"
          }`}
          aria-label={line.armband === "captain" ? "Captain" : line.armband === "vice" ? "Vice-captain" : undefined}
        >
          {line.armband === "captain" ? "C" : line.armband === "vice" ? "V" : "·"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[13px] text-fog">{line.name}</span>
            <span className="eyebrow shrink-0">{line.slotId}</span>
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              {line.duties.map((duty) => {
                const Icon = DUTY_ICON[duty];
                return <Icon key={duty} className={`size-4 ${duty === "protected" ? "text-agent" : "text-fog-2"}`} aria-label={DUTY_LABEL[duty]} />;
              })}
            </span>
          </span>
          {line.note && <span className="mt-0.5 block text-[12px] leading-snug text-fog-2">{`"${line.note}"`}</span>}
        </span>
      </button>
    </li>
  );
}
