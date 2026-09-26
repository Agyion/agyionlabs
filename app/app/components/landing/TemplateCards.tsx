"use client";

/**
 * TemplateCards — v3. No sticky stack, no scroll parallax (scroll-linked
 * motion is banned). Instead: staggered entrances, hover layer shifts, and
 * four always-on signature micro-motions that run on their own clocks,
 * paused when off-screen (§3.4). Cards alternate direction for editorial
 * asymmetry (no equal-card monotony).
 */

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { ArrowLink, Eyebrow, Icon, MediaSlot } from "../ui";

const CARDS = [
  {
    id: "fade",
    name: "Fade",
    tag: "Declining price",
    body: "A price that walks backwards from the moment it is listed. Claim early and pay more; wait and pay less — past zero, the seller pays you. The last hour belongs to the patient.",
    media: "fade.png",
    alt: "Hourglass sand falling as a declining price",
  },
  {
    id: "pod",
    name: "Pod",
    tag: "Time capsule",
    body: "Money buried until a ledger height, opened only by a secret preimage. Savings that cannot be spent early, gifts that arrive on a date, escrow with a horizon.",
    media: "pod.png",
    alt: "Capsule buried in layered sand strata",
  },
  {
    id: "trigger",
    name: "Trigger",
    tag: "Event escrow",
    body: "Funds locked for a beneficiary, released only when an independent attester signs that the condition happened. Past the deadline with no proof, the deposit walks home by rule.",
    media: "trigger.png",
    alt: "A stamped attestation seal",
  },
  {
    id: "envoy",
    name: "Envoy",
    tag: "Agent mandate",
    body: "Delegate bounded spending to an agent key: per-transaction ceiling, daily cap, expiry — enforced by the contract, not by trust. Revocation is one click, always.",
    media: "envoy.png",
    alt: "Concentric limit rings bounding an agent orbit",
  },
] as const;

export default function TemplateCards() {
  const reduced = useReducedMotion();
  return (
    <section id="templates" className="relative mx-auto max-w-[1200px] px-6 py-28 md:py-40">
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, ease: [1, 0, 0.3, 0.93] }}
      >
        <Eyebrow>Four templates</Eyebrow>
        <h2 className="display mt-4 max-w-[16ch] text-[36px] leading-[1.1] text-ink md:text-[56px]">
          Pick the shape of your condition
        </h2>
      </motion.div>

      <div className="mt-16 space-y-10">
        {CARDS.map((c, i) => (
          <Card key={c.id} index={i} card={c} />
        ))}
      </div>
    </section>
  );
}

