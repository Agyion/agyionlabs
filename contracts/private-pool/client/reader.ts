/** Pinned, read-only RPC adapter. The configured RPC is trusted, not an SCP inclusion proof. */
import { Buffer } from 'buffer';
import { Address, hash, xdr } from '@stellar/stellar-sdk';
import { Client, type PoolState as ContractState, type StoredRecord, type StoredRevocation } from './bindings.ts';
import { assertPoolRelease, type PoolRelease } from './release.ts';
import { fieldBytes } from './adapter.ts';
import { parseCore23 } from '../../../privacy/src/model.mjs';

export interface ReadOptions { signal?: AbortSignal }
export interface SnapshotOptions extends ReadOptions { snapshotId: string }
export interface PoolSnapshot {
 readonly root: bigint; readonly nextIndex: bigint; readonly recordCount: bigint;
 readonly revocationCount: bigint; readonly revocationRoot: bigint; readonly snapshotId: string;
}
export interface AcceptedPoolRecord { readonly recordId: string; readonly publicInputs: readonly bigint[] }
export interface PoolRevocation { readonly tag: bigint; readonly oldRoot: bigint; readonly newRoot: bigint }
export interface PoolReader {
 readState(options?: ReadOptions): Promise<PoolSnapshot>;
 readRecordIdAt(index: bigint, options: SnapshotOptions): Promise<string>;
 readRecord(id: string, options: SnapshotOptions): Promise<AcceptedPoolRecord>;
 readRevocationAt(index: bigint, options: SnapshotOptions): Promise<PoolRevocation>;
}
export class PoolReadError extends Error {
 constructor(readonly code: string, message: string) { super(message); this.name = 'PoolReadError'; }
}
const readers = new WeakMap<object, PoolRelease>();
export function assertPoolReader(value: unknown, release?: PoolRelease): asserts value is PoolReader {
 const pin = typeof value === 'object' && value !== null ? readers.get(value) : undefined;
 ensure(pin && (release === undefined || pin === release), 'Verified reader for this pool release required');
}
function ensure(ok: unknown, message: string, code = 'INVALID_POOL_DATA'): asserts ok { if (!ok) throw new PoolReadError(code, message); }
function uint32(v: unknown): v is number { return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffffff; }
function uint64(v: unknown): v is bigint { return typeof v === 'bigint' && v >= 0n && v < 1n << 64n; }
function hex(v: unknown): v is string { return typeof v === 'string' && /^[0-9a-f]{64}$/.test(v); }
function digest(v: Uint8Array): string { return hash(Buffer.from(v)).toString('hex'); }
function field(v: Uint8Array): bigint {
 ensure(v instanceof Uint8Array && v.length === 32, 'Expected32-byte field');
 const n = BigInt(`0x${Buffer.from(v).toString('hex')}`); fieldBytes(n); return n;
}
function abort(signal?: AbortSignal): void { signal?.throwIfAborted(); }
function backoff(milliseconds: number, signal: AbortSignal): Promise<void> {
 signal.throwIfAborted();
 return new Promise((resolve,reject) => {
  const stop = () => { clearTimeout(timer); signal.removeEventListener('abort',stop); reject(signal.reason); };
  const timer = setTimeout(() => { signal.removeEventListener('abort',stop); resolve(); },milliseconds);
  signal.addEventListener('abort',stop,{once:true});
  if(signal.aborted) stop();
 });
}
/** Only these read-only requests may retry a failed fetch. JSON, XDR, pin,
 * HTTP and archive validation failures are never retried or relaxed. All
 * attempts share the original timeout; no signing/submission API uses this. */
