"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, Color, type Mesh, type MeshBasicMaterial } from "three";
import { ACTOR_COLOR, SLOT_COLOR, placementFor } from "@/lib/pitch-layout";
import { useDraftStore } from "@/lib/store";
import { useReducedMotion } from "@/lib/motion";
import type { FormationId, RosterSlot } from "@/lib/types";
import { createGlowTexture } from "./textures";

const BURST_MS = 950;

interface MarkerParts {
  ring: MeshBasicMaterial | null;
  glow: MeshBasicMaterial | null;
  burst: MeshBasicMaterial | null;
  burstMesh: Mesh | null;
}

type Registrar = <K extends keyof MarkerParts>(part: K, value: MarkerParts[K]) => void;

/**
 * A ring on the grass for every slot. Empty rings breathe in the slot-type colour; filled rings hold the
 * actor's colour with a soft pool of light under the card. When a card lands, a second ring bursts outward.
 */
export function SlotMarkers() {
  const slots = useDraftStore((s) => s.slots);
  const formation = useDraftStore((s) => s.formation);
  const lastFill = useDraftStore((s) => s.lastFill);
  const reduced = useReducedMotion();
  const glowTexture = useMemo(() => createGlowTexture(), []);
  const parts = useRef<Map<string, MarkerParts>>(new Map());
  const bursts = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!lastFill) return;
    const start = performance.now();
    lastFill.slotIds.forEach((id, index) => {
      bursts.current.set(id, start + index * 90);
    });
  }, [lastFill]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const now = performance.now();
    for (const slot of slots) {
      const marker = parts.current.get(slot.id);
      if (!marker) continue;
      const filled = Boolean(slot.playerId);
      if (marker.ring) {
        if (filled) {
          marker.ring.opacity = 0.95;
        } else {
          const phase = Math.sin(t * 1.6 + placementFor(formation, slot.id).x * 0.7);
          marker.ring.opacity = reduced ? 0.55 : 0.4 + phase * 0.22;
        }
      }
      if (marker.glow) marker.glow.opacity = filled ? 0.5 : 0;
      if (marker.burst && marker.burstMesh) {
        const started = bursts.current.get(slot.id);
        if (started !== undefined && !reduced) {
          const progress = (now - started) / BURST_MS;
          if (progress < 0) {
            marker.burst.opacity = 0;
          } else if (progress < 1) {
            const eased = 1 - Math.pow(1 - progress, 3);
            const scale = 0.5 + eased * 2.3;
            marker.burstMesh.scale.set(scale, scale, 1);
            marker.burst.opacity = (1 - eased) * 0.9;
          } else {
            marker.burst.opacity = 0;
            bursts.current.delete(slot.id);
          }
        } else {
          marker.burst.opacity = 0;
        }
      }
    }
  });

  return (
    <group>
      {slots.map((slot) => (
        <Marker
          key={slot.id}
          slot={slot}
          formation={formation}
          glowTexture={glowTexture}
          register={(part, value) => {
            const current = parts.current.get(slot.id) ?? { ring: null, glow: null, burst: null, burstMesh: null };
            current[part] = value;
            parts.current.set(slot.id, current);
          }}
        />
      ))}
    </group>
  );
}

function Marker({ slot, formation, glowTexture, register }: { slot: RosterSlot; formation: FormationId; glowTexture: ReturnType<typeof createGlowTexture>; register: Registrar }) {
  const { x, z } = placementFor(formation, slot.id);
  const colour = useMemo(() => new Color(slot.filledBy ? ACTOR_COLOR[slot.filledBy] : SLOT_COLOR[slot.type]), [slot.filledBy, slot.type]);

  return (
    <group position={[x, 0.012, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.62, 0.7, 56]} />
        <meshBasicMaterial ref={(m) => register("ring", m)} color={colour} transparent opacity={0.5} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <planeGeometry args={[2.6, 2.6]} />
        <meshBasicMaterial
          ref={(m) => register("glow", m)}
          map={glowTexture}
          color={colour}
          transparent
          opacity={0}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]} ref={(m) => register("burstMesh", m)}>
        <ringGeometry args={[0.58, 0.66, 56]} />
        <meshBasicMaterial ref={(m) => register("burst", m)} color={colour} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}
