"use client";

/**
 * Hero — the money lifecycle as a deterministic, code-drawn loop (v3).
 *
 * No scroll linkage anywhere: one linear clock (framer `animate`, repeat:
 * Infinity) drives a four-act scene, frame-accurate and identical for every
 * visitor regardless of mouse sensitivity:
 *   1. Lock    (0–14%)   capsule fades in, seal strokes draw closed, pot settles
 *   2. Wait    (14–58%)  terracotta curve draws down, tabular price ticks;
 *                        the tail crosses zero into ember with a soft pulse
 *   3. Prove   (58–74%)  condition stamp (stroke check) + funds converge,
 *                        capsule opens
 *   4. Return  (74–94%)  ghosted alternative timeline in sand
 *   …then the scene composts out (94–100%) and the loop begins again.
 *
 * Act labels are clickable: the clock jumps to that act and keeps running.
 * prefers-reduced-motion: the clock parks at the "proven" moment, fully drawn.
 * The hero video is gone (physics error in the source clip); texture.png
 * stays as a barely-there paper grain under the scene.
 */

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  animate,
  useReducedMotion,
  type AnimationPlaybackControls,
  type MotionValue,
} from "framer-motion";
import { ArrowLink, Eyebrow } from "../ui";

const LOOP = 16; // seconds per full lifecycle
const START = 1200; // demo price in TRY
const END = -180; // below zero — the wow beat
const ACTS = ["Lock", "Wait", "Prove", "Execute or return"];
const ACT_MID = [0.07, 0.36, 0.66, 0.85];

// Decay curve geometry (scene viewBox 560×420)
const CURVE =
  "M 20 96 C 140 104, 220 132, 290 182 C 350 226, 420 280, 540 330";
const ZERO_Y = 248; // y of the zero line in scene coordinates

function priceAt(p: number): number {
  // flat-ish during lock, decays through wait, holds after prove
  if (p < 0.14) return START;
  const t = Math.min(1, (p - 0.14) / 0.44);
  const eased = t * t * (3 - 2 * t); // smoothstep
  return Math.round(START + (END - START) * eased);
}

