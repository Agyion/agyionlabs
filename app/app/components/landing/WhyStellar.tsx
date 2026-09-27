"use client";

/**
 * WhyStellar: dark ink interlude (§4.4). v3: no scroll scrub: the big
 * stat counts up on entrance, a mono ledger ticker increments on Stellar's
 * ~5s rhythm, and the sand wire carries a slow traveling pulse.
 */

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  animate,
} from "framer-motion";
import { Eyebrow } from "../ui";

const STATS = [
  { k: "~5s", v: "ledger finality: a condition resolves while you watch" },
  { k: "<0.001", v: "XLM per operation: conditions affordable at any amount" },
  { k: "Soroban", v: "Rust contracts, deterministic state machines" },
];

export default function WhyStellar() {
  const reduced = useReducedMotion();
  const root = useRef<HTMLElement>(null);
  const inView = useInView(root, { margin: "-25% 0px -25% 0px" });

  // The oversized stat counts up on entrance, then breathes +1 per "ledger"
  const count = useMotionValue(0);
  const [finality, setFinality] = useState(0);
  useMotionValueEvent(count, "change", (v) =>
    setFinality((prev) => {
      const n = Math.round(v * 10) / 10;
      return prev === n ? prev : n;
    }),
  );
  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setFinality(5);
      return;
    }
    const c = animate(count, 5, { duration: 1.6, ease: [1, 0, 0.3, 0.93] });
    return c.stop;
  }, [inView, reduced, count]);

  // Live ledger ticker: increments every 5s while the section is on screen
  const [ledger, setLedger] = useState(582_341);
  useEffect(() => {
    if (!inView || reduced) return;
    const id = setInterval(() => setLedger((l) => l + 1), 5000);
    return () => clearInterval(id);
  }, [inView, reduced]);

  return (
    <section id="stellar" ref={root} className="relative" style={{ background: "#211D1A" }}>
      {/* gradient wipe in (day → night) */}
      <div className="h-24" style={{ background: "linear-gradient(180deg, #0E100F, #090B0A)" }} />

      <div className="mx-auto max-w-[1200px] px-6 py-24 md:py-36">
        <Eyebrow dark>Why Stellar</Eyebrow>
        <motion.h2
          className="display mt-4 max-w-[18ch] text-[36px] leading-[1.08] md:text-[56px]"
          style={{ color: "#F3ECE4" }}
          initial={reduced ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7, ease: [1, 0, 0.3, 0.93] }}
        >
          Conditions need a ledger that is fast, cheap, and final.
        </motion.h2>

        <div className="mt-10 flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="font-serif text-[72px] leading-none md:text-[120px]" style={{ color: "#1FD48C" }}>
            <span className="tnum">{finality}</span>
            <span className="text-[28px] md:text-[40px]" style={{ color: "#8A948D" }}>
              {" "}seconds to certainty
            </span>
          </div>
          {/* live ledger tick: the chain breathing in real time */}
          <div className="flex items-center gap-2 pb-3 font-mono text-[12px]" style={{ color: "#8A948D" }}>
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${reduced ? "" : "stage-dot"}`}
              style={{ background: "#1FD48C" }}
            />
            ledger <span className="tnum" style={{ color: "#F3ECE4" }}>#{ledger.toLocaleString("en-US")}</span> closed
          </div>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-px overflow-hidden rounded-xl md:grid-cols-3" style={{ background: "#3A332D" }}>
          {STATS.map((s, i) => (
            <motion.div
              key={s.k}
              className="p-8"
              style={{ background: "#2B2521" }}
              initial={reduced ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
            >
              <div className="tnum font-mono text-[26px]" style={{ color: "#1FD48C" }}>
                {s.k}
              </div>
              <p className="mt-3 text-[15px] leading-[1.6]" style={{ color: "#8A948D" }}>
                {s.v}
              </p>
            </motion.div>
          ))}
        </div>

        {/* lifeline passes through, warming the section: draws in on
            entrance, then carries a slow traveling pulse forever */}
        <svg viewBox="0 0 1200 60" className="mt-20 w-full" aria-hidden>
          <motion.path
            d="M 0 40 C 200 10, 400 55, 600 30 C 800 8, 1000 50, 1200 24"
            stroke="#4A3F35"
            strokeWidth="1.5"
            fill="none"
            initial={reduced ? false : { pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.4, ease: [1, 0, 0.3, 0.93] }}
          />
          {!reduced && (
            <motion.path
              d="M 0 40 C 200 10, 400 55, 600 30 C 800 8, 1000 50, 1200 24"
              stroke="#1FD48C"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="0.03 0.12"
              initial={{ strokeDashoffset: 1 }}
              animate={{ strokeDashoffset: 0 }}
              transition={{ duration: 6, ease: "linear", repeat: Infinity }}
              opacity={0.6}
            />
          )}
        </svg>
      </div>

      {/* gradient wipe out (night → day) */}
      <div className="h-24" style={{ background: "linear-gradient(180deg, #090B0A, #0E100F)" }} />
    </section>
  );
}
