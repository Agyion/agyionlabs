/**
 * walletsKit.ts: Stellar Wallets Kit integration (SPEC §4)
 *
 * One connect button → kit auth modal (currently Freighter) → signing flows into the TransactionSigner abstraction
 * (wallet.ts registerSigner is the injection point).
 *
 * Scenarios:
 *  (a) No Freighter extension: the modal shows an install label/link
 *      (init authModal.showInstallLabel).
 *  (b) xBull, LOBSTR and WalletConnect are not offered: the retained adapters
 *      cannot report the active network. Configuring a target chain is not
 *      evidence of the wallet's active network. Never relax verification to
 *      make these adapters appear supported.
 *  (d) Test secret-key mode stays in wallet.ts (demo note shown in the UI).
 *
 * The kit loads lazily, client-side only: the preact/twind modal never
 * enters SSR or the first bundle.
 */

import type { TransactionSigner } from "./agyionClient";
import { activeSigner, assertSignedTransactionMatches, registerSigner, unregisterSigner, walletSessionVersion } from "./wallet";
import { CONFIG } from "./config";
import { walletSigningError } from "./wallet-errors";
import { Networks, StrKey } from "@stellar/stellar-sdk";
import type { ModuleInterface } from "@agyion/stellar-wallets-kit/types";

type KitModule = typeof import("@agyion/stellar-wallets-kit/sdk");

let loading: Promise<KitModule> | null = null;
let connectionAttempt = 0;
let disconnecting: Promise<void> | null = null;

/** Init the kit once and return the sdk module */
function loadKit(): Promise<KitModule> {
  if (!loading) {
    loading = (async () => {
      const [sdk, types, freighter] = await Promise.all([
        import("@agyion/stellar-wallets-kit/sdk"),
        import("@agyion/stellar-wallets-kit/types"),
        import("@agyion/stellar-wallets-kit/modules/freighter"),
      ]);
      const modules = [
        new freighter.FreighterModule(),
      ];
      sdk.StellarWalletsKit.init({
        network: types.Networks.TESTNET,
        modules,
        // Scenario (a): install link for wallets that are not installed
        authModal: { showInstallLabel: true },
      });
      sdk.StellarWalletsKit.on(types.KitEventType.DISCONNECT, () => {
        if (activeSigner() instanceof KitSigner) unregisterSigner();
      });
      sdk.StellarWalletsKit.on(types.KitEventType.STATE_UPDATED, ({ payload }) => {
        const signer = activeSigner();
        if (signer instanceof KitSigner && (payload.address !== signer.connectedAddress || payload.networkPassphrase !== CONFIG.networkPassphrase)) unregisterSigner();
      });
      sdk.StellarWalletsKit.on(types.KitEventType.WALLET_SELECTED, ({ payload }) => {
        const signer = activeSigner();
        if (signer instanceof KitSigner && payload.id !== signer.walletModule.productId) unregisterSigner();
      });
      return sdk;
    })().catch((error) => { loading = null; throw error; });
  }
  return loading;
}

/** Kit signer → TransactionSigner adapter */
class KitSigner implements TransactionSigner {
  constructor(readonly connectedAddress: string, readonly walletModule: ModuleInterface, private sdk: KitModule) {}

  private async assertSession(): Promise<void> {
    if (activeSigner() !== this) throw new Error("Wallet session is disconnected. Connect again.");
    try {
      if (this.sdk.StellarWalletsKit.selectedModule !== this.walletModule) throw new Error("Wallet changed. Connect again.");
      const [{ address }, { networkPassphrase }] = await Promise.all([
        this.walletModule.getAddress({ skipRequestAccess: true }),
        this.walletModule.getNetwork(),
      ]);
      if (address !== this.connectedAddress) throw new Error("Wallet account changed. Connect again.");
      if (networkPassphrase !== CONFIG.networkPassphrase) throw new Error("Wallet is not on Stellar testnet. Switch networks and connect again.");
      if (activeSigner() !== this || this.sdk.StellarWalletsKit.selectedModule !== this.walletModule) throw new Error("Wallet session changed. Connect again.");
    } catch (error) {
      if (activeSigner() === this) unregisterSigner();
      throw error instanceof Error ? error : new Error("Cannot verify wallet account and network. Connect again.");
    }
  }

