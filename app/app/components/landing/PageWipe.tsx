"use client";

/**
 * PageWipe — page-enter transition (§3.3): three sheets (sand → cream →
 * ink) slide up and out, staggered 60ms apart, once on mount. Time-based,
 * not scroll-linked. Skipped entirely under prefers-reduced-motion.
 */

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

const SHEETS = ["#26302A", "#151917", "#1FD48C"];

export default function PageWipe() {
  const reduced = useReducedMotion();
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDone(true), 1400);
    return () => clearTimeout(t);
  }, []);

  if (reduced || done) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]" aria-hidden>
      {SHEETS.map((bg, i) => (
        <motion.div
          key={bg}
          className="absolute inset-0"
          style={{ background: bg }}
          initial={{ y: 0 }}
          animate={{ y: "-100%" }}
          transition={{ duration: 0.7, delay: i * 0.06, ease: [1, 0, 0.3, 0.93] }}
        />
      ))}
    </div>
  );
}
