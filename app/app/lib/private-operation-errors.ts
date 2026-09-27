import { WalletSignatureRejectedError } from './wallet-errors';

/** A local fee dialog returned false before the wallet was called. */
export class PrivateFeeConfirmationCancelledError extends Error {
  constructor() {
    super('PRIVATE_FEE_CONFIRMATION_CANCELLED');
    this.name = 'PrivateFeeConfirmationCancelledError';
  }
}

/** Only trusted, typed pre-submission cancellation. Never infer it from a
 * remote code, message, timeout or an uncertain submission result. */
export function privateCancellationMessage(error: unknown): string | null {
  if (error instanceof WalletSignatureRejectedError) return 'Signature declined in the wallet. This request was not submitted.';
  if (error instanceof PrivateFeeConfirmationCancelledError) return 'Fee confirmation cancelled. No wallet signature was requested.';
  return null;
}
