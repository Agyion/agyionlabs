import manifest from './release.json';
import committee from './committee.json';
import guardedManifest from './guarded-release.json';
import guardedCommittee from './guarded-committee.json';
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

export const DEFAULT_PRIVATE_RELEASE_KEY = 'private-testnet-accounting';
export type PrivateReleasePolicy = 'funding' | 'recovery';
export type PrivateReleaseOption = Readonly<{
  key: string; label: string; policy: PrivateReleasePolicy; accounting: boolean;
}>;
export type PrivateReleaseSelection = PrivateReleaseOption & Readonly<{
  assets: readonly string[]; release: PoolRelease;
}>;

// Compiled provenance is separate from cryptographic roster validity. Neither a
// backup nor an API/form/URL can add releases to this catalogue.
const current: PrivateReleaseOption = Object.freeze({
  key: DEFAULT_PRIVATE_RELEASE_KEY, label: 'Current private pool', policy: 'funding', accounting: true,
});
const original: PrivateReleaseOption = Object.freeze({
  key: 'private-testnet-original', label: 'Earlier pool recovery', policy: 'recovery', accounting: false,
});
const entries = [
  {option: current, manifest: guardedManifest, committee: guardedCommittee},
  {option: original, manifest, committee},
] as const;
const options: readonly PrivateReleaseOption[] = Object.freeze(entries.map(entry => entry.option));
const selections = new WeakSet<object>();
const verified = new Map<string, Promise<PrivateReleaseSelection>>();

export function listPrivateReleaseOptions(): readonly PrivateReleaseOption[] { return options; }
export function assertPrivateReleaseSelection(value: unknown): asserts value is PrivateReleaseSelection {
  if (typeof value !== 'object' || value === null || !selections.has(value)) throw new Error('KNOWN_PRIVATE_RELEASE_REQUIRED');
}
export async function resolvePrivateRelease(key: unknown): Promise<PrivateReleaseSelection> {
  const entry = entries.find(entry => entry.option.key === key);
  if (!entry) throw new Error('UNKNOWN_PRIVATE_RELEASE');
  const known = verified.get(entry.option.key);
  if (known) return known;
  const {option, manifest, committee} = entry;
  const checking = verifyPoolRelease({
    ...manifest,
    config: {...manifest.config, auditor: manifest.config.auditor.map(value => BigInt(value))},
  }, committee).then(release => {
    const selected = Object.freeze({...option, assets: Object.freeze([...manifest.config.assets]), release});
    selections.add(selected);
    return selected;
  });
  verified.set(option.key, checking);
  return checking;
}

function dataRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object') throw new Error();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error();
  const names = Reflect.ownKeys(value);
  if (names.length !== keys.length || !keys.every(key => names.includes(key))) throw new Error();
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw new Error();
    result[key] = descriptor.value;
  }
  return result;
}
function scopeSnapshot(value: unknown): PoolRelease['scope'] {
  try {
    const scope = dataRecord(value, ['domain', 'epoch', 'profileId']);
    const domain = dataRecord(scope.domain, ['networkId', 'contractId']);
    const hash = (value: unknown): string => {
      if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value) || /^0+$/.test(value)) throw new Error();
      return value;
    };
    if (typeof scope.epoch !== 'string' || !/^[1-9][0-9]{0,9}$/.test(scope.epoch) || BigInt(scope.epoch) > 0xffffffffn) throw new Error();
    return {domain: {networkId: hash(domain.networkId), contractId: hash(domain.contractId)}, epoch: scope.epoch, profileId: hash(scope.profileId)};
  } catch { throw new Error('INVALID_PRIVATE_RELEASE_SCOPE'); }
}
/** Unauthenticated backup metadata is only a lookup hint. Its complete encrypted
 * scope still has to pass the selected vault's authenticated restore boundary. */
export async function findPrivateReleaseForScope(value: unknown): Promise<PrivateReleaseSelection> {
  const scope = scopeSnapshot(value);
  for (const option of options) {
    const selected = await resolvePrivateRelease(option.key), known = selected.release.scope;
    if (scope.profileId === known.profileId && scope.epoch === known.epoch &&
        scope.domain.networkId === known.domain.networkId && scope.domain.contractId === known.domain.contractId) return selected;
  }
  throw new Error('UNKNOWN_PRIVATE_RELEASE_SCOPE');
}
export async function getPrivatePoolRelease(): Promise<PoolRelease> {
  return (await resolvePrivateRelease(DEFAULT_PRIVATE_RELEASE_KEY)).release;
}
