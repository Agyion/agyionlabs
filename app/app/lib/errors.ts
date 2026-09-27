/**
 * errors.ts: turn raw Soroban/RPC failures into one-line human messages.
 *
 * Simulation failures arrive as a wall of diagnostic events ("HostError:
 * Error(Contract, #13) Event log (newest first): ..."). Judges should see the
 * rule that fired, not the VM trap. Our own AgyionError messages are already
 * friendly and pass through untouched.
 */

import { AgyionError } from "./agyionClient";

const CONTRACT_CODES: Record<string, string> = {
  "#1": "Record not found on the network: check the id.",
  "#2": "The state machine rejects this move (already claimed / settled / refunded).",
  "#3": "Invalid amount: check the pot, price or cap values.",
  "#4": "Invalid curve parameters: duration and handoff window must be nonzero.",
  "#5": "Too late: the deadline or window has already passed (or hasn't passed yet for refund).",
  "#6": "Still locked: the pod's unlock ledger hasn't been reached.",
  "#7": "Signature check failed: wrong preimage, wrong key, or malformed signature.",
  "#9": "Mandate cap exceeded: this claim is over the limit per transaction or per day.",
  "#10": "This mandate has expired: the agent key is inert.",
  "#11": "Unauthorized: the mandate was revoked, or you're not the owner.",
  "#12": "The contract rejected this combination (e.g. an Envoy agent may only claim at or below zero price).",
};

const PATTERNS: [RegExp, string][] = [
  [
    /trustline entry is missing/i,
    "No USDC trustline on this account: open the Ramp tab and hit “Create USDC trustline” first.",
  ],
  [
    /insufficient balance|balance.{0,20}(insufficient|not enough)|exceeds the available balance/i,
    "Not enough USDC for this: deposit TRY via the Ramp tab first.",
  ],
  [
    /account.{0,30}(not found|missing|does not exist)|no account|AccountNotFound/i,
    "This account isn't funded on testnet yet: use “Fund with friendbot” in the Ramp tab.",
  ],
  [
    /user (declined|rejected)|declined by the user|User rejected/i,
    "Signature declined in the wallet: nothing was sent.",
  ],
  [
    /switch networks|not on Stellar testnet/i,
    "Your wallet is on the wrong network: switch Freighter to TESTNET and retry.",
  ],
  [
    /Failed to fetch|NetworkError|ECONNREFUSED|ETIMEDOUT|timeout|timed out/i,
    "Network request failed. If you already approved a transaction, check its status before trying again.",
  ],
];

/** Map a raw error to a single-line, actionable message. */
export function humanizeError(e: unknown): string {
  if (e instanceof AgyionError) return e.message;
  const raw = e instanceof Error ? e.message : String(e);
  if (!raw) return "Something went wrong: please retry.";

  for (const [re, msg] of PATTERNS) {
    if (re.test(raw)) return msg;
  }

  // Kernel contract error codes: Error(Contract, #N)
  const codeMatch = raw.match(/Error\(Contract,\s*(#\d+)\)/);
  if (codeMatch && CONTRACT_CODES[codeMatch[1]]) {
    return CONTRACT_CODES[codeMatch[1]];
  }

  // Already short enough: don't mangle it
  if (raw.length <= 150 && !raw.includes("Event log")) return raw;

  // Wall-of-text fallback: first line, trimmed
  const first = raw.split("\n")[0].replace(/^Transaction simulation failed:?\s*/i, "");
  return first.length > 150 ? `${first.slice(0, 150)}…` : first;
}
