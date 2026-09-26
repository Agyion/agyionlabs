/**
 * agyionClient.ts — Agyion contract client (SPEC_V2)
 *
 * Mirrors protocol v3 contract signatures (other credential tags remain v2):
 *
 *   FADE    create_fade / fade_price / claim / confirm_handoff / refund / get_fade
 *   POD     create_pod / claim_pod / get_pod
 *   TRIGGER create_trigger / attest / refund_trigger / get_trigger
 *   ENVOY   create_mandate / envoy_claim / revoke_mandate / get_mandate
 *
 * Two implementations:
 *   - MockAgyionClient    : localStorage-backed demo. Uses REAL ed25519
 *                           signatures (stellar-sdk Keypair) with the exact
 *                           payload layouts the contract verifies, so the demo
 *                           exercises the same credential logic as the chain.
 *   - SorobanAgyionClient : soroban-testnet RPC via generated bindings
 *                           (app/lib/hak-bindings).
 *
 * Addresses travel as strings (G... / C...); i128/u64 as bigint; u32 as
 * number; BytesN as hex strings at the boundary (Buffer inside).
 */

import { Buffer } from "buffer";
import { Address, Keypair, StrKey, rpc } from "@stellar/stellar-sdk";
import {
  Client as BindingsClient,
  type Fade as ChainFade,
  type Pod as ChainPod,
  type Trigger as ChainTrigger,
  type Mandate as ChainMandate,
} from "@/lib/hak-bindings/src/index";
import {
  handoffPayload,
  attestPayload,
  envoyPayload,
  podCreationPayload,
  podClaimPayload,
} from "./signers";

import { withRecoveryLock } from "./recoveryStorage";
import { assertSignedTransactionMatches, walletSessionVersion } from "./wallet";
import { rememberReceipt, listTransactionAttempts, rememberTransactionAttempt, updateTransactionAttempt, unresolvedTransaction, hasTerminalTransactionEvidence, type TransactionIntent, type TransactionOutcomeResponse } from "./transactionReceipts";

// ---------------------------------------------------------------------------
// Types (SPEC_V2 — field names are sacred)
// ---------------------------------------------------------------------------

/** Fade.state: 0=open 1=claimed 2=handoff confirmed (settled) 3=refunded */
export const FADE_STATE = { Open: 0, Claimed: 1, Settled: 2, Refunded: 3 } as const;
export type FadeState = (typeof FADE_STATE)[keyof typeof FADE_STATE];

/** Pod.state: 0=buried 1=opened */
export const POD_STATE = { Buried: 0, Opened: 1 } as const;

/** Trigger.state: 0=pending 1=executed 2=refunded */
export const TRIGGER_STATE = { Pending: 0, Executed: 1, Refunded: 2 } as const;

export interface Fade {
  id: bigint;
  seller: string;
  asset: string;
  pot: bigint;
  start_price: bigint;
  floor_price: bigint; // may be negative (the below-zero moment)
  start_ledger: number;
  deadline_ledger: number;
  handoff_window: number;
  slope_num: bigint;
  slope_den: bigint; // decay per ledger (rational)
  venue_pubkey: string; // BytesN<32> hex
  state: FadeState;
  claimant: string | null;
  claimed_at: number | null;
}

export interface Pod {
  id: bigint;
  funder: string;
  asset: string;
  amount: bigint;
  unlock_ledger: number;
  claim_pubkey: string; // BytesN<32> public claim key; the seed stays off-chain
  state: 0 | 1;
}

export interface Trigger {
  id: bigint;
  funder: string;
  asset: string;
  amount: bigint;
  beneficiary: string;
  attester_pubkey: string; // BytesN<32> hex
  deadline_ledger: number;
  state: 0 | 1 | 2;
}

export interface Mandate {
  id: bigint;
  owner: string;
  agent_pubkey: string; // BytesN<32> hex
  max_per_tx: bigint;
  daily_cap: bigint;
  daily_used: bigint;
  window_start: number;
  valid_until: number;
  revoked: boolean;
  /** Successful envoy_claim count; capped on-chain at MAX_CLAIMS_PER_MANDATE */
  claims_used: number;
}

/** Settlement breakdown computed at handoff (mock keeps it for the UI) */
export interface Settlement {
  price: bigint;
  claimantPaid: bigint;
  claimantReceived: bigint;
  sellerReceived: bigint;
}

/** Contract error codes (SPEC_V2) — defined codes, no panics */
export enum AgyionErrorCode {
  NotFound = 1,
  InvalidState = 2,
  InvalidAmount = 3,
  InvalidCurve = 4,
  DeadlinePassed = 5,
  Locked = 6,
  BadSignature = 7,
  CapExceeded = 9,
  MandateExpired = 10,
  Unauthorized = 11,
  InvalidInput = 12,
  RpcError = 100,
}

export class AgyionError extends Error {
  constructor(
    public readonly code: AgyionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AgyionError";
  }
}

/** Known local refusal before transport; never describe it as an unknown broadcast. */
class NotBroadcastError extends AgyionError {
  constructor(message: string) { super(AgyionErrorCode.RpcError, message); }
}

// ---------------------------------------------------------------------------
// Price curve — linear decay, integer math, stops at the floor.
// Used identically by the mock, the UI ticker, and as a local estimate.
// ---------------------------------------------------------------------------

export function priceAtLedger(
  f: Pick<Fade, "start_price" | "floor_price" | "start_ledger" | "slope_num" | "slope_den">,
  ledger: number,
): bigint {
  const elapsed = BigInt(Math.max(0, Math.floor(ledger) - f.start_ledger));
  const decay = (elapsed * f.slope_num) / f.slope_den;
  let p = f.start_price - decay;
  if (p < f.floor_price) p = f.floor_price;
  return p;
}

// ---------------------------------------------------------------------------
// Wallet abstraction — TransactionSigner is wallet-agnostic; the Wallets Kit
// adapter (walletsKit.ts) or a TestSecretWallet (wallet.ts) plugs in.
// ---------------------------------------------------------------------------