function Card({ card, index }: { card: (typeof CARDS)[number]; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-15% 0px -15% 0px" });
  const reduced = useReducedMotion();
  const flip = index % 2 === 1; // alternate copy/media sides

  return (
    <motion.div
      ref={ref}
      initial={reduced ? false : { opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay: 0.06 * index, ease: [1, 0, 0.3, 0.93] }}
    >
      <div
        className="template-card group overflow-hidden rounded-2xl border bg-cream"
        style={{ borderColor: "var(--hairline)" }}
      >
        <div className="grid grid-cols-1 md:grid-cols-12">
          {/* copy */}
          <div
            className={`flex flex-col justify-between p-8 md:col-span-5 md:p-12 ${
              flip ? "md:order-2" : ""
            }`}
          >
            <div>
              <div className="flex items-center gap-3">
                <Icon kind={card.id} color="var(--accent)" />
                <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
                  {card.tag}
                </span>
              </div>
              <h3 className="display mt-4 text-[30px] text-ink md:text-[40px]">{card.name}</h3>
              <p className="mt-4 text-[16px] leading-[1.65] text-muted">{card.body}</p>
            </div>
            <div className="mt-8">
              <ArrowLink href={`/app?tab=${card.id}`}>Try {card.name}</ArrowLink>
            </div>
          </div>

          {/* illustration + signature micro-motion (layers shift on hover) */}
          <div
            className={`relative min-h-[320px] overflow-hidden md:col-span-7 ${
              flip ? "md:order-1" : ""
            }`}
          >
            <div className="layer-media absolute inset-0">
              <MediaSlot name={card.media} alt={card.alt} className="absolute inset-0" />
            </div>
            <div
              className="absolute inset-0"
              style={{
                background: flip
                  ? "linear-gradient(270deg, rgba(245,236,229,0.55), transparent 40%)"
                  : "linear-gradient(90deg, rgba(245,236,229,0.55), transparent 40%)",
              }}
            />
            <div className="layer-chip absolute inset-0">
              {card.id === "fade" && <FadeMotion active={inView} />}
              {card.id === "pod" && <PodMotion active={inView} />}
              {card.id === "trigger" && <TriggerMotion active={inView} />}
              {card.id === "envoy" && <EnvoyMotion active={inView} />}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* --- Signature micro-motions (paused when off-screen) ------------------- */

/** Fade: live ticking price, crossing zero into ember */
function FadeMotion({ active }: { active: boolean }) {
  const reduced = useReducedMotion();
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!active || reduced) return;
    const id = setInterval(() => setT((v) => v + 1), 900);
    return () => clearInterval(id);
  }, [active, reduced]);
  const cycle = t % 26;
  const price = 840 - cycle * 48; // 840 → -360
  const below = price < 0;
  return (
    <div className="absolute bottom-6 right-6 rounded-xl bg-paper/90 px-5 py-4 backdrop-blur-sm">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
        Live price
      </div>
      <div
        className="tnum font-serif text-[44px] leading-none transition-colors duration-300"
        style={{ color: below ? "#F2A65A" : "var(--accent)" }}
      >
        {price}.00
      </div>
      <svg viewBox="0 0 200 44" className="mt-2 w-full">
        <line x1="0" y1="26" x2="200" y2="26" stroke="var(--sand)" strokeDasharray="3 4" />
        <path
          d="M 0 8 C 60 12, 120 22, 200 40"
          stroke="var(--accent)" strokeWidth="2" fill="none" strokeLinecap="round"
        />
        <circle
          cx={Math.min(200, cycle * 8.4)}
          cy={8 + Math.min(32, (cycle / 25) * 32)}
          r="3.5"
          fill={below ? "#F2A65A" : "var(--accent)"}
        />
      </svg>
    </div>
  );
}

/** Pod: capsule sinking into sand strata, depth meter filling */
function PodMotion({ active }: { active: boolean }) {
  const reduced = useReducedMotion();
  const [depth, setDepth] = useState(0);
  useEffect(() => {
    if (!active || reduced) return;
    const id = setInterval(() => setDepth((d) => (d + 1) % 60), 120);
    return () => clearInterval(id);
  }, [active, reduced]);
  const y = Math.min(1, depth / 45);
  return (
    <div className="absolute bottom-6 right-6 w-[240px] rounded-xl bg-paper/90 px-5 py-4 backdrop-blur-sm">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
        Burial depth
      </div>
      <svg viewBox="0 0 200 110" className="mt-2 w-full">
        {[0, 1, 2, 3].map((i) => (
          <path
            key={i}
            d={`M 0 ${34 + i * 18} C 60 ${30 + i * 18}, 140 ${38 + i * 18}, 200 ${34 + i * 18}`}
            stroke="var(--sand)" strokeWidth="1.4" fill="none"
            opacity={0.4 + i * 0.2}
          />
        ))}
        <g transform={`translate(100, ${14 + y * 44})`}>
          <ellipse rx="10" ry="15" fill="none" stroke="var(--accent)" strokeWidth="2" />
          <line x1="-6" y1="0" x2="6" y2="0" stroke="var(--accent)" strokeWidth="1.4" />
        </g>
      </svg>
      <div className="mt-1 h-1 w-full rounded-full" style={{ background: "var(--hairline)" }}>
        <div
          className="h-1 rounded-full transition-all duration-150"
          style={{ width: `${Math.round(y * 100)}%`, background: "var(--accent)" }}
        />
      </div>
      <div className="tnum mt-1 font-mono text-[11px] text-muted">
        {Math.round(y * 100)}% buried — unlock horizon ahead
      </div>
    </div>
  );
}

