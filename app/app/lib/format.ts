/**
 * format.ts — minor-unit (7 decimals) conversions and display helpers
 */

import { CONFIG } from "./config";

const SCALE = 10n ** BigInt(CONFIG.decimals);

/** Parse "12.5" / "12,5" into minor-unit bigint. Negative supported. */
export function parseMinor(input: string): bigint {
  const s = input.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`Invalid amount: "${input}"`);
  const neg = s.startsWith("-");
  const [whole, frac = ""] = s.replace("-", "").split(".");
  if (frac.length > CONFIG.decimals) throw new Error(`Amounts support at most ${CONFIG.decimals} decimal places`);
  const fracPadded = (frac + "0".repeat(CONFIG.decimals)).slice(0, CONFIG.decimals);
  const v = BigInt(whole) * SCALE + BigInt(fracPadded || "0");
  const result = neg ? -v : v;
  if (result < -(2n ** 127n) || result > 2n ** 127n - 1n) throw new Error("Amount exceeds the contract limit");
  return result;
}

/** Format minor-unit bigint compactly: 12.5 → "12.50" */
export function formatMinor(v: bigint, maxDecimals = 2): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const whole = a / SCALE;
  const frac = (a % SCALE).toString().padStart(CONFIG.decimals, "0").replace(/0+$/, "");
  const fracShort = frac.slice(0, maxDecimals);
  const wholeGrouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${wholeGrouped}${fracShort ? "." + fracShort.padEnd(maxDecimals, "0") : ""}`;
}

/** Signed variant with explicit + for positive values (ledger tables) */
export function formatSigned(v: bigint, maxDecimals = 2): string {
  return (v > 0n ? "+" : "") + formatMinor(v, maxDecimals);
}

/** "4m 32s" / "1h 5m" style remaining-time label */
export function formatRemaining(seconds: number): string {
  if (seconds <= 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Shorten a G.../C... address: GABCD…WXYZ */
export function shortAddress(a: string): string {
  return a.length > 12 ? `${a.slice(0, 5)}…${a.slice(-4)}` : a;
}

/** Shorten a hex blob: ab12…cd34 */
export function shortHex(h: string): string {
  return h.length > 12 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h;
}