export interface TransactionSigner {
  address(): Promise<string>;
  signTransaction(txXdr: string, networkPassphrase: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Client interface
// ---------------------------------------------------------------------------

export type ProtocolReadiness = "ready" | "incompatible" | "unavailable";

export interface AgyionClient {
  protocolReadiness?(): Promise<ProtocolReadiness>;
  // Fade
  create_fade(
    seller: string,
    asset: string,
    pot: bigint,
    start_price: bigint,
    floor_price: bigint,
    slope_num: bigint,
    slope_den: bigint,
    duration_ledgers: number,
    handoff_window: number,
    venue_pubkey: string,
  ): Promise<bigint>;
  fade_price(fade_id: bigint): Promise<bigint>;
  claim(fade_id: bigint, claimant: string): Promise<void>;
  confirm_handoff(fade_id: bigint, ts: bigint, sig: string): Promise<void>;
  refund(fade_id: bigint): Promise<void>;
  get_fade(fade_id: bigint): Promise<Fade | null>;
  // Pod
  create_pod(
    funder: string,
    asset: string,
    amount: bigint,
    unlock_ledger: number,
    claim_pubkey: string,
    key_proof: string,
  ): Promise<bigint>;
  claim_pod(pod_id: bigint, recipient: string, signature: string): Promise<void>;
  get_pod(pod_id: bigint): Promise<Pod | null>;
  // Trigger
  create_trigger(
    funder: string,
    asset: string,
    amount: bigint,
    beneficiary: string,
    attester_pubkey: string,
    deadline_ledger: number,
  ): Promise<bigint>;
  attest(trigger_id: bigint, ts: bigint, sig: string): Promise<void>;
  refund_trigger(trigger_id: bigint): Promise<void>;
  get_trigger(trigger_id: bigint): Promise<Trigger | null>;
  // Envoy
  create_mandate(
    owner: string,
    agent_pubkey: string,
    max_per_tx: bigint,
    daily_cap: bigint,
    valid_until: number,
  ): Promise<bigint>;
  envoy_claim(mandate_id: bigint, fade_id: bigint, ts: bigint, agent_sig: string): Promise<void>;
  revoke_mandate(owner: string, mandate_id: bigint): Promise<void>;
  get_mandate(mandate_id: bigint): Promise<Mandate | null>;
  // Shared
  currentLedger(): Promise<number>;
}

// ---------------------------------------------------------------------------
// MockAgyionClient — localStorage demo with real ed25519 credentials
// ---------------------------------------------------------------------------

const MOCK_KEY = "agyion.mock.v3";
/** Demo tempo: 1 ledger ≈ 1 second (testnet is ~5s; the UI wants a live tick) */
export const MOCK_LEDGER_MS = 1000;
/** Contract constant (envoy.rs): ledgers per day-window */
export const LEDGERS_PER_DAY = 17_280;
/**
 * Contract constant (envoy.rs, audit v2 fix): max successful claims per
 * mandate. Under the Envoy price<=0 restriction the monetary caps are
 * effectively dead (daily_used stays 0) — this claim-count cap is the active
 * bound on agent activity.
 */
export const MAX_CLAIMS_PER_MANDATE = 50;
function validLedger(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff;
}
function requireLedger(value: number): void {
  if (!validLedger(value)) throw new AgyionError(AgyionErrorCode.InvalidInput, "Ledger must be a finite u32 integer");
}

interface MockStore {
  epochMs: number;
  baseLedger: number;
  nextFadeId: string;
  nextPodId: string;
  nextTriggerId: string;
  nextMandateId: string;
  venueSecret: string; // demo venue ed25519 secret (S...)
  fades: MockFadeRec[];
  pods: MockPodRec[];
  triggers: MockTriggerRec[];
  mandates: MockMandateRec[];
}

interface MockFadeRec extends Omit<Fade, "id"> {
  id: string;
  settlement?: Settlement;
}
interface MockPodRec extends Omit<Pod, "id"> {
  id: string;
}
interface MockTriggerRec extends Omit<Trigger, "id"> {
  id: string;
}
interface MockMandateRec extends Omit<Mandate, "id"> {
  id: string;
}

async function sha256HexBytes(data: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Buffer.from(h).toString("hex");
}

export async function sha256Hex(input: string): Promise<string> {
  return sha256HexBytes(new TextEncoder().encode(input));
}

function loadStore(): MockStore {
  if (typeof window === "undefined") return freshStore();
  try {
    const raw = window.localStorage.getItem(MOCK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw, (_k, v) =>
        typeof v === "string" && /^-?\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v,
      ) as MockStore;
      if (validStore(parsed)) return parsed;
    }
  } catch { /* unavailable or corrupted browser storage: keep a usable in-memory demo */ }
  const s = freshStore();
  saveStore(s);
  return s;
}

function validStore(s: MockStore): boolean {
  if (!s || !Number.isSafeInteger(s.epochMs) || !Number.isSafeInteger(s.baseLedger)) return false;
  if (![s.nextFadeId, s.nextPodId, s.nextTriggerId, s.nextMandateId].every(v => typeof v === "string" && /^[1-9]\d*$/.test(v))) return false;
  try { Keypair.fromSecret(s.venueSecret); } catch { return false; }
  const groups = [[s.fades, ["pot", "start_price", "floor_price", "slope_num", "slope_den"]], [s.pods, ["amount"]], [s.triggers, ["amount"]], [s.mandates, ["max_per_tx", "daily_cap", "daily_used"]]] as const;
  return groups.every(([rows, fields]) => Array.isArray(rows) && rows.every(r => r && /^[1-9]\d*$/.test(r.id) && fields.every(k => typeof (r as unknown as Record<string, unknown>)[k] === "bigint")));
}

function freshStore(): MockStore {
  return {
    epochMs: Date.now(),
    baseLedger: 1_000_000,
    nextFadeId: "1",
    nextPodId: "1",
    nextTriggerId: "1",
    nextMandateId: "1",
    venueSecret: Keypair.random().secret(),
    fades: [],
    pods: [],
    triggers: [],
    mandates: [],
  };
}

function saveStore(s: MockStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MOCK_KEY, JSON.stringify(s, (_k, v) => (typeof v === "bigint" ? `${v}n` : v)));
  } catch { /* The in-memory demo remains usable when storage is unavailable. */ }
}