/** Trigger: attestation bolt arrives; escrow flips locked → executed */
function TriggerMotion({ active }: { active: boolean }) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState(0); // 0 pending, 1 bolt, 2 executed
  useEffect(() => {
    if (!active || reduced) return;
    const id = setInterval(() => setPhase((p) => (p + 1) % 7), 900);
    return () => clearInterval(id);
  }, [active, reduced]);
  const executed = phase >= 3;
  const bolt = phase >= 1 && phase <= 3;
  return (
    <div className="absolute bottom-6 right-6 w-[250px] rounded-xl bg-paper/90 px-5 py-4 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
          Escrow state
        </div>
        <div
          className="text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors duration-300"
          style={{ color: executed ? "#35C77F" : "var(--accent)" }}
        >
          {executed ? "Executed" : "Pending"}
        </div>
      </div>
      <svg viewBox="0 0 220 60" className="mt-2 w-full">
        <rect x="6" y="18" width="92" height="26" rx="6" fill="none"
          stroke={executed ? "#35C77F" : "var(--accent)"} strokeWidth="1.6" />
        <text x="52" y="35" textAnchor="middle" fontSize="11" fontFamily="var(--font-mono)"
          fill={executed ? "#35C77F" : "var(--accent)"}>
          {executed ? "released" : "locked"}
        </text>
        <motion.path
          d="M 118 6 l -16 22 h 12 l -8 24"
          stroke="var(--accent)" strokeWidth="2.4" fill="none"
          strokeLinecap="round" strokeLinejoin="round"
          initial={false}
          animate={{ opacity: bolt ? 1 : 0.15, pathLength: bolt ? 1 : 0.4 }}
          transition={{ duration: 0.4 }}
        />
        <line x1="140" y1="31" x2="170" y2="31" stroke="var(--sand)" strokeWidth="1.4" />
        <circle cx="196" cy="31" r="16" fill="none"
          stroke={executed ? "#35C77F" : "var(--sand)"} strokeWidth="1.6" />
        <motion.path
          d="M 188 31 l 6 6 l 12 -13"
          stroke="#35C77F" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: executed ? 1 : 0 }}
          transition={{ duration: 0.4 }}
        />
      </svg>
      <div className="font-mono text-[11px] text-muted">
        {executed ? "attester sig verified" : "waiting for attestation"}
      </div>
    </div>
  );
}

/** Envoy: agent orbit inside a limit ring; meter drains to the cap, stops dead */
function EnvoyMotion({ active }: { active: boolean }) {
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active || reduced) return;
    const id = setInterval(() => setTick((t) => t + 1), 150);
    return () => clearInterval(id);
  }, [active, reduced]);
  const cycle = tick % 90;
  const spent = Math.min(1, cycle / 58); // drains to the cap, then holds
  const atCap = spent >= 1;
  const angle = tick * 0.09;
  const r = 52;
  const cx = 70 + Math.cos(angle) * r * (atCap ? 1 : 0.72);
  const cy = 70 + Math.sin(angle) * r * (atCap ? 1 : 0.72);
  return (
    <div className="absolute bottom-6 right-6 rounded-xl bg-paper/90 px-5 py-4 backdrop-blur-sm">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
        Agent · bounded orbit
      </div>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 140 140" className="mt-1 h-[110px] w-[110px]">
          <circle cx="70" cy="70" r={r} fill="none" stroke="var(--sand)" strokeWidth="1.4" />
          <circle cx="70" cy="70" r={r * 0.72} fill="none" stroke="var(--sand)" strokeWidth="1"
            strokeDasharray="3 5" />
          <circle cx="70" cy="70" r="2.4" fill="var(--ink)" />
          <circle cx={cx} cy={cy} r="4.5" fill={atCap ? "#F2A65A" : "var(--accent)"} />
          {atCap && (
            <circle cx={cx} cy={cy} r="9" fill="none" stroke="#F2A65A" strokeWidth="1.2" opacity="0.6" />
          )}
        </svg>
        <div>
          <div className="tnum font-mono text-[13px] text-ink">
            {Math.round(spent * 250)} / 250 TRY
          </div>
          <div className="mt-1 h-1 w-[96px] rounded-full" style={{ background: "var(--hairline)" }}>
            <div
              className="h-1 rounded-full"
              style={{ width: `${spent * 100}%`, background: atCap ? "#F2A65A" : "var(--accent)" }}
            />
          </div>
          <div
            className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.1em]"
            style={{ color: atCap ? "#F2A65A" : "var(--muted)" }}
          >
            {atCap ? "the contract said no" : "within cap"}
          </div>
        </div>
      </div>
    </div>
  );
}
