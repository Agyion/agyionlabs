"use client";

/**
 * ui.tsx — shared primitives, in the landing's design language:
 * mono uppercase micro-labels, hairline + flat-surface frames, accent fill
 * with ink-sweep hover for the single primary action per screen.
 */

import { createContext, useContext, useState, type ReactNode } from "react";

// Only explicitly marked contract actions use this gate. Draft preparation,
// record reads, and independent anchor flows remain available.
export const TransactionAvailability = createContext(true);

export function Eyebrow({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <div
      className="eyebrow"
      style={dark ? { color: "var(--accent)" } : undefined}
    >
      {children}
    </div>
  );
}

/**
 * PanelHero — the mini LedgerHero every console panel gets: a 3-cell mono
 * meta strip, the instrument name as a solid + outline word pair, and a
 * hairline that draws itself in above the right-aligned description.
 */
export function PanelHero({
  strip,
  word,
  outline,
  desc,
}: {
  strip: [ReactNode, ReactNode, ReactNode];
  word: string;
  outline: string;
  desc?: ReactNode;
}) {
  return (
    <header className="panel-hero">
      <div className="panel-hero__strip">
        {strip.map((cell, i) => (
          <span key={i} className="panel-hero__cell">
            <span>{cell}</span>
          </span>
        ))}
      </div>
      <h2 className="panel-hero__words" aria-label={`${word} ${outline}`}>
        <span className="panel-hero__mask" aria-hidden="true">
          <span className="panel-hero__w1">{word}</span>
        </span>
        <span className="panel-hero__mask" aria-hidden="true">
          <span className="panel-hero__w2">{outline}</span>
        </span>
      </h2>
      <div className="panel-hero__foot">
        <span className="panel-hero__rule" aria-hidden="true" />
        {desc ? <p className="panel-hero__desc">{desc}</p> : null}
      </div>
    </header>
  );
}

/** Text + arrow link — quiet tertiary action (dup-hover slide) */
export function ArrowLink({
  children,
  href,
  onClick,
  dark = false,
}: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  dark?: boolean;
}) {
  const color = dark ? "var(--accent)" : "var(--accent)";
  const inner = (
    <span className="dup-hover" style={{ color }}>
      <span className="dup-a">
        {children} <span aria-hidden>→</span>
      </span>
      <span className="dup-b" aria-hidden>
        {children} <span>→</span>
      </span>
    </span>
  );
  const cls = "font-mono text-[12px] uppercase tracking-[0.14em] underline-offset-4 hover:underline";
  if (href)
    return (
      <a href={href} className={cls}>
        {inner}
      </a>
    );
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/** The single filled moment on a screen — accent fill, ink sweep on hover */
export function FilledButton({
  children,
  onClick,
  disabled: requestedDisabled = false,
  transaction = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  transaction?: boolean;
}) {
  const available = useContext(TransactionAvailability);
  const disabled = requestedDisabled || (transaction && !available);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-describedby={transaction && !available ? "protocol-availability" : undefined}
      className="btn btn-primary group px-6 py-3"
      style={
        disabled
          ? { background: "transparent", color: "var(--faint)", border: "1px solid var(--hairline)" }
          : { background: "var(--accent)", color: "#000", border: "1px solid var(--accent)" }
      }
    >
      {!disabled && <span className="btn__sweep" aria-hidden="true" />}
      <span className="btn__label">{children}</span>
      <span aria-hidden="true" className="btn__icon transition-transform duration-300 group-hover:translate-x-1">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m4 12 8-8M4 4h8v8" /></svg>
      </span>
    </button>
  );
}

/** Quiet secondary action — hairline outline, hover turns signal green */
export function GhostButton({
  children,
  onClick,
  disabled: requestedDisabled = false,
  transaction = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  transaction?: boolean;
}) {
  const available = useContext(TransactionAvailability);
  const disabled = requestedDisabled || (transaction && !available);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-describedby={transaction && !available ? "protocol-availability" : undefined}
      className="btn btn-secondary border px-5 py-2.5 text-ink hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40"
      style={{ borderColor: "var(--hairline)" }}
    >
      <span className="btn__label">{children}</span>
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="instrument-field block">
      <span className="field-label">
        {label}
      </span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`field-input w-full rounded-[5px] border bg-black/50 px-3.5 py-2.5 text-[14px] text-ink transition-colors placeholder:text-faint ${props.className ?? ""}`}
    />
  );
}