export class MockAgyionClient implements AgyionClient {
  private store: MockStore;

  constructor() {
    this.store = loadStore();
  }

  private persist(): void {
    saveStore(this.store);
  }

  currentLedger(): Promise<number> {
    const { epochMs, baseLedger } = this.store;
    return Promise.resolve(baseLedger + Math.floor((Date.now() - epochMs) / MOCK_LEDGER_MS));
  }

  /** Demo venue pubkey (BytesN<32> hex) — the seller form records this */
  venuePubkey(): string {
    return Buffer.from(Keypair.fromSecret(this.store.venueSecret).rawPublicKey()).toString("hex");
  }

  /** Demo helper: the handoff screen's "sign" button uses this (in production the venue device signs) */
  mockVenueSign(fadeId: bigint, claimant: string, ts: bigint): string {
    const kp = Keypair.fromSecret(this.store.venueSecret);
    return Buffer.from(kp.sign(handoffPayload(fadeId, claimant, ts))).toString("hex");
  }

  /** Demo reset */
  reset(): void {
    this.store = freshStore();
    this.persist();
  }

  // ---- Fade ----

  private findFade(id: bigint): MockFadeRec {
    const rec = this.store.fades.find((f) => BigInt(f.id) === id);
    if (!rec) throw new AgyionError(AgyionErrorCode.NotFound, `Fade not found: #${id}`);
    return rec;
  }

  async create_fade(
    seller: string,
    asset: string,
    pot: bigint,
    start_price: bigint,
    floor_price: bigint,
    slope_num: bigint,
    slope_den: bigint,
    duration_ledgers: number,
    handoff_window: number,
    venue_pubkey: string,
  ): Promise<bigint> {
    if (pot <= 0n || floor_price < -pot || start_price < floor_price)
      throw new AgyionError(AgyionErrorCode.InvalidAmount, "Pot must be positive and fund the price floor");
    if (slope_den <= 0n || slope_num < 0n)
      throw new AgyionError(AgyionErrorCode.InvalidCurve, "Invalid decay curve");
    if (!Number.isInteger(duration_ledgers) || duration_ledgers <= 0 || !Number.isInteger(handoff_window) || handoff_window <= 0 || duration_ledgers > 1_000_000 || handoff_window > 1_000_000)
      throw new AgyionError(AgyionErrorCode.InvalidInput, "Handoff window must be non-zero");
    const start = await this.currentLedger();
    if (!validLedger(start + duration_ledgers + handoff_window + 1))
      throw new AgyionError(AgyionErrorCode.InvalidInput, "Refund ledger exceeds the contract horizon");
    hexToBuffer(venue_pubkey, 32);
    if (/^0+$/.test(venue_pubkey)) throw new AgyionError(AgyionErrorCode.BadSignature, "Venue key cannot be zero");
    const id = BigInt(this.store.nextFadeId);
    this.store.nextFadeId = (id + 1n).toString();
    this.store.fades.push({
      id: id.toString(),
      seller,
      asset,
      pot,
      start_price,
      floor_price,
      start_ledger: start,
      deadline_ledger: start + duration_ledgers,
      handoff_window,
      slope_num,
      slope_den,
      venue_pubkey: venue_pubkey.toLowerCase(),
      state: FADE_STATE.Open,
      claimant: null,
      claimed_at: null,
    });
    this.persist();
    return id;
  }

  async fade_price(fade_id: bigint): Promise<bigint> {
    return priceAtLedger(this.findFade(fade_id), await this.currentLedger());
  }

  async claim(fade_id: bigint, claimant: string): Promise<void> {
    const rec = this.findFade(fade_id);
    if (rec.state !== FADE_STATE.Open)
      throw new AgyionError(AgyionErrorCode.InvalidState, "Fade is no longer open");
    const now = await this.currentLedger();
    if (now > rec.deadline_ledger)
      throw new AgyionError(AgyionErrorCode.DeadlinePassed, "The deadline has passed; claiming is closed");
    rec.state = FADE_STATE.Claimed;
    rec.claimant = claimant;
    rec.claimed_at = now;
    this.persist();
  }

  async confirm_handoff(fade_id: bigint, ts: bigint, sig: string): Promise<void> {
    const rec = this.findFade(fade_id);
    if (rec.state !== FADE_STATE.Claimed || rec.claimant == null || rec.claimed_at == null)
      throw new AgyionError(AgyionErrorCode.InvalidState, "Claim first, then confirm handoff");
    const now = await this.currentLedger();
    if (now > rec.claimed_at + rec.handoff_window)
      throw new AgyionError(AgyionErrorCode.DeadlinePassed, "Handoff window elapsed; refund wins");
    const payload = handoffPayload(fade_id, rec.claimant, ts);
    const sigBuf = Buffer.from(sig.trim().toLowerCase(), "hex");
    const ok = rawEd25519Verify(rec.venue_pubkey, payload, sigBuf);
    if (!ok) throw new AgyionError(AgyionErrorCode.BadSignature, "Venue signature could not be verified");

    const price = priceAtLedger(rec, rec.claimed_at);
    let claimantPaid = 0n;
    let claimantReceived = 0n;
    let sellerReceived = 0n;
    if (price > 0n) {
      claimantPaid = price;
      sellerReceived = rec.pot + price;
    } else if (price < 0n) {
      claimantReceived = -price > rec.pot ? rec.pot : -price;
      sellerReceived = rec.pot - claimantReceived;
    } else {
      sellerReceived = rec.pot;
    }
    rec.settlement = { price, claimantPaid, claimantReceived, sellerReceived };
    rec.state = FADE_STATE.Settled;
    this.persist();
  }

