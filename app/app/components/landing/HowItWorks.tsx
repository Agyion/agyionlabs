"use client";

/**
 * HowItWorks — sticky left rail (four stage labels activate on scroll),
 * right column: one paragraph + one interactive micro-demo per stage (§4.2).
 * The Fade stage demo is playable: drag the decay rate and watch the curve
 * and the price recompute live.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { Eyebrow } from "../ui";

const STAGES = [
  {
    id: "lock",
    label: "Lock",
    title: "Money enters the rule",
    body: "A seller, a funder, or a future you locks funds into the contract with a condition attached. The money stays on the network: no custodian, no escrow agent, just the rule.",
  },
  {
    id: "wait",
    label: "Wait",
    title: "Time is a parameter, not a promise",
    body: "A Fade listing's price decays ledger by ledger; a Pod sits buried until its unlock horizon. Waiting is not idle: it is the contract doing exactly what it was told.",
  },
  {
    id: "prove",
    label: "Prove",
    title: "A signature is the evidence",
    body: "A venue signs a handoff, an attester approves an event, a claim key authorizes a capsule's recipient. The contract verifies each signature and its conditions.",
  },
  {
    id: "execute",
    label: "Execute or return",
    title: "Two exits, zero discretion",
    body: "When proven, the money executes itself: claimant paid, beneficiary released, agent settled. If unproven when the deadline lands, it returns to where it came from. The contract does not negotiate.",
  },
] as const;

export default function HowItWorks() {
  const reduced = useReducedMotion();
  return (
    <section id="how" className="relative mx-auto max-w-[1200px] px-6 py-28 md:py-40">
      <div className="grid grid-cols-1 gap-14 md:grid-cols-12">
        {/* sticky left rail */}
        <div className="md:col-span-4">
          <div className="md:sticky md:top-32">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="display mt-4 text-[36px] leading-[1.1] text-ink md:text-[56px]">
              The life of locked money
            </h2>
            <div className="mt-10 space-y-4">
              {STAGES.map((s) => (
                <StageLabel key={s.id} id={s.id} label={s.label} />
              ))}
            </div>
          </div>
        </div>

        {/* right column */}
        <div className="space-y-24 md:col-span-8">
          {STAGES.map((s, i) => (
            <motion.article
              key={s.id}
              id={`stage-${s.id}`}
              initial={reduced ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6, ease: [1, 0, 0.3, 0.93] }}
              className="scroll-mt-32"
            >
              <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
                Stage {i + 1}
              </div>
              <h3 className="display mt-2 text-[24px] text-ink md:text-[28px]">{s.title}</h3>
              <p className="mt-3 max-w-[56ch] text-[17px] leading-[1.65] text-muted">{s.body}</p>
              {s.id === "wait" && <DecayPlayground />}
              {s.id === "lock" && <LockDemo />}
              {s.id === "prove" && <ProveDemo />}
              {s.id === "execute" && <ExecuteDemo />}
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

function StageLabel({ id, label }: { id: string; label: string }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = document.getElementById(`stage-${id}`);
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => setActive(entries[0]?.isIntersecting ?? false),
      { rootMargin: "-35% 0px -35% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [id]);

  return (
    <a
      href={`#stage-${id}`}
      className="flex items-center gap-3 text-[14px] font-medium transition-colors duration-300"
      style={{ color: active ? "var(--accent)" : "var(--muted)" }}
    >
      <span className="relative flex w-8 items-center">
        <span
          className="block h-px transition-all duration-300"
          style={{ width: active ? 32 : 18, background: active ? "var(--accent)" : "var(--sand)" }}
        />
        {active && (
          <span
            className="stage-dot absolute -right-1 h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--accent)" }}
          />
        )}
      </span>
      {label}
    </a>
  );
}

/* --- Micro-demos -------------------------------------------------------- */

/** Playable decay explainer: drag the rate, watch curve + price recompute.
 *  A "now" bead sweeps the curve on its own clock; the mono readout ticks. */
function DecayPlayground() {
  const reduced = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box, { margin: "-10% 0px -10% 0px" });
  const [rate, setRate] = useState(6); // TRY per tick
  const start = 1000;
  const ticks = 80;
  const floor = -200;

  // the bead's own clock — sweeps 0..80 ticks, pauses off-screen
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!inView || reduced) return;
    const id = setInterval(() => setNow((n) => (n + 1) % (ticks + 1)), 90);
    return () => clearInterval(id);
  }, [inView, reduced]);

  const pointAt = (t: number) => {
    const p = Math.max(floor, start - rate * t);
    return {
      p,
      x: 20 + (t / ticks) * 440,
      y: 60 + ((start - p) / (start - floor)) * 240,
    };
  };

  const { path, finalPrice } = useMemo(() => {
    const pts: string[] = [];
    for (let t = 0; t <= ticks; t++) {
      const { x, y } = pointAt(t);
      pts.push(`${t === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return { path: pts.join(" "), finalPrice: Math.max(floor, start - rate * ticks) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate, floor]);

  const zeroY = 60 + (start / (start - floor)) * 240;
  const bead = pointAt(now);
  const beadBelow = bead.p < 0;

  return (
    <div ref={box} className="mt-6 rounded-xl border bg-cream p-5" style={{ borderColor: "var(--hairline)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
          Playable: decay rate
        </div>
        <div
          className="tnum font-serif text-[34px] leading-none"
          style={{ color: finalPrice < 0 ? "#F2A65A" : "var(--accent)" }}
        >
          {finalPrice.toLocaleString("en-US")}.00
          <span className="ml-2 text-[13px] font-sans text-muted">TRY at tick {ticks}</span>
        </div>
      </div>
      <svg viewBox="0 0 480 330" className="mt-3 w-full">
        <line x1="20" y1={zeroY} x2="460" y2={zeroY} stroke="var(--sand)" strokeDasharray="3 6" />
        <text x="20" y={zeroY - 6} fontSize="10" fill="var(--muted)" fontFamily="var(--font-mono)">0</text>
        <path d={path} stroke="var(--accent)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        {/* ember segment below zero */}
        <path
          d={path}
          stroke="var(--ember)"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          clipPath="url(#belowZero)"
        />
        {/* the sweeping "now" bead */}
        <circle cx={bead.x} cy={bead.y} r="8" fill="none"
          stroke={beadBelow ? "#F2A65A" : "var(--accent)"} strokeWidth="1" opacity="0.5" />
        <circle cx={bead.x} cy={bead.y} r="4" fill={beadBelow ? "#F2A65A" : "var(--accent)"} />
        <defs>
          <clipPath id="belowZero">
            <rect x="0" y={zeroY} width="480" height={330 - zeroY} />
          </clipPath>
        </defs>
      </svg>
      <div className="mt-1 font-mono text-[11px] text-muted">
        now: tick <span className="tnum">{now}</span> · price{" "}
        <span className="tnum" style={{ color: beadBelow ? "#F2A65A" : "var(--accent)" }}>
          {bead.p.toLocaleString("en-US")}.00
        </span>{" "}
        TRY{beadBelow ? ": below zero" : ""}
      </div>
      <input
        type="range"
        min={1}
        max={16}
        value={rate}
        onChange={(e) => setRate(Number(e.target.value))}
        className="mt-2 w-full accent-[#1FD48C]"
        aria-label="Decay rate in TRY per tick"
      />
      <div className="mt-1 flex justify-between font-mono text-[11px] text-muted">
        <span>gentle: 1/tick</span>
        <span className="tnum">{rate} TRY / tick</span>
        <span>steep: 16/tick</span>
      </div>
    </div>
  );
}

/** Lock: seal assembles on view */
function LockDemo() {
  const reduced = useReducedMotion();
  return (
    <div className="mt-6 flex items-center gap-6 rounded-xl border bg-cream p-5" style={{ borderColor: "var(--hairline)" }}>
      <svg viewBox="0 0 80 80" className="h-16 w-16 shrink-0">
        <motion.circle
          cx="40" cy="40" r="30" stroke="var(--accent)" strokeWidth="2" fill="none"
          initial={reduced ? false : { pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [1, 0, 0.3, 0.93] }}
        />
        <motion.path
          d="M 28 40 l 8 8 l 16 -17" stroke="var(--accent)" strokeWidth="2.5" fill="none"
          strokeLinecap="round" strokeLinejoin="round"
          initial={reduced ? false : { pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.6 }}
        />
      </svg>
      <p className="text-[14px] leading-relaxed text-muted">
        The seal closes once. From that ledger on, the pot follows the rule.
        Neither the seller nor we can change it.
      </p>
    </div>
  );
}

/** Prove: attestation stamp arrives as a stroke-drawn seal */
function ProveDemo() {
  const reduced = useReducedMotion();
  return (
    <div className="mt-6 rounded-xl border bg-cream p-5" style={{ borderColor: "var(--hairline)" }}>
      <div className="flex items-center justify-between gap-4">
        <div className="font-mono text-[12px] text-muted">
          <div>sig: ed25519 · 64 bytes</div>
          <div>payload: id ‖ party ‖ ts</div>
        </div>
        <svg viewBox="0 0 90 90" className="h-16 w-16 shrink-0">
          <motion.circle
            cx="45" cy="45" r="34" stroke="var(--olive)" strokeWidth="2" fill="none"
            strokeDasharray="4 5"
            initial={reduced ? false : { rotate: -90, opacity: 0 }}
            whileInView={{ rotate: 0, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            style={{ transformOrigin: "center" }}
          />
          <motion.path
            d="M 30 46 l 10 10 l 21 -24" stroke="var(--olive)" strokeWidth="3" fill="none"
            strokeLinecap="round" strokeLinejoin="round"
            initial={reduced ? false : { pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.5 }}
          />
        </svg>
      </div>
    </div>
  );
}

/** Execute-or-return: two exit chips, one resolves on view */
function ExecuteDemo() {
  const reduced = useReducedMotion();
  return (
    <div className="mt-6 grid grid-cols-2 gap-4">
      <motion.div
        className="rounded-xl border p-5"
        style={{ borderColor: "#35C77F" }}
        initial={reduced ? false : { opacity: 0.35 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "#35C77F" }}>
          Proven
        </div>
        <div className="tnum mt-2 font-mono text-[15px] text-ink">pays the claimant</div>
      </motion.div>
      <motion.div
        className="rounded-xl border p-5"
        style={{ borderColor: "var(--hairline)" }}
        initial={reduced ? false : { opacity: 0.35 }}
        whileInView={{ opacity: 0.75 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          Unproven
        </div>
        <div className="tnum mt-2 font-mono text-[15px] text-muted">returns to the funder</div>
      </motion.div>
    </div>
  );
}
