import { describe, expect, it } from 'vitest';
import { Keypair, StrKey, Address, hash } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import { handoffPayload, attestPayload, envoyPayload, podClaimCommitment } from '../app/lib/signers';
const recipient=Keypair.fromRawEd25519Seed(Buffer.alloc(32,1)).publicKey();
const contractId=StrKey.encodeContract(Buffer.alloc(32,2));
const domain={contractId,networkPassphrase:'Test SDF Network ; September 2015'};
describe('credential domain separation',()=>{
 it('cannot reuse a handoff signature as a Trigger attestation',()=>{expect(handoffPayload(1n,recipient,2n).equals(attestPayload(1n,recipient,2n))).toBe(false)});
 it('binds a credential to a deployment and network',()=>{
   const first=handoffPayload(1n,recipient,2n,domain);
   expect(first.equals(handoffPayload(1n,recipient,2n,{...domain,contractId:StrKey.encodeContract(Buffer.alloc(32,3))}))).toBe(false);
   expect(first.equals(handoffPayload(1n,recipient,2n,{...domain,networkPassphrase:'Public Global Stellar Network ; September 2015'}))).toBe(false);
 });
 it('uses the exact Rust v2 domain byte layout',()=>{
   const id=Buffer.alloc(8);id.writeBigUInt64BE(1n);const ts=Buffer.alloc(8);ts.writeBigUInt64BE(2n);
   expect(handoffPayload(1n,recipient,2n,domain)).toEqual(Buffer.concat([Buffer.from('agyion:handoff:v2\0'),hash(Buffer.from(domain.networkPassphrase)),new Address(contractId).toScVal().toXDR(),id,new Address(recipient).toScVal().toXDR(),ts]));
 });
 it('binds pod commitments to recipient and pod without publishing the secret',()=>{
   const first=podClaimCommitment(1n,recipient,'hidden-value',domain);
   expect(first).toMatch(/^[a-f0-9]{64}$/);
   expect(first).not.toEqual(podClaimCommitment(2n,recipient,'hidden-value',domain));
   expect(first).not.toEqual(podClaimCommitment(1n,Keypair.random().publicKey(),'hidden-value',domain));
   expect(envoyPayload(1n,2n,3n,domain).subarray(0,16).toString()).toContain('agyion:envoy:v2');
 });
});