  async refund(fade_id: bigint): Promise<void> {
    const rec = this.findFade(fade_id);
    const now = await this.currentLedger();
    const deadlinePassedNoClaim = rec.state === FADE_STATE.Open && now > rec.deadline_ledger;
    const windowElapsedNoHandoff =
      rec.state === FADE_STATE.Claimed &&
      rec.claimed_at != null &&
      now > rec.claimed_at + rec.handoff_window;
    if (!deadlinePassedNoClaim && !windowElapsedNoHandoff)
      throw new AgyionError(
        AgyionErrorCode.Locked,
        "Refund condition not met: deadline not passed or handoff window still running",
      );
    rec.settlement = { price: 0n, claimantPaid: 0n, claimantReceived: 0n, sellerReceived: rec.pot };
    rec.state = FADE_STATE.Refunded;
    this.persist();
  }

  async get_fade(fade_id: bigint): Promise<Fade | null> {
    const rec = this.store.fades.find((f) => BigInt(f.id) === fade_id);
    return rec ? { ...rec, id: BigInt(rec.id) } : null;
  }

  /** Mock-only: latest fade with settlement (single-screen demo flow) */
  async getLatestFade(): Promise<(Fade & { settlement?: Settlement }) | null> {
    const rec = this.store.fades[this.store.fades.length - 1];
    return rec ? { ...rec, id: BigInt(rec.id), settlement: rec.settlement } : null;
  }

  /** Mock-only: all fades (Envoy agent loop watches these) */
  async listFades(): Promise<Fade[]> {
    return this.store.fades.map((f) => ({ ...f, id: BigInt(f.id) }));
  }

  // ---- Pod ----

  async create_pod(
    funder: string,
    asset: string,
    amount: bigint,
    unlock_ledger: number,
    claim_pubkey: string,
    key_proof: string,
  ): Promise<bigint> {
    if (amount <= 0n) throw new AgyionError(AgyionErrorCode.InvalidAmount, "Amount must be positive");
    requireLedger(unlock_ledger);
    hexToBuffer(claim_pubkey, 32);
    if (!rawEd25519Verify(claim_pubkey, podCreationPayload(funder, asset, amount, unlock_ledger, claim_pubkey), hexToBuffer(key_proof, 64)))
      throw new AgyionError(AgyionErrorCode.BadSignature, "Pod creation key proof could not be verified");
    const id = BigInt(this.store.nextPodId);
    this.store.nextPodId = (id + 1n).toString();
    this.store.pods.push({
      id: id.toString(),
      funder,
      asset,
      amount,
      unlock_ledger,
      claim_pubkey: claim_pubkey.toLowerCase(),
      state: POD_STATE.Buried,
    });
    this.persist();
    return id;
  }

  async claim_pod(pod_id: bigint, recipient: string, signature: string): Promise<void> {
    const rec = this.store.pods.find((p) => BigInt(p.id) === pod_id);
    if (!rec) throw new AgyionError(AgyionErrorCode.NotFound, `Pod not found: #${pod_id}`);
    if (rec.state !== POD_STATE.Buried)
      throw new AgyionError(AgyionErrorCode.InvalidState, "Pod already opened");
    if ((await this.currentLedger()) < rec.unlock_ledger)
      throw new AgyionError(AgyionErrorCode.Locked, "Pod is still buried — unlock ledger not reached");
    if (!rawEd25519Verify(rec.claim_pubkey, podClaimPayload(pod_id, recipient), hexToBuffer(signature, 64)))
      throw new AgyionError(AgyionErrorCode.BadSignature, "Pod claim signature could not be verified");
    rec.state = POD_STATE.Opened;
    this.persist();
  }

  async get_pod(pod_id: bigint): Promise<Pod | null> {
    const rec = this.store.pods.find((p) => BigInt(p.id) === pod_id);
    return rec ? { ...rec, id: BigInt(rec.id) } : null;
  }

  async listPods(): Promise<Pod[]> {
    return this.store.pods.map((p) => ({ ...p, id: BigInt(p.id) }));
  }

  // ---- Trigger ----

  async create_trigger(
    funder: string,
    asset: string,
    amount: bigint,
    beneficiary: string,
    attester_pubkey: string,
    deadline_ledger: number,
  ): Promise<bigint> {
    if (amount <= 0n) throw new AgyionError(AgyionErrorCode.InvalidAmount, "Amount must be positive");
    requireLedger(deadline_ledger);
    if (deadline_ledger <= await this.currentLedger() || deadline_ledger === 0xffff_ffff)
      throw new AgyionError(AgyionErrorCode.InvalidInput, "Deadline must be in the future with room for refund");
    hexToBuffer(attester_pubkey, 32);
    if (/^0+$/.test(attester_pubkey)) throw new AgyionError(AgyionErrorCode.BadSignature, "Attester key cannot be zero");
    const id = BigInt(this.store.nextTriggerId);
    this.store.nextTriggerId = (id + 1n).toString();
    this.store.triggers.push({
      id: id.toString(),
      funder,
      asset,
      amount,
      beneficiary,
      attester_pubkey: attester_pubkey.toLowerCase(),
      deadline_ledger,
      state: TRIGGER_STATE.Pending,
    });
    this.persist();
    return id;
  }

  async attest(trigger_id: bigint, ts: bigint, sig: string): Promise<void> {
    const rec = this.store.triggers.find((t) => BigInt(t.id) === trigger_id);
    if (!rec) throw new AgyionError(AgyionErrorCode.NotFound, `Trigger not found: #${trigger_id}`);
    if (rec.state !== TRIGGER_STATE.Pending)
      throw new AgyionError(AgyionErrorCode.InvalidState, "Trigger already resolved");
    const now = await this.currentLedger();
    if (now > rec.deadline_ledger)
      throw new AgyionError(AgyionErrorCode.DeadlinePassed, "Deadline passed; only refund remains");
    const payload = attestPayload(trigger_id, rec.beneficiary, ts);
    const sigBuf = Buffer.from(sig.trim().toLowerCase(), "hex");
    if (!rawEd25519Verify(rec.attester_pubkey, payload, sigBuf))
      throw new AgyionError(AgyionErrorCode.BadSignature, "Attester signature could not be verified");
    rec.state = TRIGGER_STATE.Executed;
    this.persist();
  }

