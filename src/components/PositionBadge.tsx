import { SLOT_COLOR } from "@/lib/pitch-layout";
import type { Position } from "@/lib/types";

export function PositionBadge({ position, muted = false }: { position: Position; muted?: boolean }) {
  const colour = SLOT_COLOR[position];
  return (
    <span
      className="display inline-flex h-5 w-10 items-center justify-center rounded-[4px] text-[13px] leading-none"
      style={{
        color: muted ? "var(--color-fog-3)" : colour,
        background: muted ? "rgb(255 255 255 / 0.04)" : `${colour}1f`,
      }}
    >
      {position}
    </span>
  );
}
