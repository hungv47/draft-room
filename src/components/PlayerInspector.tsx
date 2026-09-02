"use client";

import { Flag, Lock, Target, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { armbandFor, briefFor } from "@/lib/assignments";
import { teamName } from "@/lib/data";
import { playerInSlot } from "@/lib/engine";
import { formatPrice, slotLabel } from "@/lib/format";
import { playerOutlook } from "@/lib/model";
import { useDraftStore } from "@/lib/store";
import { DUTIES, DUTY_LABEL, type Armband, type Duty } from "@/lib/types";

/*
 * Opens when a card on the pitch is clicked. The manager's side of the brief: armband, duties, and a note.
 * Everything written here lands in the same store the agent reads through get_brief and writes through
 * set_assignment, so neither side needs to know which one made the last change; the activity feed says.
 */

const DUTY_ICON: Readonly<Record<Duty, typeof Lock>> = { penalties: Target, set_pieces: Flag, protected: Lock };
const NOTE_MAX = 280;

export function PlayerInspector() {
  const selectedSlotId = useDraftStore((s) => s.selectedSlotId);
  const slots = useDraftStore((s) => s.slots);
  const players = useDraftStore((s) => s.players);
  const budgetTotal = useDraftStore((s) => s.budgetTotal);
  const formation = useDraftStore((s) => s.formation);
  const assignments = useDraftStore((s) => s.assignments);
  const assign = useDraftStore((s) => s.assign);
  const remove = useDraftStore((s) => s.remove);
  const select = useDraftStore((s) => s.select);
  const panelRef = useRef<HTMLElement>(null);

  const state = useMemo(() => ({ budgetTotal, formation, slots, players, assignments }), [budgetTotal, formation, slots, players, assignments]);
  const slot = slots.find((s) => s.id === selectedSlotId) ?? null;
  const player = slot ? playerInSlot(state, slot) ?? null : null;

  useEffect(() => {
    if (!player) return;
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player, select]);

  if (!slot || !player) return null;

  const armband = armbandFor(state, player.id);
  const brief = briefFor(state, player.id);
  const outlook = playerOutlook(player);

  const setArmband = (value: string) => {
    const next: Armband = value === "captain" || value === "vice" ? value : "none";
    assign({ playerId: player.id, armband: next }, "human");
  };
  const toggleDuty = (duty: Duty, on: boolean) => {
    const duties = on ? [...brief.duties, duty] : brief.duties.filter((d) => d !== duty);
    assign({ playerId: player.id, duties }, "human");
  };

  return (
    <aside
      ref={panelRef}
      key={player.id}
      tabIndex={-1}
      aria-label={`${player.name}: assignments`}
      className="glass anim-rise-in pointer-events-auto flex max-h-full w-[min(100%,340px)] flex-col overflow-y-auto rounded-xl outline-none"
      style={{ background: "rgb(8 9 14 / 0.96)" }}
    >
      <header className="flex items-start gap-3 px-3.5 pb-2.5 pt-3">
        <div className="min-w-0 flex-1">
          <h3 className="display truncate text-[22px] leading-none text-fog">{player.name}</h3>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-fog-2">
            <span className="font-semibold text-fog">{slotLabel(slot.id)}</span>
            <span className="truncate">{teamName(player.team)}</span>
            {slot.filledBy && (
              <span className={`eyebrow ${slot.filledBy === "agent" ? "text-agent" : "text-human-2"}`}>{slot.filledBy === "agent" ? "Agent" : "You"}</span>
            )}
          </p>
          <p className="mt-1 text-[11.5px] tabular text-fog-2">
            {formatPrice(player.price)} · {player.projectedPoints} pts · {outlook.p10}–{outlook.p90} · {Math.round(outlook.startProbability * 100)}% starts
          </p>
        </div>
        <Button variant="ghost" size="icon-xs" aria-label="Close" onClick={() => select(null)} className="-mr-1 -mt-1 text-fog-3 hover:text-fog">
          <X />
        </Button>
      </header>

      <div className="flex flex-col gap-3 border-t border-line px-3.5 py-3">
        <div>
          <div className="eyebrow mb-1.5">Armband</div>
          <ToggleGroup type="single" variant="outline" size="sm" value={armband} onValueChange={setArmband} aria-label="Armband" className="w-full">
            <ArmbandItem value="none" label="None" />
            <ArmbandItem value="vice" label="Vice" />
            <ArmbandItem value="captain" label="Captain" />
          </ToggleGroup>
        </div>

        <div>
          <div className="eyebrow mb-1">Duties</div>
          <ul className="flex flex-col">
            {DUTIES.map((duty) => {
              const Icon = DUTY_ICON[duty];
              const on = brief.duties.includes(duty);
              const id = `duty-${duty}`;
              return (
                <li key={duty} className="flex items-center gap-2.5 py-1">
                  <Icon className={`size-3.5 shrink-0 ${on ? (duty === "protected" ? "text-agent" : "text-fog") : "text-fog-3"}`} aria-hidden />
                  <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-[13px] text-fog">
                    {DUTY_LABEL[duty]}
                  </label>
                  <Switch
                    id={id}
                    checked={on}
                    onCheckedChange={(checked) => toggleDuty(duty, checked)}
                    title={duty === "protected" ? "Agent cannot move this player without force" : undefined}
                    className="data-[state=checked]:bg-agent"
                  />
                </li>
              );
            })}
          </ul>
        </div>

        <NoteField key={`${player.id}:${brief.note}`} playerId={player.id} initial={brief.note} onSave={(note) => assign({ playerId: player.id, note }, "human")} />
      </div>

      <footer className="flex items-center justify-end border-t border-line px-3.5 py-2">
        <Button variant="ghost" size="xs" className="text-fog-3 hover:text-danger" onClick={() => remove({ slotId: slot.id }, "human")}>
          <Trash2 />
          Remove
        </Button>
      </footer>
    </aside>
  );
}

function ArmbandItem({ value, label }: { value: Armband; label: string }) {
  return (
    <ToggleGroupItem value={value} className="flex-1 text-[12.5px] data-[state=on]:bg-fog data-[state=on]:text-night">
      {value === "captain" && <span className="display text-[13px] leading-none">C</span>}
      {value === "vice" && <span className="display text-[13px] leading-none">V</span>}
      {label}
    </ToggleGroupItem>
  );
}

/** Saves on blur or Enter (Shift+Enter for a newline), so a half-typed note never spams the activity feed. */
function NoteField({ playerId, initial, onSave }: { playerId: string; initial: string; onSave: (note: string) => void }) {
  const [draft, setDraft] = useState(initial);
  const dirty = draft.trim() !== initial;
  const commit = () => {
    if (dirty) onSave(draft);
  };
  return (
    <div>
      <div className="eyebrow mb-1.5 flex items-center justify-between">
        <label htmlFor={`note-${playerId}`}>Note</label>
        {draft.length > NOTE_MAX - 40 && (
          <span className={`tabular ${draft.length >= NOTE_MAX ? "text-human-2" : "text-fog-3"}`}>
            {draft.length}/{NOTE_MAX}
          </span>
        )}
      </div>
      <Textarea
        id={`note-${playerId}`}
        value={draft}
        maxLength={NOTE_MAX}
        rows={2}
        placeholder="Note"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            commit();
          }
        }}
        className="min-h-[52px] resize-none border-line bg-night/70 text-[13px] leading-snug placeholder:text-fog-3"
      />
    </div>
  );
}