  async refund_trigger(trigger_id: bigint): Promise<void> {
    const rec = this.store.triggers.find((t) => BigInt(t.id) === trigger_id);
    if (!rec) throw new AgyionError(AgyionErrorCode.NotFound, `Trigger not found: #${trigger_id}`);
    if (rec.state !== TRIGGER_STATE.Pending)
      throw new AgyionError(AgyionErrorCode.InvalidState, "Trigger already resolved");
    const now = await this.currentLedger();
    if (now <= rec.deadline_ledger)
      throw new AgyionError(AgyionErrorCode.Locked, "Deadline not passed yet; escrow stays locked");
    rec.state = TRIGGER_STATE.Refunded;
    this.persist();
  }

  async get_trigger(trigger_id: bigint): Promise<Trigger | null> {
    const rec = this.store.triggers.find((t) => BigInt(t.id) === trigger_id);
    return rec ? { ...rec, id: BigInt(rec.id) } : null;
  }

  async listTriggers(): Promise<Trigger[]> {
    return this.store.triggers.map((t) => ({ ...t, id: BigInt(t.id) }));
  }

  // ---- Envoy ----

  async create_mandate(
    owner: string,
    agent_pubkey: string,
    max_per_tx: bigint,
    daily_cap: bigint,
    valid_until: number,
  ): Promise<bigint> {
    if (max_per_tx <= 0n || daily_cap <= 0n || max_per_tx > daily_cap)
      throw new AgyionError(AgyionErrorCode.InvalidAmount, "Caps must be positive and per-tx <= daily");
    const now = await this.currentLedger();
    requireLedger(valid_until);
    hexToBuffer(agent_pubkey, 32);
    if (/^0+$/.test(agent_pubkey)) throw new AgyionError(AgyionErrorCode.BadSignature, "Agent key cannot be zero");
    if (valid_until <= now)
      throw new AgyionError(AgyionErrorCode.InvalidInput, "valid_until must be in the future");
    const id = BigInt(this.store.nextMandateId);
    this.store.nextMandateId = (id + 1n).toString();
    this.store.mandates.push({
      id: id.toString(),
      owner,
      agent_pubkey: agent_pubkey.toLowerCase(),
      max_per_tx,
      daily_cap,
      daily_used: 0n,
      window_start: now,
      valid_until,
      revoked: false,
      claims_used: 0,
    });
    this.persist();
    return id;
  }

  async envoy_claim(
    mandate_id: bigint,
    fade_id: bigint,
    ts: bigint,
    agent_sig: string,
  ): Promise<void> {
    const m = this.store.mandates.find((x) => BigInt(x.id) === mandate_id);
    if (!m) throw new AgyionError(AgyionErrorCode.NotFound, `Mandate not found: #${mandate_id}`);
    if (m.revoked) throw new AgyionError(AgyionErrorCode.Unauthorized, "Mandate revoked");
    const now = await this.currentLedger();
    if (now > m.valid_until)
      throw new AgyionError(AgyionErrorCode.MandateExpired, "Mandate expired");
    const payload = envoyPayload(mandate_id, fade_id, ts);
    const sigBuf = Buffer.from(agent_sig.trim().toLowerCase(), "hex");
    if (!rawEd25519Verify(m.agent_pubkey, payload, sigBuf))
      throw new AgyionError(AgyionErrorCode.BadSignature, "Agent signature could not be verified");

    const fade = this.findFade(fade_id);
    if (fade.state !== FADE_STATE.Open)
      throw new AgyionError(AgyionErrorCode.InvalidState, "Fade is no longer open");
    if (now > fade.deadline_ledger)
      throw new AgyionError(AgyionErrorCode.DeadlinePassed, "Fade deadline passed");
    const price = priceAtLedger(fade, now);
    if (price > 0n) throw new AgyionError(AgyionErrorCode.InvalidInput, "Envoy may only claim at zero or below");
    if (price > m.max_per_tx)
      throw new AgyionError(AgyionErrorCode.CapExceeded, "Price above max_per_tx — the contract said no");
    // day window rollover
    if (now >= m.window_start + LEDGERS_PER_DAY) {
      m.window_start = now;
      m.daily_used = 0n;
    }
    if (m.daily_used + price > m.daily_cap)
      throw new AgyionError(AgyionErrorCode.CapExceeded, "Daily cap would be exceeded — the contract said no");
    // Claim-count cap (mirrors envoy.rs MAX_CLAIMS_PER_MANDATE, audit v2 fix):
    // the active bound under the price<=0 restriction.
    if (m.claims_used >= MAX_CLAIMS_PER_MANDATE)
      throw new AgyionError(AgyionErrorCode.CapExceeded, `Claim limit reached (${MAX_CLAIMS_PER_MANDATE} per mandate) — the contract said no`);

    // Zero-or-below claims spend no owner funds; daily_used stays unchanged.
    m.claims_used += 1;
    fade.state = FADE_STATE.Claimed;
    fade.claimant = m.owner; // recipient is fixed to the owner
    fade.claimed_at = now;
    this.persist();
  }

  async revoke_mandate(owner: string, mandate_id: bigint): Promise<void> {
    const m = this.store.mandates.find((x) => BigInt(x.id) === mandate_id);
    if (!m) throw new AgyionError(AgyionErrorCode.NotFound, `Mandate not found: #${mandate_id}`);
    if (m.owner !== owner)
      throw new AgyionError(AgyionErrorCode.Unauthorized, "Only the owner can revoke");
    m.revoked = true;
    this.persist();
  }

  async get_mandate(mandate_id: bigint): Promise<Mandate | null> {
    const m = this.store.mandates.find((x) => BigInt(x.id) === mandate_id);
    return m ? { ...m, id: BigInt(m.id) } : null;
  }

  async listMandates(): Promise<Mandate[]> {
    return this.store.mandates.map((m) => ({ ...m, id: BigInt(m.id) }));
  }
}

// ---------------------------------------------------------------------------
// Raw ed25519 verify helper (mock) — verifies against a raw 32-byte pubkey,
// exactly what the contract's ed25519_verify does.
// ---------------------------------------------------------------------------

