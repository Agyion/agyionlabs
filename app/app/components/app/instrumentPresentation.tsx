import type { ReactNode } from "react";
import { SECONDS_PER_LEDGER } from "../../lib/client";
import { CONFIG } from "../../lib/config";
import { formatMinor, formatRemaining, parseMinor } from "../../lib/format";
import { durationLedgers } from "./panelValidation";

/** Keep contract precision; remove only the formatter's trailing display padding. */
export function formatDraftMinor(value: bigint): string {
  return formatMinor(value, CONFIG.decimals).replace(/(\.\d*?[1-9])0+$/, "$1");
}

/** Draft-only formatting. Invalid input never becomes an invented amount. */
export function draftAmount(value: string): string {
  try { return `${formatDraftMinor(parseMinor(value))} ${CONFIG.assetCode}`; }
  catch { return "—"; }
}

export function draftDelay(value: string, label: string, minimum: number, maximum?: number): string {
  try {
    const ledgers = durationLedgers(value, label, minimum, maximum);
    return `~${formatRemaining(ledgers * SECONDS_PER_LEDGER)} · ${ledgers} ledgers`;
  } catch { return "Enter a valid duration"; }
}

export function DraftSummary({ title, rows, visual, children }: {
  title: string;
  rows: ReadonlyArray<{ label: string; value: ReactNode }>;
  visual?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <aside className="instrument-aside">
      <section className="instrument-section instrument-preview" aria-label={title}>
        <header><h3>{title}</h3></header>
        {visual && <div className="instrument-projection">{visual}</div>}
        <dl className="instrument-summary">
          {rows.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        {children}
      </section>
    </aside>
  );
}

export function InstrumentNote({ title, children }: { title: string; children: ReactNode }) {
  return <details className="instrument-context"><summary>{title}</summary><div>{children}</div></details>;
}

/** These are draft diagrams, never progress meters or evidence of a transaction. */
export function PodSeal({ prepared, saved }: { prepared: boolean; saved: boolean }) {
  const secret = prepared ? saved ? "Marked as saved" : "Save the secret" : "Not prepared";
  return (
    <div className="pod-seal" role="img" aria-label={`Pod draft: opening requires its unlock ledger, the saved secret signing locally, and recipient wallet authorization. Secret: ${secret}. This diagram does not report transaction status.`}>
      <svg viewBox="0 0 320 210" aria-hidden="true">
        <ellipse cx="160" cy="87" rx="107" ry="64" className="diagram-guide" />
        <path d="M66 56v62m188-62v62M44 87h43m146 0h43" className="diagram-guide" />
        <path d="m130 47 30-15 30 15v80l-30 15-30-15Z" className="diagram-body" />
        <path d="m130 47 30 15 30-15m-30 15v80M130 78l30 15 30-15m-60 30 30 15 30-15" className="diagram-line" />
        <path d="M112 47H91v80h21m96-80h21v80h-21" className="diagram-signal" />
        <circle cx="53" cy="87" r="9" className="diagram-node" />
        <path d="M53 81v6l4 3" className="diagram-line" />
        <circle cx="267" cy="87" r="9" className={saved ? "diagram-node is-set" : "diagram-node"} />
        <path d="m263 87 3 3 5-6" className="diagram-line" opacity={saved ? 1 : .25} />
        <path d="M160 144v28" className="diagram-guide" /><circle cx="160" cy="185" r="12" className="diagram-node" /><path d="M155 184h10m-10 4h7m-8-11h12v16h-12Z" className="diagram-line" />
      </svg>
      <div className="pod-seal__conditions"><span>Ledger lock<small>Set on creation</small></span><span>Claim key<small>{secret}</small></span><span>Recipient signature<small>Bound to your wallet</small></span></div>
    </div>
  );
}

export function ConditionGate({ keySet, beneficiary }: { keySet: boolean; beneficiary: string }) {
  return (
    <div className="condition-gate" role="img" aria-label={`Draft escrow: a valid attester proof before the deadline pays ${beneficiary}; after the deadline the funder may refund. Attester key ${keySet ? "entered, not verified" : "not set"}.`}>
      <div className="condition-gate__source"><span className="diagram-caption">Escrow</span><span className="condition-gate__gate">Attester proof<small>{keySet ? "Key entered" : "Key required"}</small></span></div>
      <svg viewBox="0 0 320 57" aria-hidden="true"><path d="M160 0v22H74v35m86-35h86v35" className="diagram-line"/><circle cx="160" cy="22" r="3" className="diagram-node is-set"/><path d="m70 51 4 5 4-5m164 0 4 5 4-5" className="diagram-line"/></svg>
      <div className="condition-gate__branches"><span><small>Proof before deadline</small>Pay beneficiary</span><span><small>After deadline</small>Funder may refund</span></div>
    </div>
  );
}

export function MandateLimits({ perClaim, dailyCap, keySet }: { perClaim: string; dailyCap: string; keySet: boolean }) {
  let ratio: number | null = null;
  let exceeds = false;
  try {
    const claim = parseMinor(perClaim), cap = parseMinor(dailyCap);
    if (claim > 0n && cap > 0n) {
      exceeds = claim > cap;
      ratio = Number((claim > cap ? cap : claim) * 10000n / cap) / 100;
    }
  } catch { /* Invalid drafts have no invented capacity. */ }
  return (
    <div className="mandate-limits" role="img" aria-label={`Draft authority: ${keySet ? "agent key generated" : "agent key not set"}. Per claim ${draftAmount(perClaim)}, daily cap ${draftAmount(dailyCap)}. ${ratio == null ? "Enter positive limits to compare capacity." : exceeds ? "Per-claim limit exceeds the daily cap." : "Bar compares the two configured limits, not spending."}`}>
      <div className="mandate-limits__authority"><span>Owner</span><svg viewBox="0 0 80 28" aria-hidden="true"><path d="M0 14h76m-7-5 7 5-7 5" className="diagram-line"/></svg><span>Agent<small>{keySet ? "Key generated" : "Key not set"}</small></span></div>
      <div className="mandate-limits__capacity"><span>Per-claim limit <b>{draftAmount(perClaim)}</b></span><div className="mandate-limits__track" aria-hidden="true">{ratio != null && <i style={{ width: `${ratio}%` }} />}</div><span>Daily cap <b>{draftAmount(dailyCap)}</b></span></div>
      {(ratio == null || exceeds) && <p>{ratio == null ? "Enter positive limits to compare capacity." : "The daily cap is lower than the per-claim limit."}</p>}
    </div>
  );
}

export function ExchangeRoute({ direction, amount }: { direction: "deposit" | "withdraw"; amount: string }) {
  let formatted = "—";
  try {
    const value = parseMinor(amount);
    if (value > 0n) formatted = formatDraftMinor(value);
  } catch { /* Keep invalid draft explicit. */ }
  const deposit = direction === "deposit";
  return (
    <div className="exchange-route" role="img" aria-label={`Draft ${direction}: ${formatted} ${deposit ? "TRY" : "USDC"} to ${deposit ? "USDC on Stellar testnet" : "simulated TRY payout"}. Entered terms, not settlement status.`}>
      <div><span className="exchange-route__currency">{deposit ? "TRY" : "USDC"}</span><span className="exchange-route__amount">{formatted}</span><small>{deposit ? "Simulated bank transfer" : "Stellar testnet"}</small></div>
      <svg viewBox="0 0 64 40" aria-hidden="true"><path d="M0 20h59m-9-8 9 8-9 8" className="diagram-line"/><path d="M8 27h30M22 13h18" className="diagram-guide"/></svg>
      <div><span className="exchange-route__currency">{deposit ? "USDC" : "TRY"}</span><span className="exchange-route__destination">{deposit ? "To your wallet" : "To your IBAN"}</span><small>{deposit ? "Stellar testnet" : "Simulated payout"}</small></div>
    </div>
  );
}
