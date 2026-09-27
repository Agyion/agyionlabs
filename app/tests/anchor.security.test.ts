import { Account, Asset, Keypair, Networks, Operation, StellarToml, Transaction, TransactionBuilder, WebAuth } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticate, clearAnchorSession, depositTry, withdrawTry, transactionStatus } from '../app/lib/anchor';
import { registerSigner, unregisterSigner } from '../app/lib/wallet';
import type { TransactionSigner } from '../app/lib/agyionClient';

const server = Keypair.random();
const client = Keypair.random();
const other = Keypair.random();
const domain = 'tr-mock-anchor.fly.dev';
const origin = `https://${domain}`;
let challenge: string;
let signedCalls = 0;
let posted = 0;
let signer: TransactionSigner;
let issuedToken: string;
function token(account = client.publicKey(), expires = Math.floor(Date.now() / 1000) + 300) {
  return `e30.${Buffer.from(JSON.stringify({ sub: account, exp: expires, iss: `${origin}/auth` })).toString('base64url')}.fixture`;
}
function validChallenge(account = client.publicKey(), source = server, homeDomain = domain) {
  return WebAuth.buildChallengeTx(source, account, homeDomain, 300, Networks.TESTNET, domain);
}
beforeEach(() => {
  clearAnchorSession(); unregisterSigner(); signedCalls = 0; posted = 0;
  challenge = validChallenge(); issuedToken = token();
  signer = {
    address: async () => client.publicKey(),
    signTransaction: async (xdr, network) => { signedCalls++; const tx = new Transaction(xdr, network); tx.sign(client); return tx.toXDR(); },
  };
  vi.spyOn(StellarToml.Resolver, 'resolve').mockResolvedValue({ SIGNING_KEY: server.publicKey(), NETWORK_PASSPHRASE: Networks.TESTNET, WEB_AUTH_ENDPOINT: `${origin}/auth` });
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === 'POST') { posted++; return new Response(JSON.stringify({ token: issuedToken })); }
    return new Response(JSON.stringify({ transaction: challenge, network_passphrase: Networks.TESTNET }));
  }));
});
afterEach(() => { clearAnchorSession(); unregisterSigner(); vi.unstubAllGlobals(); });

