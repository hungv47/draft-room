"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { PerspectiveCamera, Vector3 } from "three";
import { useReducedMotion } from "@/lib/motion";

/**
 * Broadcast camera: high behind the near goal, looking down the pitch. It breathes slowly and leans a
 * little toward the pointer. Portrait viewports lift and widen it so the whole formation stays in frame.
 */
export function CameraRig({ portrait }: { portrait: boolean }) {
  const camera = useThree((s) => s.camera);
  const pointer = useThree((s) => s.pointer);
  const reduced = useReducedMotion();
  const target = useMemo(() => (portrait ? new Vector3(0, 0, -1.3) : new Vector3(0, 0.2, -1.4)), [portrait]);
  const current = useRef(new Vector3());
  const base = useMemo(() => (portrait ? new Vector3(0, 19.2, 12.2) : new Vector3(0, 13.4, 11.2)), [portrait]);
  const initialised = useRef(false);

  useFrame(({ clock }, dt) => {
    if (camera instanceof PerspectiveCamera) {
      const fov = portrait ? 52 : 40;
      if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }
    const t = clock.elapsedTime;
    const driftX = reduced ? 0 : Math.sin(t * 0.17) * 0.45;
    const driftY = reduced ? 0 : Math.sin(t * 0.11) * 0.18;
    const leanX = reduced ? 0 : pointer.x * 0.9;
    const leanY = reduced ? 0 : pointer.y * 0.35;
    const goal = current.current.set(base.x + driftX + leanX, base.y + driftY + leanY, base.z);
    if (!initialised.current) {
      camera.position.copy(goal);
      initialised.current = true;
    } else {
      const k = 1 - Math.exp(-Math.min(dt, 0.05) * 3.2);
      camera.position.lerp(goal, k);
    }
    camera.lookAt(target);
  });

  return null;
}
