import { Account, Keypair, Networks, Operation, SorobanDataBuilder, StrKey, TransactionBuilder, rpc, xdr } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SorobanAgyionClient, type SorobanConfig } from '../app/lib/agyionClient';
import { listTransactionAttempts, rememberTransactionAttempt, updateTransactionAttempt } from '../app/lib/transactionReceipts';
import { unregisterSigner } from '../app/lib/wallet';
import { installRecoveryLocks } from './recovery-fixture';

const account = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 70)).publicKey();
const otherAccount = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 71)).publicKey();
const contractId = StrKey.encodeContract(Buffer.alloc(32, 31));
const otherContract = StrKey.encodeContract(Buffer.alloc(32, 32));
const asset = StrKey.encodeContract(Buffer.alloc(32, 33));
const network = Networks.TESTNET;
const pendingHash = 'ab'.repeat(32);
const scope = { account, network, contractId };
const values = new Map<string, string>();
const storage = { get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null,
  getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };

beforeEach(() => {
  vi.restoreAllMocks(); values.clear();
  vi.stubGlobal('window', { localStorage: storage, dispatchEvent: () => true });
  installRecoveryLocks();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('unexpected network'); }));
});
afterEach(() => vi.unstubAllGlobals());

function client(overrides: Partial<SorobanConfig> = {}) {
  const signer = overrides.signer ?? { address: async () => account, signTransaction: vi.fn() };
  const client = new SorobanAgyionClient({ contractId, networkPassphrase: network, rpcUrl: 'https://rpc.invalid', signer, ...overrides });
  const ready = vi.spyOn(client, 'protocolReadiness').mockResolvedValue('ready');
  return { client, ready, signer };
}
function stopPreparation() {
  return vi.spyOn(rpc.Server.prototype, 'getAccount').mockRejectedValue(new Error('reached SDK preparation'));
}
function pending(overrides = {}) {
  rememberTransactionAttempt({ ...scope, hash: pendingHash, action: 'claim', refId: '77', ...overrides });
}
const writes = [
  ['create_fade', (c: SorobanAgyionClient) => c.create_fade(account, asset, 100n, 10n, 0n, 1n, 1n, 20, 10, 'a'.repeat(64))],
  ['claim', (c: SorobanAgyionClient) => c.claim(1n, account)],
  ['confirm_handoff', (c: SorobanAgyionClient) => c.confirm_handoff(1n, 1n, 'a'.repeat(128))],
  ['refund', (c: SorobanAgyionClient) => c.refund(1n)],
  ['create_pod', (c: SorobanAgyionClient) => c.create_pod(account, asset, 100n, 20, 'a'.repeat(64), 'b'.repeat(128))],
  ['claim_pod', (c: SorobanAgyionClient) => c.claim_pod(1n, account, 'a'.repeat(128))],
  ['create_trigger', (c: SorobanAgyionClient) => c.create_trigger(account, asset, 100n, account, 'a'.repeat(64), 20)],
  ['attest', (c: SorobanAgyionClient) => c.attest(1n, 1n, 'a'.repeat(128))],
  ['refund_trigger', (c: SorobanAgyionClient) => c.refund_trigger(1n)],
  ['create_mandate', (c: SorobanAgyionClient) => c.create_mandate(account, 'a'.repeat(64), 100n, 200n, 20)],
  ['envoy_claim', (c: SorobanAgyionClient) => c.envoy_claim(1n, 2n, 1n, 'a'.repeat(128))],
  ['revoke_mandate', (c: SorobanAgyionClient) => c.revoke_mandate(account, 1n)],
] as const;