export default function Hero() {
  const reduced = useReducedMotion();

  // The one clock. Linear, looping, deterministic.
  const mv = useMotionValue(0);
  const controls = useRef<AnimationPlaybackControls | null>(null);

  useEffect(() => {
    if (reduced) {
      controls.current?.stop();
      mv.set(0.72); // park at the proven moment, everything drawn
      return;
    }
    const loop = (from: number) => {
      controls.current = animate(mv, 1, {
        duration: LOOP * (1 - from),
        ease: "linear",
        onComplete: () => {
          mv.set(0);
          controls.current = animate(mv, 1, {
            duration: LOOP,
            ease: "linear",
            repeat: Infinity,
          });
        },
      });
    };
    loop(0);
    return () => controls.current?.stop();
  }, [reduced, mv]);

  /** Click an act label: the clock jumps there, then keeps running. */
  const jumpTo = (i: number) => {
    if (reduced) {
      mv.set(ACT_MID[i]);
      return;
    }
    controls.current?.stop();
    controls.current = animate(mv, ACT_MID[i], {
      duration: 0.7,
      ease: [1, 0, 0.3, 0.93],
      onComplete: () => {
        controls.current = animate(mv, 1, {
          duration: LOOP * (1 - ACT_MID[i]),
          ease: "linear",
          onComplete: () => {
            mv.set(0);
            controls.current = animate(mv, 1, {
              duration: LOOP,
              ease: "linear",
              repeat: Infinity,
            });
          },
        });
      },
    });
  };

  // --- Scene bindings (all pure functions of the clock) -------------------
  const capsuleOpacity = useTransform(mv, [0.01, 0.07], [0, 1]);
  const capsuleY = useTransform(mv, [0.01, 0.09], [16, 0]);
  const capsuleOpen = useTransform(mv, [0.58, 0.7], [0, 1]); // halves part at proof
  const capsuleDim = useTransform(mv, [0.74, 0.88], [1, 0.25]);
  const sealLen = useTransform(mv, [0.03, 0.14], [0, 1]);
  const amountOpacity = useTransform(mv, [0.04, 0.12], [0, 1]);
  const amountY = useTransform(mv, [0.04, 0.14], [14, 0]);
  const curveLen = useTransform(mv, [0.14, 0.58], [0, 1]);
  const zeroPulse = useTransform(mv, [0.42, 0.48, 0.58], [0, 1, 0]);
  const checkLen = useTransform(mv, [0.58, 0.68], [0, 1]);
  const converge = useTransform(mv, [0.6, 0.76], [0, 1]);
  const ghostOpacity = useTransform(mv, [0.74, 0.84], [0, 0.85]);
  const ghostLen = useTransform(mv, [0.74, 0.92], [0, 1]);
  const sceneTemp = useTransform(mv, [0.42, 0.5, 0.6], [0, 1, 0]); // below-zero warmth
  const sceneFade = useTransform(mv, [0, 0.03, 0.94, 1], [0, 1, 1, 0]);

  // "now" bead riding the curve + capsule parting (hoisted bindings)
  const beadOpacity = useTransform(curveLen, [0.02, 0.08, 0.98, 1], [0, 1, 1, 0]);
  const beadCX = useTransform(curveLen, (l) => beadX(l));
  const beadCY = useTransform(curveLen, (l) => beadY(l));
  const capTopY = useTransform(capsuleOpen, (o) => -o * 7);
  const capBottomY = useTransform(capsuleOpen, (o) => o * 7);
  const sealRingOpacity = useTransform(sealLen, [0.9, 1], [0, 0.8]);

  // Ticking price (tabular numerals; color is the alarm)
  const [price, setPrice] = useState(START);
  useMotionValueEvent(mv, "change", (v) => setPrice(priceAt(v)));
  const belowZero = price < 0;

  // Act label state (coarse-grained so we do not re-render every frame)
  const [act, setAct] = useState(0);
  useMotionValueEvent(mv, "change", (v) => {
    const a = v < 0.14 ? 0 : v < 0.58 ? 1 : v < 0.74 ? 2 : 3;
    setAct((prev) => (prev === a ? prev : a));
  });

  // Converging particles (act 3): 7 dots fly to the resolve point
  const particles = Array.from({ length: 7 }, (_, i) => {
    const angle = (i / 7) * Math.PI * 2;
    return { sx: Math.cos(angle) * 150, sy: Math.sin(angle) * 100, delay: i * 0.06 };
  });

  return (
    <section className="relative overflow-hidden">
      {/* paper grain texture (the broken hero-loop.mp4 is retired) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.05]"
        style={{ backgroundImage: "url(/media/texture.png)" }}
      />
      {/* background temperature shift at the below-zero moment */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: sceneTemp,
          background: "linear-gradient(180deg, rgba(188,119,63,0.07), rgba(143,78,42,0.10))",
        }}
      />

      <div className="mx-auto grid min-h-screen w-full max-w-[1200px] grid-cols-1 items-center gap-10 px-6 pb-20 pt-28 md:grid-cols-12 md:pt-20">
        {/* Copy */}
        <div className="md:col-span-5">
          <Eyebrow>Money with conditions</Eyebrow>
          <h1 className="display mt-4 text-[44px] leading-[1.05] text-ink md:text-[84px]">
            <Staggered text="Money that" />
            <br />
            <Staggered text="waits for" delay={0.35} />
            <br />
            <Staggered text="proof." delay={0.7} />
          </h1>
          <motion.p
            className="mt-6 max-w-[42ch] text-[17px] leading-[1.65] text-muted"
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.05, ease: [1, 0, 0.3, 0.93] }}
          >
            Agyion locks money on Stellar, waits for a condition to be proven,
            and the money executes itself or quietly comes back.
          </motion.p>
          <motion.div
            className="mt-8"
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.2, ease: [1, 0, 0.3, 0.93] }}
          >
            <ArrowLink href="/app">Open the app</ArrowLink>
          </motion.div>

          {/* Act labels — the loop's clock face; click to jump */}
          <motion.div
            className="mt-12 flex flex-wrap items-start gap-5"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 1.35 }}
          >
            {ACTS.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => jumpTo(i)}
                className="group text-left"
                aria-label={`Act ${i + 1}: ${label}`}
              >
                <span
                  className="block text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors duration-300 group-hover:text-accent"
                  style={{ color: act === i ? "var(--accent)" : "var(--muted)" }}
                >
                  {i + 1} · {label}
                </span>
                <span className="relative mt-1 block h-px w-full" style={{ background: "var(--hairline)" }}>
                  <span
                    className="absolute inset-y-0 left-0 block h-px transition-all duration-500"
                    style={{
                      width: act === i ? "100%" : "0%",
                      background: "var(--accent)",
                    }}
                  />
                </span>
              </button>
            ))}
          </motion.div>
          <p className="mt-3 text-[12px] text-muted">
            The scene runs on its own clock: click an act to jump.
          </p>
        </div>

        {/* Scene */}
        <motion.div className="relative md:col-span-7" style={{ opacity: sceneFade }}>
          <div className="relative mx-auto aspect-[560/420] w-full max-w-[620px]">
            <svg viewBox="0 0 560 420" className="h-full w-full">
              {/* zero line */}
              <line x1="20" y1={ZERO_Y} x2="540" y2={ZERO_Y} stroke="var(--sand)" strokeDasharray="3 6" strokeWidth="1" />
              <text x="20" y={ZERO_Y - 8} fontSize="11" fill="var(--muted)" fontFamily="var(--font-mono)">
                0.00
              </text>

              {/* ghost alternative timeline — the unproven branch (act 4) */}
              <motion.path
                d="M 20 96 C 160 116, 300 152, 540 132"
                stroke="var(--sand)"
                strokeWidth="2"
                fill="none"
                style={{ pathLength: ghostLen, opacity: ghostOpacity }}
              />
              <motion.text
                x="300" y="118" textAnchor="middle" fontSize="11" fill="var(--muted)" fontFamily="var(--font-mono)"
                style={{ opacity: ghostOpacity }}
              >
                unproven → returned
              </motion.text>

              {/* decay curve — terracotta, tail crosses zero into ember */}
              <motion.path
                d={CURVE}
                stroke="var(--accent)"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
                style={{ pathLength: curveLen }}
              />
              {/* ember tail hint below zero */}
              <motion.path
                d="M 350 226 C 420 280, 470 308, 540 330"
                stroke="var(--ember)"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
                style={{ pathLength: curveLen, opacity: belowZero ? 1 : 0 }}
              />
              {/* the "now" bead riding the curve */}
              <motion.circle
                r="4.5"
                fill={belowZero ? "#F2A65A" : "#1FD48C"}
                style={{ opacity: beadOpacity, cx: beadCX, cy: beadCY }}
              />

              {/* the capsule + lock seal (act 1); opens when proven (act 3) */}
              <motion.g style={{ opacity: capsuleOpacity, y: capsuleY }}>
                <motion.g style={{ opacity: capsuleDim }}>
                  {/* capsule body — two halves that part at proof */}
                  <motion.g style={{ y: capTopY }}>
                    <path
                      d="M 74 34 a 22 22 0 0 1 44 0 v 12 h -44 z"
                      fill="var(--surface)" stroke="var(--accent)" strokeWidth="2"
                    />
                  </motion.g>
                  <motion.g style={{ y: capBottomY }}>
                    <path
                      d="M 74 46 h 44 v 12 a 22 22 0 0 1 -44 0 z"
                      fill="var(--surface)" stroke="var(--accent)" strokeWidth="2"
                    />
                  </motion.g>
                  {/* the pot inside, revealed when the capsule opens */}
                  <motion.text
                    x="96" y="63" textAnchor="middle" fontSize="10"
                    fill="var(--olive)" fontFamily="var(--font-mono)"
                    style={{ opacity: capsuleOpen }}
                  >
                    1,000
                  </motion.text>
                  {/* seal ring + check draw closed in act 1 */}
                  <motion.circle
                    cx="96" cy="46" r="34"
                    stroke="var(--accent)" strokeWidth="1.6" fill="none"
                    strokeDasharray="4 5"
                    style={{ pathLength: sealLen, opacity: sealRingOpacity }}
                  />
                  <motion.path
                    d="M 84 46 l 8 8 l 16 -16"
                    stroke="var(--accent)" strokeWidth="2" fill="none"
                    strokeLinecap="round" strokeLinejoin="round"
                    style={{ pathLength: sealLen }}
                  />
                </motion.g>
              </motion.g>

              {/* condition stamp (act 3) — stroke-drawn check, not emoji */}
              <motion.g>
                <motion.circle
                  cx="470" cy="72" r="30"
                  stroke="var(--olive)" strokeWidth="2" fill="none"
                  style={{ pathLength: checkLen }}
                />
                <motion.path
                  d="M 458 72 l 9 9 l 17 -18"
                  stroke="var(--olive)" strokeWidth="2.5" fill="none"
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{ pathLength: checkLen }}
                />
                <motion.text
                  x="470" y="122" textAnchor="middle" fontSize="11"
                  fill="var(--olive)" fontFamily="var(--font-mono)"
                  style={{ opacity: checkLen }}
                >
                  condition proven
                </motion.text>
              </motion.g>
            </svg>

            {/* locked amount — settles into place (act 1), parked in the
                quiet bottom-left corner so the curve never crosses it */}
            <motion.div
              className="absolute bottom-[4%] left-[4%] hidden md:block"
              style={{ opacity: amountOpacity, y: amountY }}
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                Locked pot
              </div>
              <div className="tnum font-serif text-[34px] text-ink">1,000.00 TRY</div>
            </motion.div>

            {/* the live price — serif tabular, ember below zero */}
            <div className="absolute right-[4%] top-[55%] text-right md:top-[32%]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                Price
              </div>
              <motion.div
                className="tnum font-serif text-[52px] leading-none md:text-[64px]"
                animate={{ color: belowZero ? "#F2A65A" : "#1FD48C" }}
                transition={{ duration: 0.3 }}
              >
                {price.toLocaleString("en-US")}.00
              </motion.div>
              <motion.div
                className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: "var(--ember)", opacity: zeroPulse }}
              >
                below zero: the seller now pays
              </motion.div>
            </div>

            {/* converging particles — money resolves toward the claimant */}
            {particles.map((p, i) => (
              <Particle key={i} sx={p.sx} sy={p.sy} delay={p.delay} progress={converge} />
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* Bead position along the decay curve, approximated on the cubic path */
function beadX(l: number): number {
  return 20 + l * 520;
}
function beadY(l: number): number {
  // matches CURVE's overall bend closely enough for a guide bead
  const t = Math.max(0, Math.min(1, l));
  const e = t * t * (3 - 2 * t);
  return 96 + e * 234;
}

function Particle({
  sx,
  sy,
  delay,
  progress,
}: {
  sx: number;
  sy: number;
  delay: number;
  progress: MotionValue<number>;
}) {
  const x = useTransform(progress, (v) => {
    const t = Math.max(0, Math.min(1, (v - delay) / (1 - delay)));
    return sx * (1 - t);
  });
  const y = useTransform(progress, (v) => {
    const t = Math.max(0, Math.min(1, (v - delay) / (1 - delay)));
    return sy * (1 - t);
  });
  const opacity = useTransform(progress, [0.05, 0.3, 0.9, 1], [0, 1, 1, 0]);
  return (
    <motion.div
      className="absolute left-[84%] top-[17%] h-[6px] w-[6px] rounded-full"
      style={{ x, y, opacity, background: "var(--olive)" }}
    />
  );
}

/** Per-character stagger on load (independent of the loop) */
function Staggered({ text, delay = 0 }: { text: string; delay?: number }) {
  const reduced = useReducedMotion();
  if (reduced) return <>{text}</>;
  return (
    <span aria-label={text} className="inline-block">
      {text.split("").map((ch, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="inline-block"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: delay + i * 0.028, ease: [1, 0, 0.3, 0.93] }}
        >
          {ch === " " ? "\u00A0" : ch}
        </motion.span>
      ))}
    </span>
  );
}