/** Ember carries negative states — never red (warm alarm, not danger) */
export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-[5px] border bg-surface px-3.5 py-2.5 font-mono text-[12px] leading-relaxed"
      style={{ borderColor: "var(--ember)", color: "var(--ember)" }}
    >
      {children}
    </p>
  );
}

export function OkNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="status"
      className="rounded-[5px] border bg-surface px-3.5 py-2.5 font-mono text-[12px] leading-relaxed"
      style={{ borderColor: "var(--olive)", color: "var(--olive)" }}
    >
      {children}
    </p>
  );
}

/** Lifecycle chip — mono, hairline pill, status dot (landing pg-life__chip) */
export function StatusChip({ status }: { status: "locked" | "executed" | "returned" | "rejected" | "recorded" }) {
  const color =
    status === "locked"
      ? "var(--accent)"
      : status === "executed"
        ? "var(--olive)"
        : status === "rejected"
          ? "var(--ember)"
          : "var(--muted)";
  return (
    <span
      className={`chip ${status === "locked" ? "chip--live" : ""}`}
      style={{ color, borderColor: "var(--hairline)" }}
    >
      <span className="chip__dot" />
      {status}
    </span>
  );
}

/** Generic state chip for live panel states (buried / at horizon / active…) */
export function StateChip({
  color,
  live = false,
  children,
}: {
  color: string;
  live?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`chip ${live ? "chip--live" : ""}`}
      style={{ color, borderColor: "var(--hairline)" }}
    >
      <span className="chip__dot" />
      {children}
    </span>
  );
}

/**
 * Media slot — shows /media/<name> when the generated asset exists,
 * otherwise a dark grain placeholder (assets are produced separately).
 */
export function MediaSlot({
  name,
  alt,
  className = "",
  dark = false,
}: {
  name: string;
  alt: string;
  className?: string;
  dark?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {!failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/media/${name}`}
          alt={alt}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className={`flex h-full w-full items-center justify-center ${dark ? "grain-dark" : "grain"}`}>
          <span className="font-serif text-[15px] italic" style={{ color: "var(--muted)" }}>
            {alt}
          </span>
        </div>
      )}
    </div>
  );
}

/** Hand-drawn-feel inline SVG stroke icons — 1.5px, round caps */
export function Icon({ kind, size = 20, color = "currentColor" }: { kind: "fade" | "pod" | "trigger" | "envoy" | "check" | "lock" | "arrow"; size?: number; color?: string }) {
  const s = { stroke: color, strokeWidth: 1.5, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {kind === "fade" && (
        <>
          <path {...s} d="M7 3h10M7 21h10M8 3c0 5 8 6 8 9s-8 4-8 9" />
          <path {...s} d="M12 12v3" />
        </>
      )}
      {kind === "pod" && (
        <>
          <ellipse {...s} cx="12" cy="12" rx="5" ry="8" />
          <path {...s} d="M3 18h18M4 21h16" />
        </>
      )}
      {kind === "trigger" && <path {...s} d="M13 2 6 13h5l-1 9 7-11h-5l1-9z" />}
      {kind === "envoy" && (
        <>
          <circle {...s} cx="12" cy="12" r="9" />
          <circle {...s} cx="12" cy="12" r="4.5" />
          <circle cx="12" cy="12" r="1.4" fill={color} />
        </>
      )}
      {kind === "check" && <path {...s} d="M4 12.5 9.5 18 20 6" />}
      {kind === "lock" && (
        <>
          <rect {...s} x="5" y="10" width="14" height="10" rx="2" />
          <path {...s} d="M8 10V7a4 4 0 0 1 8 0v3" />
        </>
      )}
      {kind === "arrow" && <path {...s} d="M4 12h15m0 0-6-6m6 6-6 6" />}
    </svg>
  );
}