it.each(writes)('blocks %s before readiness and SDK preparation for another-contract unresolved source', async (_name, invoke) => {
  pending({ contractId: otherContract });
  updateTransactionAttempt(pendingHash, { ...scope, contractId: otherContract }, { status: 'unknown' });
  const f = client(), prepare = stopPreparation();
  await expect(invoke(f.client)).rejects.toThrow(pendingHash);
  expect(f.ready).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled();
  expect(f.signer.signTransaction).not.toHaveBeenCalled(); expect(listTransactionAttempts()).toHaveLength(1);
});
it.each(['action', 'contract'] as const)('holds the source lock before preparation across a different %s', async kind => {
  let finish!: () => void;
  const prepare = vi.spyOn(rpc.Server.prototype, 'getAccount').mockImplementationOnce(() => new Promise((_resolve, reject) => { finish = () => reject(new Error('first preparation stopped')); }))
    .mockRejectedValue(new Error('second unexpectedly reached preparation'));
  const a = client(), b = client(kind === 'contract' ? { contractId: otherContract } : {});
  const first = a.client.refund(1n), done = expect(first).rejects.toThrow('first preparation stopped');
  await vi.waitFor(() => expect(prepare).toHaveBeenCalledOnce());
  try {
    await expect(kind === 'action' ? b.client.refund_trigger(2n) : b.client.refund(1n)).rejects.toThrow(/another tab|awaiting/i);
    expect(b.ready).not.toHaveBeenCalled(); expect(prepare).toHaveBeenCalledOnce();
  } finally { finish(); await done; }
  expect(listTransactionAttempts()).toEqual([]);
});
it.each(['account', 'network'] as const)('does not block unrelated %s preparation', async kind => {
  let finish!: () => void;
  const prepare = vi.spyOn(rpc.Server.prototype, 'getAccount').mockImplementationOnce(() => new Promise((_resolve, reject) => { finish = () => reject(new Error('first stopped')); }))
    .mockRejectedValue(new Error('second reached preparation'));
  const a = client(), b = client(kind === 'account' ? { signer: { address: async () => otherAccount, signTransaction: vi.fn() } } : { networkPassphrase: 'isolated other network' });
  const first = a.client.refund(1n), done = expect(first).rejects.toThrow('first stopped');
  await vi.waitFor(() => expect(prepare).toHaveBeenCalledOnce());
  try { await expect(b.client.refund(1n)).rejects.toThrow('second reached preparation'); expect(prepare).toHaveBeenCalledTimes(2); }
  finally { finish(); await done; }
});
it.each(['corrupt storage', 'missing locks'] as const)('refuses %s before readiness or SDK preparation', async kind => {
  if (kind === 'corrupt storage') values.set('agyion.transactions.v1', '{bad json');
  else vi.stubGlobal('navigator', {});
  const f = client(), prepare = stopPreparation();
  await expect(f.client.refund(1n)).rejects.toThrow(kind === 'corrupt storage' ? /storage/i : /Web Locks/);
  expect(f.ready).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled();
});
it('a confirmed creation without its ID blocks only its original creation intent', async () => {
  pending({ action: 'create_pod', refId: null });
  updateTransactionAttempt(pendingHash, scope, { status: 'success', ledger: 12 });
  const prepare = stopPreparation(), f = client();
  await expect(f.client.create_pod(account, asset, 100n, 20, 'a'.repeat(64), 'b'.repeat(128))).rejects.toThrow(/confirmed/);
  expect(prepare).not.toHaveBeenCalled(); expect(f.ready).not.toHaveBeenCalled();
  await expect(f.client.refund(1n)).rejects.toThrow('reached SDK preparation');
  await expect(client({ contractId: otherContract }).client.create_pod(account, asset, 100n, 20, 'a'.repeat(64), 'b'.repeat(128))).rejects.toThrow('reached SDK preparation');
  expect(prepare).toHaveBeenCalledTimes(2); expect(listTransactionAttempts()).toHaveLength(1);
});
it.each(['success', 'failed'] as const)('permits unrelated work after actual terminal %s evidence', async status => {
  pending(); updateTransactionAttempt(pendingHash, scope, { status, ledger: 12 });
  const f = client(), prepare = stopPreparation();
  await expect(f.client.refund(1n)).rejects.toThrow('reached SDK preparation'); expect(prepare).toHaveBeenCalledOnce();
});
it.each(['account', 'network'] as const)('does not mistake another %s durable attempt for source uncertainty', async kind => {
  pending(kind === 'account' ? { account: otherAccount } : { network: 'other network' });
  const f = client(), prepare = stopPreparation();
  await expect(f.client.refund(1n)).rejects.toThrow('reached SDK preparation');
  expect(prepare).toHaveBeenCalledOnce(); expect(listTransactionAttempts()).toHaveLength(1);
});
it('refuses an account change between captured source and lazy bindings initialization', async () => {
  let current = account;
  const f = client({ signer: { address: async () => current, signTransaction: vi.fn() } }), prepare = stopPreparation();
  f.ready.mockImplementation(async () => { current = otherAccount; return 'ready'; });
  await expect(f.client.refund(1n)).rejects.toThrow(/account changed|source/i);
  expect(prepare).not.toHaveBeenCalled(); expect(listTransactionAttempts()).toEqual([]);
});
it('refuses a cached SDK account from a previous read when the signer silently changes', async () => {
  let current = otherAccount;
  const f = client({ signer: { address: async () => current, signTransaction: vi.fn() } }), prepare = stopPreparation();
  await expect(f.client.get_fade(1n)).rejects.toThrow('reached SDK preparation');
  prepare.mockClear(); current = account;
  await expect(f.client.refund(1n)).rejects.toThrow(/account changed|source/i);
  expect(prepare).not.toHaveBeenCalled(); expect(listTransactionAttempts()).toEqual([]);
});
it('rechecks the source after a record read and before writable SDK preparation', async () => {
  let current = account;
  const f = client({ expectedAssetContractId: asset, signer: { address: async () => current, signTransaction: vi.fn() } }), prepare = stopPreparation();
  vi.spyOn(f.client, 'get_fade').mockImplementation(async () => { current = otherAccount; return { asset } as Awaited<ReturnType<typeof f.client.get_fade>>; });
  await expect(f.client.refund(1n)).rejects.toThrow(/account changed|source/i);
  expect(prepare).not.toHaveBeenCalled(); expect(listTransactionAttempts()).toEqual([]);
});
it.each(['account', 'session', 'retirement'] as const)('stops %s change during real SDK simulation before signing', async kind => {
  let current = account;
  const f = client({ signer: { address: async () => current, signTransaction: vi.fn() } });
  vi.spyOn(rpc.Server.prototype, 'getAccount').mockResolvedValue(new Account(account, '10'));
  const simulate = vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockImplementation(async () => {
    if (kind === 'account') current = otherAccount;
    if (kind === 'session') unregisterSigner();
    if (kind === 'retirement') f.client.retire();
    return { id: 'synthetic', _parsed: true, latestLedger: 20, events: [], transactionData: new SorobanDataBuilder().setResources(100, 100, 100).setResourceFee('100'), minResourceFee: '100', result: { auth: [], retval: xdr.ScVal.scvVoid() } };
  });
  const send = vi.spyOn(rpc.Server.prototype, 'sendTransaction');
  await expect(f.client.refund(1n)).rejects.toThrow(/account changed|source|session changed|retired/i);
  expect(simulate).toHaveBeenCalledOnce(); expect(f.signer.signTransaction).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled(); expect(listTransactionAttempts()).toEqual([]);
});

