import type { Actor } from "@/lib/types";

export function actorColorClass(actor: Actor): string {
  return actor === "agent" ? "text-agent" : "text-human";
}

export function actorBgClass(actor: Actor): string {
  return actor === "agent" ? "bg-agent" : "bg-human";
}

export function ActorTag({ actor, className = "" }: { actor: Actor; className?: string }) {
  return (
    <span
      className={`inline-flex h-[18px] shrink-0 items-center rounded-[4px] px-1.5 text-[10px] font-bold uppercase leading-none tracking-[0.1em] ${
        actor === "agent" ? "bg-agent text-night" : "bg-human text-night"
      } ${className}`}
    >
      {actor === "agent" ? "Agent" : "You"}
    </span>
  );
}
