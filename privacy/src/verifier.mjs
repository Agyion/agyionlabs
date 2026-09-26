// Deliberately no installer, dependency injection, manifest loader or environment switch.
const INSTALLED_SUITES = Object.freeze([]);

export class PrivacyUnavailableError extends Error {
  constructor() {
    super('No real verifier is installed. Private transfers and proof acceptance are unavailable.');
    this.name = 'PrivacyUnavailableError';
    this.code = 'NO_INSTALLED_VERIFIER';
  }
}

export function installedSuites() { return INSTALLED_SUITES; }
export function activatePrivateTransfers() { throw new PrivacyUnavailableError(); }
export async function verifyPrivateProof() { throw new PrivacyUnavailableError(); }
