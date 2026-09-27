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
  catch { return "Enter a valid amount"; }
}

export function draftDelay(value: string, label: string, minimum: number, maximum?: number): string {
  try {
    const ledgers = durationLedgers(value, label, minimum, maximum);
    return `~${formatRemaining(ledgers * SECONDS_PER_LEDGER)} · ${ledgers} ledgers`;
  } catch { return "Enter a valid duration"; }
}

export function InstrumentNote({ title, children }: { title: string; children: ReactNode }) {
  return <details className="instrument-context"><summary>{title}</summary><div>{children}</div></details>;
}

/** These are draft diagrams, never progress meters or evidence of a transaction. */
export function PodSeal({ prepared, saved }: { prepared: boolean; saved: boolean }) {
  const secret = prepared ? saved ? "Marked as saved" : "Save the secret" : "Not prepared";
  return (
    <div className="pod-seal" role="img" aria-label={`Pod draft: opening requires its unlock ledger, the saved secret signing locally, and recipient wallet authorization. Secret: ${secret}. This diagram does not report transaction status.`}>
      <span className="pod-key-state" data-saved={saved}>{secret}</span>
    </div>
  );
}

export function ConditionGate({ keySet, beneficiary }: { keySet: boolean; beneficiary: string }) {
  return (
    <div className="condition-gate" role="img" aria-label={`Draft escrow: a valid attester proof before the deadline pays ${beneficiary}; after the deadline the funder may refund. Attester key ${keySet ? "entered, not verified" : "not set"}.`}>
      <p>Proof before deadline pays the beneficiary.<br />After the deadline, the funder may refund.</p>
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
    <div className="mandate-limits" role="img" aria-label={`Draft authority: ${keySet ? "agent key generated" : "agent key not set"}. Per claim ${draftAmount(perClaim)}, daily cap ${draftAmount(dailyCap)}. ${ratio == null ? "Enter positive limits to compare capacity." : exceeds ? "Limit per claim exceeds the daily cap." : "Bar compares the two configured limits, not spending."}`}>
      <div className="mandate-limits__authority"><span>Owner</span><svg viewBox="0 0 80 28" aria-hidden="true"><path d="M0 14h76m-7-5 7 5-7 5" className="diagram-line"/></svg><span>Agent<small>{keySet ? "Key generated" : "Key not set"}</small></span></div>
      <div className="mandate-limits__capacity"><span>Limit per claim <b>{draftAmount(perClaim)}</b></span><div className="mandate-limits__track" aria-hidden="true">{ratio != null && <i style={{ width: `${ratio}%` }} />}</div><span>Daily cap <b>{draftAmount(dailyCap)}</b></span></div>
      {(ratio == null || exceeds) && <p>{ratio == null ? "Enter positive limits to compare capacity." : "The daily cap is lower than the limit per claim."}</p>}
    </div>
  );
}

export function ExchangeRoute({ direction, amount }: { direction: "deposit" | "withdraw"; amount: string }) {
  let formatted = "Not available";
  try {
    const value = parseMinor(amount);
    if (value > 0n) formatted = formatDraftMinor(value);
  } catch { /* Keep invalid draft explicit. */ }
  const deposit = direction === "deposit";
  return (
    <div className="exchange-route" role="img" aria-label={`Draft ${direction}: ${formatted} ${deposit ? "TRY" : "USDC"} to ${deposit ? "USDC on Stellar testnet" : "simulated TRY payout"}. Entered terms, not settlement status.`}>
      <div><span className="exchange-route__currency">{deposit ? "TRY" : "USDC"}</span><span className="exchange-route__amount">{formatted}</span></div>
      <svg viewBox="0 0 64 40" aria-hidden="true"><path d="M0 20h59m-9-8 9 8-9 8" className="diagram-line"/><path d="M8 27h30M22 13h18" className="diagram-guide"/></svg>
      <div><span className="exchange-route__currency">{deposit ? "USDC" : "TRY"}</span><span className="exchange-route__destination">{deposit ? "To your wallet" : "To your IBAN"}</span></div>
    </div>
  );
}
