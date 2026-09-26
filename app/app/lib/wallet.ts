/**
 * wallet.ts — wallet abstraction (SPEC §4)
 *
 * "Wallet: Stellar Wallets Kit; otherwise a secret-key field in test mode
 * (shown with a demo note)."
 *
 * - The TransactionSigner interface (hakClient.ts) is wallet-agnostic.
 * - When the Wallets Kit connects, an adapter implements this interface and
 *   plugs in via registerSigner().
 * - Without the kit, TestSecretWallet: a secret-key field, testnet/demo only.
 */

import { Buffer } from "buffer";
import { Keypair, Networks, StrKey, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import type { TransactionSigner } from "./hakClient";
import { CONFIG } from "./config";

let active: TransactionSigner | null = null;
let testSigner: TestSecretWallet | null = null;
let sessionVersion = 0;
const sessionListeners = new Set<() => void>();

export function walletSessionVersion(): number { return sessionVersion; }

export function onWalletSessionChange(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => { sessionListeners.delete(listener); };
}

function changedSession(): void {
  sessionVersion++;
  for (const listener of sessionListeners) listener();
}

/** The Wallets Kit adapter (or any signer) plugs in here */
export function registerSigner(s: TransactionSigner): void {
  if (active === s) return;
  clearTestSecret();
  active = s;
  changedSession();
}

export function activeSigner(): TransactionSigner | null {
  return active;
}

/** Remove the plugged-in signer (e.g. when the kit disconnects) */
export function unregisterSigner(): void {
  active = null;
  clearTestSecret();
  changedSession();
}

/** The envelope may gain signatures, but its signed payload must not change. */
export function assertSignedTransactionMatches(
  requestedXdr: string,
  returnedXdr: string,
  networkPassphrase: string,
  expectedSigner?: string,
): void {
  const requested = TransactionBuilder.fromXDR(requestedXdr, networkPassphrase);
  const returned = TransactionBuilder.fromXDR(returnedXdr, networkPassphrase);
  if (!requested.hash().equals(returned.hash())) {
    throw new Error("Wallet returned a different transaction than requested.");
  }
  if (expectedSigner) {
    const key = Keypair.fromPublicKey(expectedSigner);
    if (!returned.signatures.some((signature) => key.verify(returned.hash(), signature.signature()))) {
      throw new Error("Wallet signature does not match the expected account and network.");
    }
  }
}

/** Test mode: signs with a secret key (shown with a demo note) */
export class TestSecretWallet implements TransactionSigner {
  private kp: Keypair | null;

  constructor(secret: string) {
    if (CONFIG.networkPassphrase !== Networks.TESTNET) {
      throw new Error("Test secrets are available on Stellar testnet only.");
    }
    this.kp = Keypair.fromSecret(secret.trim());
  }

  /** Drop the private key reference when its browser session ends. */
  revoke(): void { this.kp = null; }

  private key(): Keypair {
    if (!this.kp) throw new Error("Test wallet session is disconnected.");
    return this.kp;
  }

  async address(): Promise<string> { return this.key().publicKey(); }

  async signTransaction(txXdr: string, networkPassphrase: string): Promise<string> {
    if (networkPassphrase !== Networks.TESTNET || CONFIG.networkPassphrase !== Networks.TESTNET) {
      throw new Error("Test secrets can sign on Stellar testnet only.");
    }
    const tx = new Transaction(txXdr, networkPassphrase);
    tx.sign(this.key());
    return tx.toXDR();
  }

  /** Sign arbitrary bytes — used for the Proof Pack export signature */
  signBytes(payload: Uint8Array): string {
    return Buffer.from(this.key().sign(Buffer.from(payload))).toString("hex");
  }
}

/** Generate a fresh test keypair (friendbot-fundable) */
export function newTestKeypair(): { secret: string; address: string } {
  const kp = Keypair.random();
  return { secret: kp.secret(), address: kp.publicKey() };
}

const DEMO_ADDR_KEY = "agyion.demoAddress.v1";

/**
 * A stable demo address for mock mode when no wallet is connected.
 * Generated once per browser; only used as a recorded party string.
 */
export function demoAddress(): string {
  if (typeof window === "undefined") return Keypair.random().publicKey();
  const existing = window.localStorage.getItem(DEMO_ADDR_KEY);
  if (existing && StrKey.isValidEd25519PublicKey(existing)) return existing;
  const addr = Keypair.random().publicKey();
  window.localStorage.setItem(DEMO_ADDR_KEY, addr);
  return addr;
}

const SECRET_KEY = "agyion.testSecret.v1";

/** Remove secrets written by older builds; never read or restore them. */
function removeLegacySecret(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SECRET_KEY);
  } catch { /* Storage may be disabled; no persistence is used. */ }
}

/** Compatibility name: this returns the current in-memory test signer only. */
export function storedTestSigner(): TestSecretWallet | null {
  removeLegacySecret();
  return testSigner;
}

export function saveTestSecret(secret: string): TestSecretWallet {
  const w = new TestSecretWallet(secret);
  registerSigner(w);
  testSigner = w;
  return w;
}

export function clearTestSecret(): void {
  removeLegacySecret();
  if (!testSigner) return;
  if (active === testSigner) active = null;
  testSigner.revoke();
  testSigner = null;
  changedSession();
}

/**
 * Default signer resolution:
 * 1) the Wallets Kit adapter if plugged in,
 * 2) an explicitly entered test secret for this browser session,
 * 3) null (the UI shows the secret-key field).
 */
export function defaultSigner(): TransactionSigner | null {
  removeLegacySecret();
  return active;
}
