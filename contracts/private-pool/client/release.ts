/** Testnet release pins verified locally. This is not deployment or consensus evidence. */
import { Buffer } from 'buffer';
import { StrKey, hash, xdr } from '@stellar/stellar-sdk';
import { Client } from './bindings.ts';
import { fieldBytes } from './adapter.ts';
import { domainField, assetField } from '../../../privacy/src/identity.mjs';
import { SparseMerkleTree } from '../../../privacy/src/model.mjs';
import { parseThresholdConfig, finalizeDkgTranscript, pointToFieldElements } from '../../../privacy/src/threshold.mjs';

export const TESTNET = 'Test SDF Network ; September 2015';
export const RPC_URL = 'https://soroban-testnet.stellar.org';
export interface PoolRelease {
  readonly pool: string;
  readonly rpcUrl: typeof RPC_URL;
  readonly networkPassphrase: typeof TESTNET;
  readonly protocolVersion: 28;
  readonly wasmHash: string;
  readonly configXdr: string;
  readonly profile: Readonly<{ domain: bigint; assetPolicyRoot: bigint; epoch: bigint; auditor: readonly [bigint, bigint] }>;
  readonly scope: Readonly<{ domain: Readonly<{networkId: string; contractId: string}>; epoch: string; profileId: string }>;
}
const releases = new WeakSet<object>();
function ensure(ok: unknown, text: string): asserts ok { if (!ok) throw new Error(text); }
function exact(value: unknown, keys: string[]): Record<string, unknown> {
  ensure(value && Object.getPrototypeOf(value) === Object.prototype, 'Release object required');
  ensure(Reflect.ownKeys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k)), 'Unexpected release fields');
  return value as Record<string, unknown>;
}
// Snapshot public data without invoking getters; bound parsing before signature work.
function snapshot(value: unknown, budget = { n: 12000 }, depth = 0): unknown {
  ensure(--budget.n >= 0 && depth < 16, 'Release data exceeds bounds');
  if (value === null || ['boolean', 'number', 'bigint'].includes(typeof value)) return value;
  if (typeof value === 'string') { ensure(value.length <= 4096, 'Release string exceeds bounds'); return value; }
  ensure(value && typeof value === 'object', 'Invalid release data');
  const array = Array.isArray(value);
  ensure(Object.getPrototypeOf(value) === (array ? Array.prototype : Object.prototype), 'Plain release data required');
  const keys = Reflect.ownKeys(value);
  const result: Record<string, unknown> | unknown[] = array ? [] : {};
  if (array) ensure(value.length <= 128 && keys.length === value.length + 1, 'Dense bounded release array required');
  for (const key of keys) {
    if (array && key === 'length') continue;
    ensure(typeof key === 'string' && key !== '__proto__', 'Invalid release key');
    const d = Object.getOwnPropertyDescriptor(value, key);
    ensure(d && 'value' in d && d.enumerable, 'Release data properties required');
    if (array) ensure(/^(0|[1-9][0-9]*)$/.test(key) && Number(key) < value.length, 'Dense release array required');
    Object.defineProperty(result, key, {value: snapshot(d.value, budget, depth + 1), enumerable: true, writable: true, configurable: true});
  }
  return result;
}
function hex(value: unknown): string { ensure(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) && !/^0+$/.test(value), 'Canonical nonzero release hash required'); return value; }
export function assertPoolRelease(value: unknown): asserts value is PoolRelease {
  ensure(typeof value === 'object' && value !== null && releases.has(value), 'Verified pool release required');
}

