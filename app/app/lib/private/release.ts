import manifest from './release.json';
import committee from './committee.json';
import { verifyPoolRelease, type PoolRelease } from '../../../../contracts/private-pool/client/release';

/** This is a deployed development profile, with one local operator holding the
 * 3 of 5 trustee keys. No independent setup or custody is implied by signatures.
 */
export const privateDevelopmentProfile = Object.freeze({
  testOnly: true,
  independentSetup: false,
  independentTrustees: false,
  threshold: 3,
  trusteeCount: 5,
});

let release: Promise<PoolRelease> | undefined;
export function getPrivatePoolRelease(): Promise<PoolRelease> {
  release ??= verifyPoolRelease({
    ...manifest,
    config: {
      ...manifest.config,
      auditor: manifest.config.auditor.map(value => BigInt(value)),
    },
  }, committee);
  return release;
}
