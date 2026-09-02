"use client";

import { Flag, Lock, Target, X } from "lucide-react";
import { teamName } from "@/lib/data";
import { formatPrice } from "@/lib/format";
import { clubAccent, kitFor } from "@/lib/kits";
import { TIER_CLASS, TIER_LABEL, tierFor } from "@/lib/tiers";
import { DUTY_LABEL, type Actor, type Armband, type Duty, type Player, type PlayerBrief } from "@/lib/types";
import { Kit } from "./Kit";

interface NameParts {
  given: string;
  family: string;
}

export function splitName(name: string): NameParts {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { given: "", family: parts[0] };
  return { given: parts.slice(0, -1).join(" "), family: parts[parts.length - 1] };
}

/** Club colour reaches the card through a custom property the foil CSS reads. */
function clubStyle(club: string): React.CSSProperties {
  // SAFETY: CSSProperties has no index signature for custom properties; the only key added is `--club`.
  return { "--club": club } as React.CSSProperties;
}

export const ACTOR_LABEL: Readonly<Record<Actor, string>> = { human: "You", agent: "Agent" };

const DUTY_ICON: Readonly<Record<Duty, typeof Lock>> = { penalties: Target, set_pieces: Flag, protected: Lock };

interface PlayerCardProps {
  player: Player;
  actor: Actor | null;
  onRemove?: () => void;
  /** Opens the inspector. When set, the card is a button. */
  onSelect?: () => void;
  selected?: boolean;
  armband?: Armband;
  brief?: PlayerBrief;
  /** Lit cards run their sheen once (used when a card lands). */
  lit?: boolean;
  className?: string;
}

/**
 * The full player card: club-colour ground, procedural kit, shirt lettering, foil tier edge, actor tag.
 * 150×204 at scale 1; the pitch scales it with distance.
 */
export function PlayerCard({
  player,
  actor,
  onRemove,
  onSelect,
  selected = false,
  armband = "none",
  brief,
  lit = false,
  className = "",
}: PlayerCardProps) {
  const tier = tierFor(player.price);
  const kit = kitFor(player.team, player.position);
  const { given, family } = splitName(player.name);
  const club = clubAccent(player.team);
  const duties = brief?.duties ?? [];
  const hasNote = (brief?.note ?? "").length > 0;
  const armbandText = armband === "captain" ? ", captain" : armband === "vice" ? ", vice-captain" : "";
  const dutyText = duties.length > 0 ? `, ${duties.map((d) => DUTY_LABEL[d].toLowerCase()).join(", ")}` : "";

  return (
    <article
      className={`card-face group relative h-[204px] w-[150px] select-none text-fog ${TIER_CLASS[tier]} ${className} ${
        onSelect ? "cursor-pointer" : ""
      }`}
      style={clubStyle(club)}
      data-lit={lit || undefined}
      data-selected={selected || undefined}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-pressed={onSelect ? selected : undefined}
      onClick={onSelect}
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
      aria-label={`${player.name}, ${player.position}, ${teamName(player.team)}, ${formatPrice(player.price)}, ${player.projectedPoints} projected points${actor ? `, picked by ${actor === "agent" ? "the agent" : "you"}` : ""}${armbandText}${dutyText}${onSelect ? ". Open to assign duties." : ""}`}
    >
      <div
        className="pointer-events-none absolute left-1/2 top-[38%] z-0 h-[120px] w-[120px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 blur-2xl"
        style={{ background: `radial-gradient(closest-side, ${club}, transparent)` }}
        aria-hidden
      />

      <header className="relative z-[2] flex items-start justify-between px-3 pt-2.5">
        <span className="flex items-center gap-1.5">
          <span className="display text-[15px] leading-none text-fog-2">{player.position}</span>
          {duties.map((duty) => {
            const Icon = DUTY_ICON[duty];
            return <Icon key={duty} className={`size-3 ${duty === "protected" ? "text-agent" : "text-fog-2"}`} aria-hidden />;
          })}
          {hasNote && <span className="size-1.5 rounded-full bg-fog-2" title="Has a note" aria-hidden />}
        </span>
        <span className="display text-[22px] leading-none tabular">{formatPrice(player.price)}</span>
      </header>

      {armband !== "none" && (
        <span
          className={`absolute -left-2 -top-2 z-[4] inline-flex h-7 w-7 items-center justify-center rounded-full border text-[12px] font-black leading-none shadow-[0_6px_14px_-4px_rgb(0_0_0/0.8)] ${
            armband === "captain" ? "border-gold/60 bg-gold text-night" : "border-line-2 bg-night-3 text-fog"
          }`}
          title={armband === "captain" ? "Captain: points count double" : "Vice-captain"}
          aria-hidden
        >
          {armband === "captain" ? "C" : "V"}
        </span>
      )}

      <div className="relative z-[2] mt-1 flex justify-center">
        <Kit kit={kit} size={86} title={`${teamName(player.team)} ${player.position === "GK" ? "goalkeeper" : "home"} kit`} />
      </div>

      <div className="relative z-[2] px-3 pt-1.5 leading-none">
        {given && <div className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-fog-2">{given}</div>}
        <div className="display mt-0.5 truncate text-[24px] leading-[0.95]">{family}</div>
      </div>

      <footer className="relative z-[2] mt-auto flex items-end justify-between px-3 pb-2.5 pt-2">
        <div className="leading-none">
          <div className="text-[11px] font-semibold text-fog-2" title={teamName(player.team)}>
            {player.team}
          </div>
          <div className="display mt-1 text-[18px] leading-none tabular">
            {player.projectedPoints}
            <span className="ml-1 text-[11px] text-fog-2">pts</span>
          </div>
        </div>
        {actor && (
          <span
            className={`rounded-[5px] px-1.5 py-[3px] text-[10px] font-bold uppercase leading-none tracking-[0.1em] ${
              actor === "agent" ? "bg-agent text-night" : "bg-human text-white"
            }`}
          >
            {ACTOR_LABEL[actor]}
          </span>
        )}
      </footer>

      {tier !== "standard" && (
        <span className="sr-only">{TIER_LABEL[tier]} tier</span>
      )}

      {onRemove && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          aria-label={`Remove ${player.name}`}
          title="Remove from squad"
          className="absolute -right-2 -top-2 z-[4] inline-flex h-7 w-7 items-center justify-center rounded-full border border-line-2 bg-night-3 text-fog-2 opacity-0 shadow-[0_6px_14px_-4px_rgb(0_0_0/0.8)] transition-[opacity,background-color,color] duration-150 hover:bg-danger hover:text-white focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </article>
  );
}