describe('SEP-10 challenge trust', () => {
  it('accepts a locally generated valid challenge and reuses its unexpired session', async () => {
    expect(await authenticate(signer)).toBe(issuedToken);
    expect(await authenticate(signer)).toBe(issuedToken);
    expect(signedCalls).toBe(1);
  });
  it('rejects an executable asset-moving transaction before requesting a signature', async () => {
    challenge = new TransactionBuilder(new Account(client.publicKey(), '5'), { fee: '100', networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.payment({ destination: other.publicKey(), asset: Asset.native(), amount: '10' })).setTimeout(300).build().toXDR();
    await expect(authenticate(signer)).rejects.toThrow(/challenge|sequence|SEP-10/i);
    expect(signedCalls).toBe(0); expect(posted).toBe(0);
  });
  it.each(['account', 'server', 'domain', 'unsigned', 'extra payment', 'memo', 'expired'] as const)('rejects a challenge with invalid %s', async (kind) => {
    if (kind === 'account') challenge = validChallenge(other.publicKey());
    if (kind === 'server') challenge = validChallenge(client.publicKey(), other);
    if (kind === 'domain') challenge = validChallenge(client.publicKey(), server, 'attacker.invalid');
    if (kind === 'unsigned') { const tx = new Transaction(challenge, Networks.TESTNET); tx.signatures.length = 0; challenge = tx.toXDR(); }
    if (kind === 'extra payment') {
      const original = new Transaction(challenge, Networks.TESTNET);
      const tx = new TransactionBuilder(new Account(server.publicKey(), '-1'), { fee: '100', networkPassphrase: Networks.TESTNET })
        .addOperation(Operation.manageData({ name: `${domain} auth`, value: Buffer.alloc(48).toString('base64'), source: client.publicKey() }))
        .addOperation(Operation.payment({ destination: other.publicKey(), asset: Asset.native(), amount: '1', source: client.publicKey() })).setTimeout(300).build();
      tx.sign(server); challenge = tx.toXDR(); void original;
    }
    if (kind === 'memo') challenge = WebAuth.buildChallengeTx(server, client.publicKey(), domain, 300, Networks.TESTNET, domain, '1');
    if (kind === 'expired') { vi.useFakeTimers(); vi.setSystemTime(Date.now() + 120_000); challenge = WebAuth.buildChallengeTx(server, client.publicKey(), domain, 300, Networks.TESTNET, domain); vi.setSystemTime(Date.now() + 1000_000); }
    try { await expect(authenticate(signer)).rejects.toThrow(); expect(signedCalls).toBe(0); expect(posted).toBe(0); } finally { vi.useRealTimers(); }
  });
  it('rejects a challenge when TOML discovery fails', async () => {
    vi.mocked(StellarToml.Resolver.resolve).mockRejectedValue(new Error('unavailable'));
    await expect(authenticate(signer)).rejects.toThrow(); expect(signedCalls).toBe(0);
  });
  it('rejects an anchor advertising an unexpected authentication endpoint', async () => {
    vi.mocked(StellarToml.Resolver.resolve).mockResolvedValue({ SIGNING_KEY: server.publicKey(), WEB_AUTH_ENDPOINT: 'https://attacker.invalid/auth' });
    await expect(authenticate(signer)).rejects.toThrow(); expect(signedCalls).toBe(0);
  });
  it('rejects a wallet returning different transaction content', async () => {
    signer.signTransaction = async () => validChallenge(other.publicKey());
    await expect(authenticate(signer)).rejects.toThrow(); expect(posted).toBe(0);
  });
});

describe('anchor session isolation', () => {
  it('does not promote provider-controlled payment URIs into payment instructions', async () => {
    const bearer = await authenticate(signer);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: 'withdrawal-1', account_id: other.publicKey(), memo_type: 'text', memo: 'memo', extra_info: { payment_uri: 'https://unrelated.invalid/approve', message: 'sandbox' } })));
    const instructions = await withdrawTry(bearer, '5', 'sandbox-iban');
    expect(instructions).not.toHaveProperty('paymentUri');
    expect(instructions).toMatchObject({id:'withdrawal-1', accountId:other.publicKey(), memo:'memo'});
  });
  it('accepts the anchor origin as the JWT issuer, as allowed by SEP-10', async () => {
    issuedToken = `e30.${Buffer.from(JSON.stringify({ sub: client.publicKey(), exp: Math.floor(Date.now() / 1000) + 300, iss: origin })).toString('base64url')}.fixture`;
    expect(await authenticate(signer)).toBe(issuedToken);
  });
  it('does not reuse a token across wallet signer instances for the same account', async () => {
    await authenticate(signer);
    await authenticate({ ...signer });
    expect(signedCalls).toBe(2);
  });
  it('drops the token when a registered wallet disconnects', async () => {
    registerSigner(signer); await authenticate(signer); unregisterSigner();
    await authenticate(signer); expect(signedCalls).toBe(2);
  });
  it('rejects an authentication completed after session clearing', async () => {
    const localSign = signer.signTransaction;
    signer.signTransaction = async (...args) => { const xdr = await localSign(...args); clearAnchorSession(); return xdr; };
    await expect(authenticate(signer)).rejects.toThrow(/session|changed|disconnect/i); expect(posted).toBe(0);
  });
  it('rejects an expired token instead of caching it', async () => {
    issuedToken = token(client.publicKey(), Math.floor(Date.now() / 1000) - 1);
    await expect(authenticate(signer)).rejects.toThrow(/expired|token/i);
  });
  it('rejects a token for another account', async () => {
    issuedToken = token(other.publicKey());
    await expect(authenticate(signer)).rejects.toThrow(/account|token/i);
  });
  it('does not send an old bearer token to a withdrawal endpoint after disconnect', async () => {
    registerSigner(signer); const bearer = await authenticate(signer); unregisterSigner();
    const calls = vi.mocked(fetch).mock.calls.length;
    await expect(withdrawTry(bearer, '1', 'sandbox-iban')).rejects.toThrow(/session|auth|expired/i);
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
  });
  it('rejects a deposit whose account differs from the authenticated account', async () => {
    const bearer = await authenticate(signer);
    const calls = vi.mocked(fetch).mock.calls.length;
    await expect(depositTry(bearer, other.publicKey(), '1')).rejects.toThrow(/account|session/i);
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
  });
});


describe('anchor transfer status identity', () => {
  it.each([{ transaction: { id: 'another-withdrawal', status: 'completed' } }, { transaction: { status: 'completed' } }, { transaction: null }, null])('rejects an unbound provider status %j', async body => {
    const bearer = await authenticate(signer);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(body)));
    await expect(transactionStatus(bearer, 'requested-transfer')).rejects.toThrow(/transaction|transfer|response|status/i);
  });
  it('accepts status only for the requested transfer', async () => {
    const bearer = await authenticate(signer);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ transaction: { id: 'requested-transfer', kind: 'withdrawal', status: 'completed' } })));
    await expect(transactionStatus(bearer, 'requested-transfer')).resolves.toMatchObject({ id: 'requested-transfer', status: 'completed' });
  });
});
