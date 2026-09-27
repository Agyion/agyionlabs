"use client";

/**
 * Lifeline: one continuous pale-sand stroke flowing down the page margin
 * (the "wire" the money travels). v3: no scroll linkage: the wire draws
 * itself on its own clock: a slow self-draw loop, plus a warm pulse that
 * runs along the wire like current. Desktop only, reduced-motion off.
 */

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

export default function Lifeline() {
  const reduced = useReducedMotion();
  const [height, setHeight] = useState(2400);

  useEffect(() => {
    const measure = () => setHeight(Math.max(document.body.scrollHeight, 1600));
    measure();
    window.addEventListener("resize", measure);
    const t = setTimeout(measure, 1500);
    return () => {
      window.removeEventListener("resize", measure);
      clearTimeout(t);
    };
  }, []);

  if (reduced) return null;

  // gentle serpentine down the left margin
  const w = 60;
  const seg = 260;
  const n = Math.ceil(height / seg);
  let d = `M ${w / 2} 0`;
  for (let i = 0; i < n; i++) {
    const y0 = i * seg;
    const dir = i % 2 === 0 ? 1 : -1;
    d += ` C ${w / 2 + 26 * dir} ${y0 + seg * 0.35}, ${w / 2 - 26 * dir} ${y0 + seg * 0.65}, ${w / 2} ${y0 + seg}`;
  }

  return (
    <div className="pointer-events-none fixed left-3 top-0 z-0 hidden h-full xl:block" aria-hidden>
      <svg width={w} height={height} className="h-full">
        {/* the wire draws itself in, holds, releases: an endless breath */}
        <motion.path
          d={d}
          stroke="var(--sand)"
          strokeWidth="1.5"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: [0, 1, 1, 0] }}
          transition={{
            duration: 18,
            times: [0, 0.42, 0.62, 1],
            ease: "easeInOut",
            repeat: Infinity,
          }}
        />
        {/* a warm pulse traveling along the wire, like current */}
        <motion.path
          d={d}
          stroke="var(--accent)"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="0.015 0.06"
          initial={{ strokeDashoffset: 1 }}
          animate={{ strokeDashoffset: 0 }}
          transition={{ duration: 9, ease: "linear", repeat: Infinity }}
          opacity={0.55}
        />
      </svg>
    </div>
  );
}
