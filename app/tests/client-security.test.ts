import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { MockAgyionClient, SorobanAgyionClient } from '../app/lib/agyionClient';
import { podPublicKey, signPodCreation, signPodClaim } from '../app/lib/signers';
import { formatMinor, parseMinor } from '../app/lib/format';
import { installRecoveryLocks, recoveryTransactionFixture } from './recovery-fixture';
beforeEach(() => {
 const rows = new Map<string, string>();
 const localStorage = { get length() { return rows.size; }, key: (i: number) => [...rows.keys()][i] ?? null,
   getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value); } };
 vi.stubGlobal('window', { localStorage, dispatchEvent: () => true });
 installRecoveryLocks();
});afterEach(()=>vi.unstubAllGlobals());
const who=Keypair.random().publicKey();
const contract='CAVVTPBBNOCMDBC26CVOXKSU7B7MDK33TXQXTVUVKSJHSVKGLZTVJ5N5';
function chain(bindings:any, signer:any={address:async()=>who,signTransaction:vi.fn()}) {
 const c=new SorobanAgyionClient({rpcUrl:'https://soroban-testnet.stellar.org',contractId:contract,networkPassphrase:'Test SDF Network ; September 2015',signer});
 (c as any).bindings=async()=>({protocol_version:async()=>({result:3}),...bindings});return c;
}
describe('confirmed chain outcomes',()=>{
 it('uses the confirmed ID, never the simulated ID',async()=>{
  const {signed,hash,envelopeXdr}=recoveryTransactionFixture('confirmed-create');
  const tx={signed,result:{unwrap:()=>1n},signAndSend:async()=>({getTransactionResponse:{txHash:hash,envelopeXdr,status:'SUCCESS',ledger:12},sendTransactionResponse:{hash},result:{unwrap:()=>9n}})};
  expect(await chain({create_pod:async()=>tx}).create_pod(who,contract,1n,1,'a'.repeat(64),'b'.repeat(128))).toBe(9n);
 });
 it.each(['FAILED','NOT_FOUND'])('does not report %s as a successful claim',async(status)=>{
  const tx={result:{unwrap:()=>undefined},signAndSend:async()=>({getTransactionResponse:{status},result:{unwrap:()=>undefined}})};
  await expect(chain({claim:async()=>tx}).claim(1n,who)).rejects.toThrow(/confirm|fail|pending/i);
 });
 it('preserves a signed transaction hash when submission times out',async()=>{
  const tx={signed:{hash:()=>Buffer.from('c'.repeat(64),'hex')},signAndSend:async()=>{throw new Error('timeout')}};
  await expect(chain({claim:async()=>tx}).claim(1n,who)).rejects.toThrow('c'.repeat(64));
 });
 it('blocks old kernels before sending',async()=>{
  const create=vi.fn(); await expect(chain({protocol_version:async()=>({result:1}),create_pod:create}).create_pod(who,contract,1n,1,'a'.repeat(64),'b'.repeat(128))).rejects.toThrow(/version|upgrade|incompatible/i);expect(create).not.toHaveBeenCalled();
 });
 it('does not hide network errors as missing records',async()=>{
  await expect(chain({get_pod:async()=>{throw new Error('RPC error after 1 attempt')}}).get_pod(1n)).rejects.toThrow(/RPC/);
 });
 it('rejects valid-length hex followed by junk',async()=>{
  const create=vi.fn();await expect(chain({create_pod:create}).create_pod(who,contract,1n,1,'a'.repeat(64)+'zz','b'.repeat(128))).rejects.toThrow(/hex|length/i);expect(create).not.toHaveBeenCalled();
 });
});
describe('strict amount parsing',()=>{
 it.each(['1 2','0.00000001','170141183460469231731687303715885'])('rejects ambiguous or overflowing input %s',(value)=>expect(()=>parseMinor(value)).toThrow());
 it('preserves all seven decimal places',()=>expect(parseMinor('12,1234567')).toBe(121234567n));
 it.each([['0.009','0.009'],['-0.009','-0.009'],['0.0000001','0.0000001'],['12.1234567','12.1234567'],['12.5','12.50'],['1200','1,200']])('preserves the transaction value %s in its display',(input,shown)=>expect(formatMinor(parseMinor(input))).toBe(shown));
});
it('reports both the locked pot and positive claimant payment as mock seller proceeds',async()=>{
 const c=new MockAgyionClient();const buyer=Keypair.random().publicKey();
 const id=await c.create_fade(who,contract,100n,25n,0n,0n,1n,100,10,c.venuePubkey());
 await c.claim(id,buyer);await c.confirm_handoff(id,1n,c.mockVenueSign(id,buyer,1n));
 expect((await c.getLatestFade())?.settlement).toEqual({price:25n,claimantPaid:25n,claimantReceived:0n,sellerReceived:125n});
});
describe('mock follows Pod V3 signature rules',()=>{
 const seed='01'.repeat(32), pub=podPublicKey(seed);
 const create=(c:MockAgyionClient,amount=1n,unlock=0)=>c.create_pod(who,contract,amount,unlock,pub,signPodCreation(seed,who,contract,amount,unlock));
 it('requires the correct recipient-bound signature and permits only one opening',async()=>{
  const c=new MockAgyionClient();const id=await create(c);const signature=signPodClaim(seed,id,who);
  await expect(c.claim_pod(id,Keypair.random().publicKey(),signature)).rejects.toThrow(/signature/i);
  await expect(c.claim_pod(id,who,signPodClaim(seed,id+1n,who))).rejects.toThrow(/signature/i);
  await c.claim_pod(id,who,signature);expect((await c.get_pod(id))?.state).toBe(1);
  await expect(c.claim_pod(id,who,signature)).rejects.toThrow(/opened/i);
 });
 it('rejects creation without proof that the funder holds the matching private credential',async()=>{
  const c=new MockAgyionClient();const proof=signPodCreation(seed,who,contract,1n,0);
  await expect(c.create_pod(who,contract,2n,0,pub,proof)).rejects.toThrow(/signature|proof/i);
  await expect(c.create_pod(who,contract,1n,0,podPublicKey('02'.repeat(32)),proof)).rejects.toThrow(/signature|proof/i);
  expect(await c.listPods()).toEqual([]);
 });
 it('enforces the unlock ledger independently of a valid signature',async()=>{
  const c=new MockAgyionClient();const id=await create(c,1n,(await c.currentLedger())+10);
  await expect(c.claim_pod(id,who,signPodClaim(seed,id,who))).rejects.toThrow(/unlock|buried/i);
 });
});

describe('mock ledger bounds match the kernel',()=>{
 it.each([NaN,Infinity,-1,1.5,4294967296])('rejects invalid unlock ledger %s',async(value)=>{
  await expect(new MockAgyionClient().create_pod(who,contract,1n,value,'a'.repeat(64),'b'.repeat(128))).rejects.toThrow(/ledger/i);
 });
 it('keeps a future refund ledger representable',async()=>{
  await expect(new MockAgyionClient().create_trigger(who,contract,1n,who,'a'.repeat(64),4294967295)).rejects.toThrow(/refund/i);
 });
});
