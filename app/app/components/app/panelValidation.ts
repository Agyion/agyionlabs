import { SECONDS_PER_LEDGER } from "../../lib/client";

const MAX_LEDGER = 0xffff_ffff;

/** Validate before rounding so an invalid or negative duration cannot become the minimum. */
export function durationLedgers(minutes: string, label: string, minimum: number, maximum = MAX_LEDGER): number {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${label} must be a positive, finite number of minutes.`);
  const ledgers = Math.max(minimum, Math.round(value * 60 / SECONDS_PER_LEDGER));
  if (!Number.isSafeInteger(ledgers) || ledgers > maximum)
    throw new Error(`${label} exceeds the supported ledger duration. Choose fewer minutes.`);
  return ledgers;
}

/** Reserved ledgers leave room for any later handoff or refund required by the contract. */
export function ledgerDeadline(now: number, duration: number, label: string, reservedLedgers = 0): number {
  const deadline = now + duration;
  if (!Number.isInteger(now) || now < 0 || now > MAX_LEDGER || !Number.isSafeInteger(deadline) || deadline + reservedLedgers > MAX_LEDGER)
    throw new Error(`${label} exceeds the final usable ledger. Choose fewer minutes.`);
  return deadline;
}