async function fetchRead(fetcher: typeof fetch, url: string, init: RequestInit & {signal: AbortSignal}): Promise<Response> {
 for(let attempt=0;;attempt++) {
  init.signal.throwIfAborted();
  try { return await fetcher(url,init); }
  catch(error) {
   init.signal.throwIfAborted();
   if(!(error instanceof TypeError) || attempt>=2) throw error;
   await backoff(attempt===0?200:600,init.signal);
  }
 }
}
const udt = (name: string) => xdr.ScSpecTypeDef.scSpecTypeUdt(new xdr.ScSpecTypeUdt({name}));
const key = (name: string, value?: xdr.ScVal) => xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(name), ...(value ? [value] : [])]);
const MAX_RESPONSE = 1024 * 1024;
// Keep release identity pinned to Protocol 28 while explicitly allowing the
// compatible Protocol 29 testnet upgrade. New protocol versions require review.
const SUPPORTED_PROTOCOL_VERSIONS = new Set([28, 29]);
async function boundedJson(response: Response): Promise<unknown> {
 ensure(response.ok, 'Pool RPC is unavailable', 'RPC_UNAVAILABLE');
 const length = response.headers.get('content-length');
 ensure(length === null || (/^[0-9]+$/.test(length) && Number(length) <= MAX_RESPONSE), 'Pool RPC response exceeds bounds');
 ensure(response.body, 'Empty pool RPC response');
 const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
 try {
  for (;;) { const {done,value} = await reader.read(); if (done) break; size += value.byteLength; ensure(size <= MAX_RESPONSE, 'Pool RPC response exceeds bounds'); chunks.push(value); }
 } catch (e) { await reader.cancel().catch(() => {}); throw e; }
 finally { reader.releaseLock(); }
 return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(Buffer.concat(chunks)));
}

