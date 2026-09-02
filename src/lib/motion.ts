"use client";

import { useEffect, useRef, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

/**
 * Eases a number toward its target with an exponential approach, so scoreboard figures count rather than
 * jump. Snaps instantly under reduced motion.
 */
export function useTweenedNumber(target: number, speed = 9): number {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    if (reduced) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.12, (now - last) / 1000);
      last = now;
      const current = shownRef.current;
      const next = current + (target - current) * (1 - Math.exp(-speed * dt));
      if (Math.abs(target - next) < 0.02) {
        shownRef.current = target;
        setShown(target);
        return;
      }
      shownRef.current = next;
      setShown(next);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, speed, reduced]);

  return shown;
}

/** True for `ms` after `key` changes, then false. Drives one-shot reveals like the ticker or a delta chip. */
export function useTransient(key: string | number | null, ms: number): boolean {
  const [active, setActive] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setActive(true);
    const timer = window.setTimeout(() => setActive(false), ms);
    return () => window.clearTimeout(timer);
  }, [key, ms]);
  return active;
}
