"use client";

/**
 * Cursor: custom cursor follower (§3.3). Desktop landing only; 8px ink dot
 * + 40px ring trailing with lerp ~0.12; ring expands over interactive
 * elements. Disabled on touch and under prefers-reduced-motion.
 */

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

export default function Cursor() {
  const reduced = useReducedMotion();
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    if (!fine || reduced) return;
    setEnabled(true);

    const target = { x: -100, y: -100 };
    const ringPos = { x: -100, y: -100 };
    let hovering = false;
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
      const t = e.target as HTMLElement;
      hovering = !!t.closest("a, button, input, [role='button']");
    };

    const loop = () => {
      ringPos.x += (target.x - ringPos.x) * 0.12;
      ringPos.y += (target.y - ringPos.y) * 0.12;
      if (dot.current)
        dot.current.style.transform = `translate(${target.x - 4}px, ${target.y - 4}px)`;
      if (ring.current)
        ring.current.style.transform = `translate(${ringPos.x - 20}px, ${ringPos.y - 20}px) scale(${hovering ? 1.6 : 1})`;
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  if (!enabled) return null;
  return (
    <>
      <div
        ref={dot}
        className="pointer-events-none fixed left-0 top-0 z-50 h-2 w-2 rounded-full"
        style={{ background: "var(--ink)" }}
      />
      <div
        ref={ring}
        className="pointer-events-none fixed left-0 top-0 z-50 h-10 w-10 rounded-full border transition-[border-color] duration-200"
        style={{ borderColor: "var(--sand)" }}
      />
    </>
  );
}