export function createPoolReader(release: PoolRelease, options: {fetch?: typeof globalThis.fetch} = {}): PoolReader {
 assertPoolRelease(release);
 const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
 const spec = new Client({contractId:release.pool,networkPassphrase:release.networkPassphrase,rpcUrl:release.rpcUrl}).spec;
 const contract = new Address(release.pool).toScAddress();
 const persistent = (k: xdr.ScVal) => xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({contract,key:k,durability:xdr.ContractDataDurability.persistent()}));
 const instanceKey = persistent(xdr.ScVal.scvLedgerKeyContractInstance());
 const codeKey = xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({hash:Buffer.from(release.wasmHash,'hex')}));
 const snapshots = new Map<string, {value: PoolSnapshot; ledger: number}>();
 let requestId = 0;
 async function rpc(method: 'getNetwork'|'getLedgerEntries', params: unknown, signal?: AbortSignal): Promise<any> {
  abort(signal); const id = ++requestId;
  const timeout = new AbortController(); const timer = setTimeout(() => timeout.abort(new PoolReadError('RPC_UNAVAILABLE','Pool RPC timed out')), 15000);
  const forwarded = () => timeout.abort(signal?.reason); signal?.addEventListener('abort',forwarded,{once:true});
  try {
   const response = await fetchRead(fetcher,release.rpcUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),credentials:'omit',redirect:'error',cache:'no-store',signal:timeout.signal});
   const body: any = await boundedJson(response); abort(signal); timeout.signal.throwIfAborted();
   ensure(body && body.jsonrpc === '2.0' && body.id === id && Object.hasOwn(body,'result') && !Object.hasOwn(body,'error'), 'Invalid or failed pool RPC response','RPC_UNAVAILABLE');
   ensure(body.result && typeof body.result === 'object' && !Array.isArray(body.result), 'Invalid pool RPC result'); return body.result;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort',forwarded); }
 }
 async function entry(k: xdr.LedgerKey, signal?: AbortSignal, minLedger = 0): Promise<{data:xdr.LedgerEntryData;ledger:number;modified:number}> {
  const encoded = k.toXDR('base64'), response = await rpc('getLedgerEntries',{keys:[encoded]},signal);
  ensure(uint32(response.latestLedger) && response.latestLedger > 0 && response.latestLedger >= minLedger, 'Pool RPC returned an older or invalid ledger');
  ensure(Array.isArray(response.entries) && response.entries.length <= 1, 'Unexpected pool ledger entries');
  ensure(response.entries.length === 1, 'Pool archive entry unavailable; restoration may be required','ARCHIVE_UNAVAILABLE');
  const row = response.entries[0];
  ensure(row && row.key === encoded && typeof row.xdr === 'string' && row.xdr.length <= MAX_RESPONSE && uint32(row.lastModifiedLedgerSeq) && row.lastModifiedLedgerSeq > 0 && row.lastModifiedLedgerSeq <= response.latestLedger, 'Pool ledger key or metadata mismatch');
  ensure(uint32(row.liveUntilLedgerSeq) && row.liveUntilLedgerSeq >= response.latestLedger, 'Pool archive entry expired or missing TTL; restoration required','ARCHIVE_UNAVAILABLE');
  const data = xdr.LedgerEntryData.fromXDR(row.xdr, 'base64');
  ensure(data.toXDR('base64') === row.xdr, 'Noncanonical pool entry XDR');
  if (k.switch().name === 'contractData') {
   ensure(data.switch().name === 'contractData', 'Pool entry type mismatch');
   const d = data.contractData(), expected = k.contractData();
   ensure(d.contract().toXDR('base64') === expected.contract().toXDR('base64') && d.key().toXDR('base64') === expected.key().toXDR('base64') && d.durability().value === expected.durability().value, 'Pool storage identity mismatch');
  } else {
   ensure(data.switch().name === 'contractCode' && data.contractCode().hash().toString('hex') === release.wasmHash, 'Pool bytecode identity mismatch');
  }
  return {data,ledger:response.latestLedger,modified:row.lastModifiedLedgerSeq};
 }
 function decode<T>(name: string, v: xdr.ScVal): T {
  const type = udt(name), decoded = spec.scValToNative<T>(v,type);
  ensure(spec.nativeToScVal(decoded,type).toXDR('base64') === v.toXDR('base64'), 'Noncanonical pool contract value'); return decoded;
 }
 function snapshot(options: SnapshotOptions) {
  abort(options.signal); const s = snapshots.get(options.snapshotId);
  ensure(s, 'Unknown pool snapshot; read state first', 'SNAPSHOT_CHANGED'); return s;
 }
 async function archived(k: xdr.ScVal, options: SnapshotOptions) {
  const s = snapshot(options), result = await entry(persistent(k),options.signal,s.ledger);
  ensure(result.modified <= s.ledger, 'Archive changed after pool snapshot','SNAPSHOT_CHANGED');
  return result.data.contractData().val();
 }
 const reader: PoolReader = {
  async readState(options = {}) {
   const network = await rpc('getNetwork',{},options.signal);
   ensure(network.passphrase === release.networkPassphrase && network.protocolVersion >= release.protocolVersion && SUPPORTED_PROTOCOL_VERSIONS.has(network.protocolVersion), 'Pool network or protocol differs from pinned release');
   const result = await entry(instanceKey,options.signal);
   const value = result.data.contractData().val(); ensure(value.switch().name === 'scvContractInstance', 'Pool contract instance unavailable');
   const instance = value.instance(), executable = instance.executable();
   ensure(executable.switch().name === 'contractExecutableWasm' && executable.wasmHash().toString('hex') === release.wasmHash, 'Pool WASM bytecode differs from release');
   const code = await entry(codeKey,options.signal,result.ledger);
   ensure(digest(code.data.contractCode().code()) === release.wasmHash, 'Pool bytecode content differs from release');
   const storage = instance.storage(); ensure(storage && storage.length <= 16, 'Invalid pool instance storage');
   const values = new Map<string,xdr.ScVal>();
   for (const row of storage) { const name = row.key().toXDR('base64'); ensure(!values.has(name), 'Duplicate pool storage key'); values.set(name,row.val()); }
   const config = values.get(key('Config').toXDR('base64')), state = values.get(key('State').toXDR('base64'));
   ensure(config?.toXDR('base64') === release.configXdr, 'Pool immutable configuration differs from release');
   ensure(state, 'Pool state unavailable'); const s = decode<ContractState>('PoolState',state);
   ensure(uint64(s.next_index) && s.next_index <= 1n << 32n && uint64(s.record_count) && uint64(s.revocation_count), 'Invalid pool state counters');
   const root = field(s.root), revocationRoot = field(s.revocation_root);
   ensure(Array.isArray(s.roots) && s.roots.length > 0 && s.roots.length <= 64 && s.roots.map(field).at(-1) === root, 'Invalid pool root history');
   // Exclude head ledger / TTL: unrelated chain progress must not invalidate a scan.
   const snapshotId = digest(Buffer.from(JSON.stringify([release.scope.profileId,value.toXDR('base64')])));
   const current = Object.freeze({root,nextIndex:s.next_index,recordCount:s.record_count,revocationCount:s.revocation_count,revocationRoot,snapshotId});
   snapshots.set(snapshotId,{value:current,ledger:result.ledger});
   if (snapshots.size > 32) snapshots.delete(snapshots.keys().next().value!);
   return current;
  },
  async readRecordIdAt(index, options) {
   const s = snapshot(options); ensure(typeof index === 'bigint' && index >= 0n && index < s.value.recordCount, 'Record index out of range');
   const v = await archived(key('RecordIndex',xdr.ScVal.scvU64(xdr.Uint64.fromString(String(index)))),options);
   ensure(v.switch().name === 'scvBytes' && v.bytes().length === 32, 'Invalid archived record ID'); return v.bytes().toString('hex');
  },
  async readRecord(id, options) {
   ensure(hex(id), 'Canonical record ID required'); const s = snapshot(options);
   const record = decode<StoredRecord>('StoredRecord',await archived(key('Record',xdr.ScVal.scvBytes(Buffer.from(id,'hex'))),options));
   ensure(uint32(record.ledger) && record.ledger > 0 && record.ledger <= s.ledger && Array.isArray(record.public_inputs) && record.public_inputs.length === 157, 'Invalid accepted record');
   const inputs = record.public_inputs.map(field); parseCore23(inputs.slice(0,23));
   const p = release.profile;
   ensure(inputs[0] === p.domain && inputs[1] === p.assetPolicyRoot && inputs[2] === p.epoch && inputs[3] === p.auditor[0] && inputs[4] === p.auditor[1], 'Accepted record profile differs from release');
   ensure(BigInt(record.ledger) >= inputs[6] && BigInt(record.ledger) <= inputs[7], 'Accepted record ledger outside proof window');
   for (const i of [25,53,81,94,110]) ensure(inputs[i] > 0n && inputs[i] < 1n << 128n, 'Invalid accepted ciphertext nonce');
   ensure(digest(Buffer.concat(inputs.slice(23).map(fieldBytes))) === id, 'Accepted record ciphertext digest mismatch');
   return Object.freeze({recordId:id,publicInputs:Object.freeze(inputs)});
  },
  async readRevocationAt(index, options) {
   const s = snapshot(options); ensure(typeof index === 'bigint' && index >= 0n && index < s.value.revocationCount, 'Revocation index out of range');
   const r = decode<StoredRevocation>('StoredRevocation',await archived(key('RevocationIndex',xdr.ScVal.scvU64(xdr.Uint64.fromString(String(index)))),options));
   ensure(uint32(r.ledger) && r.ledger > 0 && r.ledger <= s.ledger, 'Invalid accepted revocation ledger');
   const tag = field(r.tag), oldRoot = field(r.old_root), newRoot = field(r.new_root);
   // The tag is a complete canonical Fr; only the revocation tree position masks low128 bits.
   ensure(tag > 0n && oldRoot !== newRoot, 'Invalid accepted revocation');
   return Object.freeze({tag,oldRoot,newRoot});
  },
 };
 readers.set(reader, release); return Object.freeze(reader);
}

/** Operator callback: accept only a record read between identical pinned checkpoints. */
export async function readAcceptedPoolRecord(reader: PoolReader, id: string, options: ReadOptions = {}): Promise<AcceptedPoolRecord> {
 assertPoolReader(reader);
 const before = await reader.readState(options);
 const record = await reader.readRecord(id,{...options,snapshotId:before.snapshotId});
 const after = await reader.readState(options);
 ensure(before.snapshotId === after.snapshotId, 'Pool snapshot changed during accepted record read','SNAPSHOT_CHANGED');
 return record;
}
