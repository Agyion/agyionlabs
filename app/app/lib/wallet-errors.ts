/** A signature request declined before this application receives an envelope. */
export class WalletSignatureRejectedError extends Error {
  constructor() {
    super("Signature declined in the wallet. This request was not submitted.");
    this.name = "WalletSignatureRejectedError";
  }
}

export class WalletSigningError extends Error {
  constructor() {
    super("The wallet did not return a verified signature. Check transaction activity before trying again.");
    this.name = "WalletSigningError";
  }
}

/** Only for a wallet signTransaction rejection, never a submission failure.
 * Freighter 5.48.0's API decline is an ordinary data object, not an Error.
 * Read own data descriptors so arbitrary getters/messages are not evaluated
 * or copied into application errors. Unknown shapes remain unclassified.
 */
export function walletSigningError(value: unknown, walletId: string): Error {
  try {
    if (walletId === "freighter" && value !== null && typeof value === "object" &&
        (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
      const code = Object.getOwnPropertyDescriptor(value, "code");
      const message = Object.getOwnPropertyDescriptor(value, "message");
      if (code && "value" in code && code.value === -4 && message && "value" in message &&
          message.value === "The user rejected this request.") return new WalletSignatureRejectedError();
    }
  } catch { /* Hostile proxies and malformed data are an unknown signing failure. */ }
  return new WalletSigningError();
}