/** Real SDK envelope; only SDK orchestration and the external transport are doubled. */
function transportFixture(hook: (f: ReturnType<typeof client>, wire: ReturnType<typeof TransactionBuilder.fromXDR>) => Promise<unknown>, overrides: Partial<SorobanConfig> = {}) {
  const f = client(overrides);
  const wire = new TransactionBuilder(new Account(account, '10'), { fee: '100', networkPassphrase: network })
    .addOperation(Operation.manageData({ name: 'source-guard-fixture', value: null })).setTimeout(0).build();
  const prepared = { signed: wire, signAndSend: vi.fn(() => hook(f, wire)) };
  const prepare = vi.fn(async () => prepared);
  vi.spyOn(f.client as unknown as { bindings(): Promise<unknown> }, 'bindings').mockResolvedValue({ refund: prepare });
  return { ...f, wire, prepared, prepare };
}
const sendVia = (f: ReturnType<typeof client>, wire: ReturnType<typeof TransactionBuilder.fromXDR>) =>
  (f.client as unknown as { server: rpc.Server }).server.sendTransaction(wire);
it('a late unresolved row during preparation blocks the wallet without journaling the new request', async () => {
  const f = transportFixture(async () => { throw new Error('wallet must not open'); });
  f.prepare.mockImplementation(async () => { pending({ contractId: otherContract }); return f.prepared; });
  await expect(f.client.refund(1n)).rejects.toThrow(pendingHash);
  expect(f.prepared.signAndSend).not.toHaveBeenCalled();
  expect(listTransactionAttempts().map(row => row.hash)).toEqual([pendingHash]);
});
it('unreadable storage discovered before transport does not manufacture an unknown signed attempt', async () => {
  const send = vi.spyOn(rpc.Server.prototype, 'sendTransaction');
  const f = transportFixture(async (f, wire) => { values.set('agyion.transactions.v1', '{bad json'); return sendVia(f, wire); });
  await expect(f.client.refund(1n)).rejects.toThrow(/storage/i);
  expect(send).not.toHaveBeenCalled();
  expect([...values.keys()]).toEqual(['agyion.transactions.v1']);
});
it('scans past its own journal hash and blocks another action/contract immediately before transport', async () => {
  const send = vi.spyOn(rpc.Server.prototype, 'sendTransaction').mockRejectedValue(new Error('transport must not start'));
  const f = transportFixture(async (f, wire) => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(200);
    pending({ contractId: otherContract });
    rememberTransactionAttempt({ ...scope, action: 'refund', refId: '1', hash: wire.hash().toString('hex') });
    expect(listTransactionAttempts()[0].hash).toBe(wire.hash().toString('hex'));
    return sendVia(f, wire);
  });
  await expect(f.client.refund(1n)).rejects.toThrow(pendingHash);
  expect(send).not.toHaveBeenCalled(); expect(listTransactionAttempts()).toHaveLength(2);
  expect(listTransactionAttempts().every(row => row.status === 'pending')).toBe(true);
});
it.each(['contract', 'action', 'reference'] as const)('does not ignore the same hash under a different %s', async kind => {
  const send = vi.spyOn(rpc.Server.prototype, 'sendTransaction');
  const f = transportFixture(async (f, wire) => {
    pending({ hash: wire.hash().toString('hex'), contractId: kind === 'contract' ? otherContract : contractId,
      action: kind === 'action' ? 'claim' : 'refund', refId: kind === 'reference' ? '2' : '1' });
    return sendVia(f, wire);
  });
  await expect(f.client.refund(1n)).rejects.toThrow(f.wire.hash().toString('hex'));
  expect(send).not.toHaveBeenCalled(); expect(listTransactionAttempts()).toHaveLength(1);
});
it('refuses a source change after signing but before transport without a phantom attempt', async () => {
  let current = account;
  const send = vi.spyOn(rpc.Server.prototype, 'sendTransaction');
  const f = transportFixture(async (f, wire) => { current = otherAccount; return sendVia(f, wire); }, { signer: { address: async () => current, signTransaction: vi.fn() } });
  await expect(f.client.refund(1n)).rejects.toThrow(/account changed|source/i);
  expect(send).not.toHaveBeenCalled(); expect(listTransactionAttempts()).toEqual([]);
});
it.each(['source', 'network'] as const)('refuses a mismatched actual transaction %s before journaling or transport', async kind => {
  const send = vi.spyOn(rpc.Server.prototype, 'sendTransaction');
  const f = transportFixture(async (f) => {
    const wrong = new TransactionBuilder(new Account(kind === 'source' ? otherAccount : account, '10'), { fee: '100', networkPassphrase: kind === 'network' ? 'other network' : network })
      .addOperation(Operation.manageData({ name: 'wrong-domain', value: null })).setTimeout(0).build();
    return sendVia(f, wrong);
  });
  await expect(f.client.refund(1n)).rejects.toThrow(/source|network|account/i);
  expect(send).not.toHaveBeenCalled(); expect(listTransactionAttempts()).toEqual([]);
});