  async address(): Promise<string> {
    await this.assertSession();
    return this.connectedAddress;
  }

  async signTransaction(txXdr: string, networkPassphrase: string): Promise<string> {
    if (networkPassphrase !== CONFIG.networkPassphrase || networkPassphrase !== Networks.TESTNET) throw new Error("Wallet signing is available on Stellar testnet only.");
    await this.assertSession();
    let response: Awaited<ReturnType<ModuleInterface["signTransaction"]>>;
    try {
      response = await this.walletModule.signTransaction(txXdr, {
        networkPassphrase,
        address: this.connectedAddress,
      });
    } catch (error) { throw walletSigningError(error, this.walletModule.productId); }
    const { signedTxXdr, signerAddress } = response;
    await this.assertSession();
    if (signerAddress && signerAddress !== this.connectedAddress) throw new Error("Wallet returned a signature for a different account.");
    assertSignedTransactionMatches(txXdr, signedTxXdr, networkPassphrase, this.connectedAddress);
    return signedTxXdr;
  }
}

export interface KitConnectResult {
  address: string;
  /** Display name of the connected wallet (e.g. "Freighter") */
  walletName: string;
  /** Network passphrase reported by the wallet; null when unreadable */
  walletNetwork: string | null;
}

/**
 * Connect flow:
 * 1) In an in-app wallet browser (scenario c), connect directly, no modal.
 * 2) Otherwise open the kit auth modal; the user picks a wallet.
 * 3) Verify the account and network before registering a session-bound adapter.
 */
export async function connectWithKit(): Promise<KitConnectResult> {
  if (CONFIG.networkPassphrase !== Networks.TESTNET) throw new Error("This wallet integration supports Stellar testnet only.");
  const attempt = ++connectionAttempt;
  unregisterSigner();
  const version = walletSessionVersion();
  function assertAttempt(): void {
    if (attempt !== connectionAttempt || version !== walletSessionVersion()) throw new Error("Wallet connection cancelled because the session changed.");
  }
  if (disconnecting) await disconnecting;
  assertAttempt();
  const sdk = await loadKit();
  assertAttempt();

  // Only explicitly supported modules may participate in wrapper discovery.
  const supported = await sdk.StellarWalletsKit.refreshSupportedWallets().catch(() => []);
  assertAttempt();
  const wrapper = supported.find((w) => w.isPlatformWrapper && w.isAvailable);
  let address: string;
  if (wrapper) {
    sdk.StellarWalletsKit.setWallet(wrapper.id);
    address = (await sdk.StellarWalletsKit.fetchAddress()).address;
  } else {
    address = (await sdk.StellarWalletsKit.authModal()).address;
  }
  assertAttempt();
  if (!StrKey.isValidEd25519PublicKey(address)) throw new Error("Wallet returned an invalid account address.");

  const walletModule = sdk.StellarWalletsKit.selectedModule;
  const walletName = walletModule?.productName ?? "Wallet";

  let walletNetwork: string;
  try {
    walletNetwork = (await sdk.StellarWalletsKit.getNetwork()).networkPassphrase;
  } catch {
    throw new Error("Cannot verify this wallet's network. Use a wallet that reports Stellar testnet.");
  }
  assertAttempt();
  if (walletNetwork !== CONFIG.networkPassphrase) throw new Error("Wallet is not on Stellar testnet. Switch networks before connecting.");
  if (sdk.StellarWalletsKit.selectedModule !== walletModule || (await walletModule.getAddress({ skipRequestAccess: true })).address !== address) throw new Error("Wallet account changed while connecting. Try again.");
  assertAttempt();
  registerSigner(new KitSigner(address, walletModule, sdk));
  return { address, walletName, walletNetwork };
}

/** Disconnect the kit and clear the signer registration */
export async function disconnectKit(): Promise<void> {
  connectionAttempt++;
  unregisterSigner();
  if (disconnecting) return disconnecting;
  if (!loading) return;
  const pending = loading.then((sdk) => sdk.StellarWalletsKit.disconnect());
  disconnecting = pending;
  try { await pending; } finally { if (disconnecting === pending) disconnecting = null; }
}
