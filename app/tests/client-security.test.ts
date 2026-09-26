import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { MockAgyionClient, SorobanAgyionClient, sha256Hex } from '../app/lib/hakClient';
import { podClaimCommitment } from '../app/lib/signers';
import { parseMinor } from '../app/lib/format';
const who=Keypair.random().publicKey();
const contract='CAVVTPBBNOCMDBC26CVOXKSU7B7MDK33TXQXTVUVKSJHSVKGLZTVJ5N5';
function chain(bindings:any, signer:any={address:async()=>who,signTransaction:vi.fn()}) {
 const c=new SorobanAgyionClient({rpcUrl:'https://soroban-testnet.stellar.org',contractId:contract,networkPassphrase:'Test SDF Network ; September 2015',signer});
 (c as any).bindings=async()=>({protocol_version:async()=>({result:2}),...bindings});return c;
}
describe('confirmed chain outcomes',()=>{
 it('uses the confirmed ID, never the simulated ID',async()=>{
  const tx={result:{unwrap:()=>1n},signAndSend:async()=>({getTransactionResponse:{status:'SUCCESS',ledger:12},sendTransactionResponse:{hash:'a'.repeat(64)},result:{unwrap:()=>9n}})};
  expect(await chain({create_pod:async()=>tx}).create_pod(who,contract,1n,1,'a'.repeat(64))).toBe(9n);
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
  const create=vi.fn(); await expect(chain({protocol_version:async()=>({result:1}),create_pod:create}).create_pod(who,contract,1n,1,'a'.repeat(64))).rejects.toThrow(/version|upgrade|incompatible/i);expect(create).not.toHaveBeenCalled();
 });
 it('does not hide network errors as missing records',async()=>{
  await expect(chain({get_pod:async()=>{throw new Error('RPC error after 1 attempt')}}).get_pod(1n)).rejects.toThrow(/RPC/);
 });
 it('rejects valid-length hex followed by junk',async()=>{
  const create=vi.fn();await expect(chain({create_pod:create}).create_pod(who,contract,1n,1,'a'.repeat(64)+'zz')).rejects.toThrow(/hex|length/i);expect(create).not.toHaveBeenCalled();
 });
});
describe('strict amount parsing',()=>{
 it.each(['1 2','0.00000001','170141183460469231731687303715885'])('rejects ambiguous or overflowing input %s',(value)=>expect(()=>parseMinor(value)).toThrow());
 it('preserves all seven decimal places',()=>expect(parseMinor('12,1234567')).toBe(121234567n));
});
describe('mock follows Pod commitment rules',()=>{
 beforeEach(()=>{vi.useRealTimers()});
 it('requires an older, recipient-bound commitment',async()=>{
  vi.useFakeTimers();const c=new MockAgyionClient();const id=await c.create_pod(who,contract,1n,0,await sha256Hex('secret'));
  await expect(c.claim_pod(id,'secret',who)).rejects.toThrow();
  await c.commit_pod_claim(id,who,podClaimCommitment(id,who,'secret'));
  await expect(c.claim_pod(id,'secret',who)).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(1000);await expect(c.claim_pod(id,'secret',Keypair.random().publicKey())).rejects.toThrow();
  await c.claim_pod(id,'secret',who);expect((await c.get_pod(id))?.state).toBe(1);vi.useRealTimers();
 });
});

describe('mock ledger bounds match the kernel',()=>{
 it.each([NaN,Infinity,-1,1.5,4294967296])('rejects invalid unlock ledger %s',async(value)=>{
  await expect(new MockAgyionClient().create_pod(who,contract,1n,value,'a'.repeat(64))).rejects.toThrow(/ledger/i);
 });
 it('keeps a future refund ledger representable',async()=>{
  await expect(new MockAgyionClient().create_trigger(who,contract,1n,who,'a'.repeat(64),4294967295)).rejects.toThrow(/refund/i);
 });
});