function rawEd25519Verify(hexPub: string, payload: Buffer, sig: Buffer): boolean {
  if (sig.length !== 64 || hexPub.length !== 64) return false;
  try {
    const kp = Keypair.fromPublicKey(StrKey.encodeEd25519PublicKey(Buffer.from(hexPub, "hex")));
    return kp.verify(payload, sig);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// SorobanAgyionClient — real soroban-testnet RPC via generated bindings
// ---------------------------------------------------------------------------

export interface SorobanConfig {
  rpcUrl: string;
  contractId: string;
  networkPassphrase: string;
  signer?: TransactionSigner;
}

function hexToBuffer(hex: string, expected?: number): Buffer {
  const clean = hex.trim().toLowerCase().replace(/^0x/, "");
  if (!/^(?:[a-f0-9]{2})*$/.test(clean)) throw new AgyionError(AgyionErrorCode.InvalidInput, "Invalid hex bytes");
  const buf = Buffer.from(clean, "hex");
  if (expected !== undefined && buf.length !== expected)
    throw new AgyionError(
      AgyionErrorCode.InvalidInput,
      `BytesN<${expected}> wrong length: ${buf.length} bytes`,
    );
  return buf;
}

function fadeFromChain(id: bigint, f: ChainFade): Fade {
  return {
    id,
    seller: f.seller,
    asset: f.asset,
    pot: f.pot,
    start_price: f.start_price,
    floor_price: f.floor_price,
    start_ledger: f.start_ledger,
    deadline_ledger: f.deadline_ledger,
    handoff_window: f.handoff_window,
    slope_num: f.slope_num,
    slope_den: f.slope_den,
    venue_pubkey: Buffer.from(f.venue_pubkey).toString("hex"),
    state: f.state as FadeState,
    claimant: f.claimant ?? null,
    claimed_at: f.claimed_at ?? null,
  };
}

function podFromChain(id: bigint, p: ChainPod): Pod {
  return {
    id,
    funder: p.funder,
    asset: p.asset,
    amount: p.amount,
    unlock_ledger: p.unlock_ledger,
    claim_pubkey: Buffer.from(p.claim_pubkey).toString("hex"),
    state: p.state as 0 | 1,
  };
}

function triggerFromChain(id: bigint, t: ChainTrigger): Trigger {
  return {
    id,
    funder: t.funder,
    asset: t.asset,
    amount: t.amount,
    beneficiary: t.beneficiary,
    attester_pubkey: Buffer.from(t.attester_pubkey).toString("hex"),
    deadline_ledger: t.deadline_ledger,
    state: t.state as 0 | 1 | 2,
  };
}

function mandateFromChain(id: bigint, m: ChainMandate): Mandate {
  return {
    id,
    owner: m.owner,
    agent_pubkey: Buffer.from(m.agent_pubkey).toString("hex"),
    max_per_tx: m.max_per_tx,
    daily_cap: m.daily_cap,
    daily_used: m.daily_used,
    window_start: m.window_start,
    valid_until: m.valid_until,
    revoked: m.revoked,
    claims_used: m.claims_used,
  };
}

function isNotFound(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /^(?:Error: )?NotFound$/.test(msg) || /Error\(Contract, #1\)/.test(msg);
}

export class SorobanAgyionClient implements AgyionClient {
  private server: rpc.Server;
  private bindingsP: Promise<BindingsClient> | null = null;
  private readonly session = walletSessionVersion();
  private intent: TransactionIntent | null = null;

  constructor(private cfg: SorobanConfig) {
    this.server = new rpc.Server(cfg.rpcUrl, {
      allowHttp: cfg.rpcUrl.startsWith("http://"),
    });
    const send = this.server.sendTransaction.bind(this.server);
    this.server.sendTransaction = async (transaction) => {
      try { this.assertSession(); }
      catch (error) { throw new NotBroadcastError(error instanceof Error ? error.message : "Wallet session changed. Nothing was sent."); }
      const intent = this.intent;
      if (!intent) throw new NotBroadcastError("Missing transaction intent; nothing was sent.");
      const hash = transaction.hash().toString("hex");
      const competing = unresolvedTransaction(intent);
      if (competing && competing.hash !== hash) throw new NotBroadcastError(
        `Another transaction for this action is unresolved. Check ${competing.hash} before retrying.`);
      // Persist BEFORE transport: a reload or lost response cannot erase a broadcast.
      try { rememberTransactionAttempt({ ...intent, hash }); }
      catch (error) { throw new NotBroadcastError(error instanceof Error ? error.message : "Could not save recovery metadata. Nothing was sent."); }
      try {
        const response = await send(transaction);
        if (response.hash !== hash) throw new Error("Submission response did not match the signed transaction.");
        // A send error may follow acceptance by another node. Only a matching
        // on-chain result with a ledger can release this action for retry.
        updateTransactionAttempt(hash, intent, { status: response.status === "PENDING" ? "pending" : "unknown" });
        return response;
      } catch (error) {
        updateTransactionAttempt(hash, intent, { status: "unknown" });
        throw error;
      }
    };
  }

  /** Lazy bindings init: the signer address resolves async on first call. */
  private bindings(): Promise<BindingsClient> {
    if (!this.bindingsP) {
      const p = (async () => {
        const publicKey = await this.cfg.signer?.address();
        return new BindingsClient({
          contractId: this.cfg.contractId,
          networkPassphrase: this.cfg.networkPassphrase,
          rpcUrl: this.cfg.rpcUrl,
          server: this.server,
          publicKey,
          signTransaction: async (txXdr, opts) => {
            this.assertSession();
            const signer = this.cfg.signer!;
            const network = opts?.networkPassphrase ?? this.cfg.networkPassphrase;
            if (network !== this.cfg.networkPassphrase) throw new Error("Unexpected signing network");
            if (await signer.address() !== publicKey) throw new Error("Wallet account changed; reconnect before continuing");
            this.assertSession();
            const signedTxXdr = await signer.signTransaction(txXdr, network);
            this.assertSession();
            if (await signer.address() !== publicKey) throw new Error("Wallet account changed while signing");
            this.assertSession();
            assertSignedTransactionMatches(txXdr, signedTxXdr, network, publicKey);
            return { signedTxXdr };
          },
          allowHttp: this.cfg.rpcUrl.startsWith("http://"),
        });
      })();
      p.catch(() => {
        if (this.bindingsP === p) this.bindingsP = null;
      });
      this.bindingsP = p;
    }
    return this.bindingsP;
  }

  private assertSession(): void {
    if (!this.cfg.signer) throw new Error("Connect a wallet to approve this transaction");
    if (walletSessionVersion() !== this.session) throw new Error("Wallet session changed; reconnect before continuing");
  }

  async protocolReadiness(): Promise<ProtocolReadiness> {
    try {
      const c = await this.bindings();
      const version = await c.protocol_version();
      return version.result === 3 ? "ready" : Number.isSafeInteger(version.result) ? "incompatible" : "unavailable";
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      // The deployed pre-v2 kernel has no version entry point. Only its explicit
      // missing-function diagnostic proves incompatibility; MissingValue alone
      // can mean unrelated VM/storage failures and must remain unavailable.
      const missingVersion = /Error\(WasmVm,\s*MissingValue\)/.test(message) &&
        /\[\s*"trying to invoke non-existent contract function"\s*,\s*protocol_version\s*\]/.test(message);
      return missingVersion ? "incompatible" : "unavailable";
    }
  }

  private async writable(): Promise<BindingsClient> {
    this.assertSession();
    const readiness = await this.protocolReadiness();
    if (readiness === "incompatible") throw new Error("This kernel needs the v3 security upgrade. Transactions are disabled for this deployment.");
    if (readiness !== "ready") throw new AgyionError(AgyionErrorCode.RpcError, "Cannot check kernel readiness. Transactions are disabled until the RPC is available; retry the readiness check.");
    this.assertSession();
    return this.bindings();
  }

  private async submit<T>(tx: { signed?: { hash(): Buffer }; signAndSend(): Promise<{ result: { unwrap(): T }; getTransactionResponse?: TransactionOutcomeResponse; sendTransactionResponse?: { hash: string } }> }, action: string, refId?: string): Promise<T> {
    this.assertSession();
    const account = await this.cfg.signer!.address();
    this.assertSession();
    const intent: TransactionIntent = { account, network: this.cfg.networkPassphrase, contractId: this.cfg.contractId, action, refId: refId ?? null };
    return withRecoveryLock(JSON.stringify(["soroban",account,intent.network,intent.contractId,action,intent.refId]), async () => {
    if (this.intent) throw new Error("Another transaction is awaiting a result. Check its status before continuing.");
    const unresolved = unresolvedTransaction(intent);
    if (unresolved) throw new AgyionError(AgyionErrorCode.RpcError, `An earlier ${action.replaceAll("_", " ")} is unresolved. Check ${unresolved.hash} in transaction activity before retrying.`);
    this.intent = intent;
    try {
      let sent: Awaited<ReturnType<typeof tx.signAndSend>>;
      try { sent = await tx.signAndSend(); }
      catch (error) {
        if (error instanceof NotBroadcastError) throw error;
        if (tx.signed) {
          const hash = tx.signed.hash().toString("hex");
          // SDK or transport adapters can fail after signing, even without a response.
          // Keep an unknown result; a signed hash alone never proves failure or success.
          if (!unresolvedTransaction(intent)) {
            const known = listTransactionAttempts(intent).find(row => row.hash === hash);
            if (known?.status === "failed") throw new AgyionError(AgyionErrorCode.RpcError, `Transaction ${hash} was rejected by the network. Review the error before retrying.`);
            if (!known) rememberTransactionAttempt({ ...intent, hash });
          }
          updateTransactionAttempt(hash, intent, { status: "unknown" });
          throw new AgyionError(AgyionErrorCode.RpcError, `Transaction outcome could not be confirmed. Check ${hash} in transaction activity before retrying.`);
        }
        throw error;
      }
      const hash = tx.signed?.hash().toString("hex");
      if (!hash) throw new AgyionError(AgyionErrorCode.RpcError, "Transaction not confirmed: the signed transaction hash is unavailable.");
      // Recovery always follows our signed envelope, never a provider's replacement hash.
      rememberTransactionAttempt({ ...intent, hash });
      const outcome = sent.getTransactionResponse;
      if (sent.sendTransactionResponse?.hash !== hash || !hasTerminalTransactionEvidence(outcome, hash, intent.network)) {
        updateTransactionAttempt(hash, intent, { status: "unknown" });
        throw new AgyionError(AgyionErrorCode.RpcError,
          `Transaction outcome could not be confirmed. Check ${hash} in transaction activity before retrying.`);
      }
      const ledger = outcome.ledger;
      updateTransactionAttempt(hash, intent, { status: outcome.status === "SUCCESS" ? "success" : "failed", ledger });
      if (outcome.status !== "SUCCESS") throw new AgyionError(AgyionErrorCode.RpcError,
        `Transaction ${hash} failed on-chain. Review its result before retrying.`);
      const result = sent.result.unwrap();
      updateTransactionAttempt(hash, intent, { status: "success", refId: refId ?? String(result), ledger });
      if (walletSessionVersion() === this.session) rememberReceipt(action, refId ?? String(result), { hash, ledger, account: intent.account, network: intent.network, contractId: intent.contractId });
      return result;
    } finally { this.intent = null; }
    });
  }

  async currentLedger(): Promise<number> {
    const latest = await this.server.getLatestLedger();
    return latest.sequence;
  }

  // ---- Fade ----

  async create_fade(
    seller: string,
    asset: string,
    pot: bigint,
    start_price: bigint,
    floor_price: bigint,
    slope_num: bigint,
    slope_den: bigint,
    duration_ledgers: number,
    handoff_window: number,
    venue_pubkey: string,
  ): Promise<bigint> {
    const c = await this.writable();
    const tx = await c.create_fade({
      seller,
      asset,
      pot,
      start_price,
      floor_price,
      slope_num,
      slope_den,
      duration_ledgers,
      handoff_window,
      venue_pubkey: hexToBuffer(venue_pubkey, 32),
    });
    return this.submit(tx, "create_fade");
  }

  async fade_price(fade_id: bigint): Promise<bigint> {
    const c = await this.bindings();
    const tx = await c.fade_price({ fade_id });
    return tx.result;
  }

  async claim(fade_id: bigint, claimant: string): Promise<void> {
    const c = await this.writable();
    const tx = await c.claim({ fade_id, claimant });
    await this.submit(tx, "claim", String(fade_id));
  }

  async confirm_handoff(fade_id: bigint, ts: bigint, sig: string): Promise<void> {
    const c = await this.writable();
    const tx = await c.confirm_handoff({ fade_id, ts, sig: hexToBuffer(sig, 64) });
    await this.submit(tx, "confirm_handoff", String(fade_id));
  }

  async refund(fade_id: bigint): Promise<void> {
    const c = await this.writable();
    const tx = await c.refund({ fade_id });
    await this.submit(tx, "refund", String(fade_id));
  }

  async get_fade(fade_id: bigint): Promise<Fade | null> {
    const c = await this.bindings();
    try {
      const tx = await c.get_fade({ fade_id });
      if (tx.result.isErr()) {
        const error = tx.result.unwrapErr();
        if (error.message === "NotFound") return null;
        throw new Error(error.message);
      }
      return fadeFromChain(fade_id, tx.result.unwrap());
    } catch (e) {
      if (isNotFound(e)) return null;
      throw rpcWrap("get_fade", e);
    }
  }

  // ---- Pod ----

  async create_pod(
    funder: string,
    asset: string,
    amount: bigint,
    unlock_ledger: number,
    claim_pubkey: string,
    key_proof: string,
  ): Promise<bigint> {
    const c = await this.writable();
    const tx = await c.create_pod({
      funder,
      asset,
      amount,
      unlock_ledger,
      claim_pubkey: hexToBuffer(claim_pubkey, 32),
      key_proof: hexToBuffer(key_proof, 64),
    });
    return this.submit(tx, "create_pod");
  }

  async claim_pod(pod_id: bigint, recipient: string, signature: string): Promise<void> {
    const c = await this.writable();
    const tx = await c.claim_pod({
      pod_id,
      recipient,
      signature: hexToBuffer(signature, 64),
    });
    await this.submit(tx, "claim_pod", String(pod_id));
  }

  async get_pod(pod_id: bigint): Promise<Pod | null> {
    const c = await this.bindings();
    try {
      const tx = await c.get_pod({ pod_id });
      if (tx.result.isErr()) {
        const error = tx.result.unwrapErr();
        if (error.message === "NotFound") return null;
        throw new Error(error.message);
      }
      return podFromChain(pod_id, tx.result.unwrap());
    } catch (e) {
      if (isNotFound(e)) return null;
      throw rpcWrap("get_pod", e);
    }
  }

  // ---- Trigger ----

  async create_trigger(
    funder: string,
    asset: string,
    amount: bigint,
    beneficiary: string,
    attester_pubkey: string,
    deadline_ledger: number,
  ): Promise<bigint> {
    const c = await this.writable();
    const tx = await c.create_trigger({
      funder,
      asset,
      amount,
      beneficiary,
      attester_pubkey: hexToBuffer(attester_pubkey, 32),
      deadline_ledger,
    });
    return this.submit(tx, "create_trigger");
  }

  async attest(trigger_id: bigint, ts: bigint, sig: string): Promise<void> {
    const c = await this.writable();
    const tx = await c.attest({ trigger_id, ts, sig: hexToBuffer(sig, 64) });
    await this.submit(tx, "attest", String(trigger_id));
  }

  async refund_trigger(trigger_id: bigint): Promise<void> {
    const c = await this.writable();
    const tx = await c.refund_trigger({ trigger_id });
    await this.submit(tx, "refund_trigger", String(trigger_id));
  }

  async get_trigger(trigger_id: bigint): Promise<Trigger | null> {
    const c = await this.bindings();
    try {
      const tx = await c.get_trigger({ trigger_id });
      if (tx.result.isErr()) {
        const error = tx.result.unwrapErr();
        if (error.message === "NotFound") return null;
        throw new Error(error.message);
      }
      return triggerFromChain(trigger_id, tx.result.unwrap());
    } catch (e) {
      if (isNotFound(e)) return null;
      throw rpcWrap("get_trigger", e);
    }
  }

  // ---- Envoy ----

  async create_mandate(
    owner: string,
    agent_pubkey: string,
    max_per_tx: bigint,
    daily_cap: bigint,
    valid_until: number,
  ): Promise<bigint> {
    const c = await this.writable();
    const tx = await c.create_mandate({
      owner,
      agent_pubkey: hexToBuffer(agent_pubkey, 32),
      max_per_tx,
      daily_cap,
      valid_until,
    });
    return this.submit(tx, "create_mandate");
  }

  async envoy_claim(mandate_id: bigint, fade_id: bigint, ts: bigint, agent_sig: string): Promise<void> {
    const c = await this.writable();
    const tx = await c.envoy_claim({
      mandate_id,
      fade_id,
      ts,
      agent_sig: hexToBuffer(agent_sig, 64),
    });
    await this.submit(tx, "envoy_claim", `${mandate_id}→${fade_id}`);
  }

  async revoke_mandate(owner: string, mandate_id: bigint): Promise<void> {
    const c = await this.writable();
    const tx = await c.revoke_mandate({ owner, mandate_id });
    await this.submit(tx, "revoke_mandate", String(mandate_id));
  }

  async get_mandate(mandate_id: bigint): Promise<Mandate | null> {
    const c = await this.bindings();
    try {
      const tx = await c.get_mandate({ mandate_id });
      if (tx.result.isErr()) {
        const error = tx.result.unwrapErr();
        if (error.message === "NotFound") return null;
        throw new Error(error.message);
      }
      return mandateFromChain(mandate_id, tx.result.unwrap());
    } catch (e) {
      if (isNotFound(e)) return null;
      throw rpcWrap("get_mandate", e);
    }
  }
}

function rpcWrap(method: string, e: unknown): AgyionError {
  return new AgyionError(
    AgyionErrorCode.RpcError,
    `${method} simulation failed: ${e instanceof Error ? e.message : String(e)}`,
  );
}

// Re-export so panels can build payloads without importing two modules
export { handoffPayload, attestPayload, envoyPayload, Address };