/** Caller must obtain manifest/roster pins through a trusted release channel. */
export async function verifyPoolRelease(manifest: unknown, signedDkg: unknown): Promise<PoolRelease> {
  const m = exact(snapshot(manifest), ['schema','testOnly','networkPassphrase','rpcUrl','protocolVersion','pool','wasmHash','config','thresholdConfig']);
  const dkg = exact(snapshot(signedDkg), ['config','packages','acceptances']);
  ensure(m.schema === 'agyion-private-pool-release-v2' && m.testOnly === true, 'Experimental testnet release required');
  ensure(m.networkPassphrase === TESTNET && m.rpcUrl === RPC_URL && m.protocolVersion === 28, 'Pinned testnet network/RPC/protocol required');
  ensure(typeof m.pool === 'string' && StrKey.isValidContract(m.pool), 'Valid pool contract required');
  const pool = m.pool, wasmHash = hex(m.wasmHash);
  const config = exact(m.config, ['assets','disclosureEpoch','auditor','dkgTranscriptHash']);
  const assets = config.assets;
  ensure(Array.isArray(assets) && assets.length > 0 && assets.length <= 8 && assets.every(a => typeof a === 'string' && StrKey.isValidContract(a)) && new Set(assets).size === assets.length, 'Unique bounded asset allowlist required');
  ensure(typeof config.disclosureEpoch === 'number' && Number.isSafeInteger(config.disclosureEpoch) && config.disclosureEpoch > 0 && config.disclosureEpoch <= 0xffffffff, 'Invalid disclosure epoch');
  ensure(Array.isArray(config.auditor) && config.auditor.length === 2, 'Auditor point required');
  const auditor = config.auditor as [bigint,bigint]; auditor.forEach(fieldBytes);
  const networkId = hash(Buffer.from(TESTNET, 'utf8')).toString('hex');
  const contractId = StrKey.decodeContract(pool).toString('hex');
  const trusted = parseThresholdConfig(m.thresholdConfig), supplied = parseThresholdConfig(dkg.config);
  ensure(JSON.stringify(trusted) === JSON.stringify(supplied), 'DKG roster/configuration differs from release');
  ensure(trusted.domain.networkId === networkId && trusted.domain.contractId === contractId && trusted.epoch === String(config.disclosureEpoch), 'DKG deployment domain or epoch mismatch');
  const epoch = finalizeDkgTranscript(trusted, dkg.packages, dkg.acceptances);
  ensure(epoch.transcriptHash === hex(config.dkgTranscriptHash), 'DKG transcript mismatch');
  const publicPoint = pointToFieldElements(epoch.publicKey);
  ensure(publicPoint[0] === auditor[0] && publicPoint[1] === auditor[1], 'DKG auditor point mismatch');
  const domain = domainField({networkId, contractId});
  const assetIds = assets.map(a => assetField(StrKey.decodeContract(a).toString('hex')));
  const tree = new SparseMerkleTree(8); assetIds.forEach((id,i) => tree.set(BigInt(i), id));
  const spec = new Client({contractId: pool, networkPassphrase: TESTNET, rpcUrl: RPC_URL}).spec;
  const configXdr = spec.nativeToScVal({config: {assets, disclosure_epoch: config.disclosureEpoch, auditor_x: fieldBytes(auditor[0]), auditor_y: fieldBytes(auditor[1]), dkg_transcript_hash: Buffer.from(epoch.transcriptHash, 'hex')}, domain: fieldBytes(domain), asset_ids: assetIds.map(fieldBytes), asset_policy_root: fieldBytes(tree.root)}, xdr.ScSpecTypeDef.scSpecTypeUdt(new xdr.ScSpecTypeUdt({name:'PoolConfig'}))).toXDR('base64');
  const profileId = hash(Buffer.from(JSON.stringify(['agyion-pool-release-v2',TESTNET,RPC_URL,28,pool,wasmHash,configXdr, trusted]))).toString('hex');
  const release: PoolRelease = Object.freeze({pool,rpcUrl:RPC_URL,networkPassphrase:TESTNET,protocolVersion:28,wasmHash,configXdr,
    profile:Object.freeze({domain,assetPolicyRoot:tree.root,epoch:BigInt(config.disclosureEpoch),auditor:Object.freeze([...auditor]) as readonly [bigint,bigint]}),
    scope:Object.freeze({domain:Object.freeze({networkId,contractId}),epoch:String(config.disclosureEpoch),profileId})});
  releases.add(release); return release;
}
