"use client";

import { PanelLeftClose, PanelLeftOpen, Plus, Search, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { teamName } from "@/lib/data";
import { byPointsDesc, firstEligibleEmptySlot, remaining, slotOf, valuePerMillion } from "@/lib/engine";
import { formatPrice, slotLabel } from "@/lib/format";
import { kitFor } from "@/lib/kits";
import { playerOutlook } from "@/lib/model";
import { SLOT_COLOR } from "@/lib/pitch-layout";
import { useDraftStore } from "@/lib/store";
import { tierFor } from "@/lib/tiers";
import type { Player, Position } from "@/lib/types";
import { POSITIONS } from "@/lib/types";
import { ActorTag } from "./ActorTag";
import { useBeginDrag } from "./DragController";
import { KitMini } from "./Kit";
import { splitName } from "./PlayerCard";

type SortKey = "points" | "price" | "value";
type PositionFilter = Position | "ALL";

const SORTS: ReadonlyArray<{ key: SortKey; label: string }> = [
  { key: "points", label: "Points" },
  { key: "price", label: "Price" },
  { key: "value", label: "Value" },
];

function isPositionFilter(value: string): value is PositionFilter {
  return value === "ALL" || POSITIONS.some((position) => position === value);
}

function isSortKey(value: string): value is SortKey {
  return SORTS.some((option) => option.key === value);
}

/** Position colour reaches the toggle through a custom property. */
function positionStyle(colour: string): React.CSSProperties {
  // SAFETY: CSSProperties has no index signature for custom properties; the only key added is `--pos`.
  return { "--pos": colour } as React.CSSProperties;
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function PlayerPool({
  collapsed = false,
  onCollapsedChange,
}: {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  const budgetTotal = useDraftStore((s) => s.budgetTotal);
  const formation = useDraftStore((s) => s.formation);
  const assignments = useDraftStore((s) => s.assignments);
  const slots = useDraftStore((s) => s.slots);
  const players = useDraftStore((s) => s.players);
  const draft = useDraftStore((s) => s.draft);

  const [position, setPosition] = useState<PositionFilter>("ALL");
  const [search, setSearch] = useState("");
  const [fitsBudget, setFitsBudget] = useState(false);
  const [sort, setSort] = useState<SortKey>("points");

  const state = useMemo(() => ({ budgetTotal, formation, slots, players, assignments }), [budgetTotal, formation, slots, players, assignments]);
  const budgetLeft = remaining(state);

  const rows = useMemo(() => {
    const needle = normalize(search.trim());
    const list = players.filter((p) => {
      if (position !== "ALL" && p.position !== position) return false;
      if (fitsBudget && !p.drafted && p.price > budgetLeft) return false;
      if (needle && !normalize(p.name).includes(needle) && !normalize(p.team).includes(needle) && !normalize(teamName(p.team)).includes(needle)) {
        return false;
      }
      return true;
    });
    const sorter =
      sort === "price"
        ? (a: Player, b: Player) => b.price - a.price || byPointsDesc(a, b)
        : sort === "value"
          ? (a: Player, b: Player) => valuePerMillion(b) - valuePerMillion(a) || byPointsDesc(a, b)
          : byPointsDesc;
    return [...list].sort(sorter);
  }, [players, position, fitsBudget, search, sort, budgetLeft]);

  const availableCount = useMemo(() => rows.filter((p) => !p.drafted).length, [rows]);

  if (collapsed) {
    return (
      <section aria-label="Players" className="panel flex min-h-0 flex-1 flex-col items-center rounded-xl">
        <header className="flex h-12 shrink-0 items-center justify-center">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Expand player pool"
            title="Expand player pool"
            onClick={() => onCollapsedChange?.(false)}
            className="text-fog-3 hover:text-fog"
          >
            <PanelLeftOpen aria-hidden />
          </Button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col items-center gap-3 border-t border-line py-3">
          <Users className="size-4 text-fog-3" aria-hidden />
          <span className="board text-[12px] text-fog-2">{availableCount}</span>
          <span className="eyebrow mt-1 rotate-180 [writing-mode:vertical-rl]">Players</span>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="pool-heading" className="panel flex min-h-0 flex-1 flex-col rounded-xl">
      <div className="px-3 pb-2 pt-0">
        <div className="flex h-12 items-center gap-3">
          <h2 id="pool-heading" className="text-[15px] font-semibold text-fog">
            Players
          </h2>
          <p className="ml-auto text-[12px] text-fog-3">
            <span className="tabular text-fog-2">{availableCount}</span> available
          </p>
          {onCollapsedChange && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Collapse player pool"
              title="Collapse player pool"
              onClick={() => onCollapsedChange(true)}
              className="hidden text-fog-3 hover:text-fog lg:inline-flex"
            >
              <PanelLeftClose aria-hidden />
            </Button>
          )}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fog-3" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or club"
            aria-label="Search players by name or club"
            maxLength={64}
            className="h-8 border-line-2 bg-night pl-8 pr-8 text-[13px] focus-visible:border-agent/60 focus-visible:ring-agent/20"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-fog-3 hover:bg-white/10 hover:text-fog">
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>

        <ToggleGroup
          type="single"
          value={position}
          onValueChange={(value) => isPositionFilter(value) && setPosition(value)}
          aria-label="Filter by position"
          className="mt-2 h-7 w-full rounded-md bg-night p-0.5"
        >
          {(["ALL", ...POSITIONS] as const).map((value) => {
            const colour = value === "ALL" ? "var(--fog)" : SLOT_COLOR[value];
            return (
              <ToggleGroupItem
                key={value}
                value={value}
                className="h-6 min-w-0 flex-1 rounded-[5px] px-1.5 text-[12px] font-semibold text-fog-3 data-[state=on]:bg-white/[0.08] data-[state=on]:text-[var(--pos)]"
                style={positionStyle(colour)}
              >
                {value === "ALL" ? "All" : value}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>

        <div className="mt-1.5 flex items-center gap-1">
          <ToggleGroup
            type="single"
            value={sort}
            onValueChange={(value) => isSortKey(value) && setSort(value)}
            aria-label="Sort by"
            className="h-7 min-w-0 flex-1 rounded-md bg-night p-0.5"
          >
            {SORTS.map((option) => (
              <ToggleGroupItem key={option.key} value={option.key} className="h-6 min-w-0 flex-1 rounded-[5px] px-1.5 text-[12px] text-fog-3 data-[state=on]:bg-white/[0.08] data-[state=on]:text-fog">
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-pressed={fitsBudget}
            onClick={() => setFitsBudget((v) => !v)}
            className={`h-7 shrink-0 px-2 text-[12px] ${fitsBudget ? "text-agent" : "text-fog-3"}`}
          >
            Fits budget
          </Button>
        </div>
      </div>

      <div className="scroll-fade min-h-0 flex-1 overflow-y-auto border-t border-line px-1.5 pb-2 pt-1" role="list" aria-label="Player pool">
        {rows.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-3 py-10 text-center text-[13px] text-fog-2">
            <span>No matches.</span>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => {
                setSearch("");
                setPosition("ALL");
                setFitsBudget(false);
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
        {rows.map((player) => {
          const inSlot = player.drafted ? slotOf(state, player.id) : undefined;
          const overBudget = !player.drafted && player.price > budgetLeft;
          const noSlot = !player.drafted && !firstEligibleEmptySlot(state, player.position);
          const blocker = player.drafted ? null : overBudget ? `Over by ${formatPrice(player.price - budgetLeft)}` : noSlot ? `No ${player.position} slot` : null;
          return (
            <PoolRow
              key={player.id}
              player={player}
              slotId={inSlot?.id}
              actor={inSlot?.filledBy ?? null}
              blocker={blocker}
              onDraft={() => draft({ playerId: player.id }, "human")}
            />
          );
        })}
      </div>
    </section>
  );
}

function PoolRow({
  player,
  slotId,
  actor,
  blocker,
  onDraft,
}: {
  player: Player;
  slotId?: string;
  actor: "agent" | "human" | null;
  blocker: string | null;
  onDraft: () => void;
}) {
  const kit = kitFor(player.team, player.position);
  const tier = tierFor(player.price);
  const outlook = playerOutlook(player);
  const { given, family } = splitName(player.name);
  const disabled = player.drafted || blocker !== null;
  const positionColour = SLOT_COLOR[player.position];
  const beginDrag = useBeginDrag();

  return (
    <div
      role="listitem"
      className={`group relative flex h-14 items-center gap-2.5 rounded-md px-2 transition-colors ${
        disabled ? "" : "cursor-grab hover:bg-white/[0.045]"
      } ${player.drafted ? "opacity-55" : ""}`}
      onClick={() => !disabled && onDraft()}
      onPointerDown={(event) => {
        if (disabled) return;
        beginDrag(player, null, event);
      }}
      data-disabled={disabled || undefined}
      data-player-id={player.id}
    >
      <div className="relative flex size-10 shrink-0 items-center justify-center rounded-md" style={{ background: `linear-gradient(160deg, ${kit.primary}2b, transparent)` }}>
        <KitMini kit={kit} size={30} />
        {tier !== "standard" && (
          <span
            className={`absolute -right-0.5 -top-0.5 size-2 rounded-full ring-2 ring-night-2 ${tier === "gold" ? "bg-gold" : "bg-silver"}`}
            title={tier === "gold" ? "Marquee tier" : "Premium tier"}
            aria-hidden
          />
        )}
      </div>

      <div className="min-w-0 flex-1 leading-none">
        <div className="flex min-w-0 items-baseline gap-1.5">
          {given && <span className="truncate text-[11px] text-fog-3">{given}</span>}
          <span className={`display truncate text-[17px] ${player.drafted ? "text-fog-2" : "text-fog"}`}>{family}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-fog-3">
          <span className="font-semibold" style={{ color: player.drafted ? undefined : positionColour }}>
            {player.position}
          </span>
          <span title={teamName(player.team)}>{player.team}</span>
          {slotId && <span>· {slotLabel(slotId)}</span>}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="hidden cursor-help tabular xl:inline">
                · {outlook.p10}–{outlook.p90}
              </span>
            </TooltipTrigger>
            <TooltipContent side="right">
              Floor–ceiling (p10–p90) · {Math.round(outlook.startProbability * 100)}% starts
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="shrink-0 text-right leading-none">
        <div className="text-[14px] font-semibold tabular text-fog">{formatPrice(player.price)}</div>
        <div className="mt-1.5 text-[11px] tabular text-fog-3">
          <span className="text-fog-2">{player.projectedPoints}</span> pts
        </div>
      </div>

      <div className="flex w-[52px] shrink-0 justify-end">
        {actor ? (
          <ActorTag actor={actor} />
        ) : blocker ? (
          <span className="max-w-[3.25rem] text-right text-[10.5px] leading-tight break-words text-fog-3">{blocker}</span>
        ) : (
          <Button
            type="button"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              onDraft();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={`Draft ${player.name}`}
            className="rounded-full bg-human text-white opacity-0 hover:bg-human-2 hover:text-night focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:size-8 pointer-coarse:opacity-100 [&_svg]:size-4"
          >
            <Plus aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}
