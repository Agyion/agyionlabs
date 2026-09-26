import { afterEach, expect, it, vi } from 'vitest';
import { Address, Keypair, StrKey, hash } from '@stellar/stellar-sdk';
import * as signing from '../app/lib/signers';
import fixture from '../../contracts/hak/fixtures/pod-v3.json';
const seed='01'.repeat(32), key=Keypair.fromRawEd25519Seed(Buffer.from(seed,'hex'));
const funder=Keypair.fromRawEd25519Seed(Buffer.alloc(32,2)).publicKey();
const recipient=Keypair.fromRawEd25519Seed(Buffer.alloc(32,3)).publicKey();
const asset=StrKey.encodeContract(Buffer.alloc(32,4));
const domain={contractId:StrKey.encodeContract(Buffer.alloc(32,5)),networkPassphrase:'Test SDF Network ; September 2015'};
afterEach(()=>vi.unstubAllGlobals());
it('binds the creation proof to every funding term and public claim key',()=>{
 const pub=signing.podPublicKey(seed);
 const proof=Buffer.from(signing.signPodCreation(seed,funder,asset,123n,456,domain),'hex');
 expect(key.verify(signing.podCreationPayload(funder,asset,123n,456,pub,domain),proof)).toBe(true);
 for(const payload of [
  signing.podCreationPayload(recipient,asset,123n,456,pub,domain),
  signing.podCreationPayload(funder,domain.contractId,123n,456,pub,domain),
  signing.podCreationPayload(funder,asset,124n,456,pub,domain),
  signing.podCreationPayload(funder,asset,123n,457,pub,domain),
  signing.podCreationPayload(funder,asset,123n,456,'02'.repeat(32),domain),
 ]) expect(key.verify(payload,proof)).toBe(false);
});
it('binds a claim signature to its Pod, recipient, network and deployment',()=>{
 const signature=Buffer.from(signing.signPodClaim(seed,7n,recipient,domain),'hex');
 expect(key.verify(signing.podClaimPayload(7n,recipient,domain),signature)).toBe(true);
 for(const payload of [signing.podClaimPayload(8n,recipient,domain),signing.podClaimPayload(7n,funder,domain),signing.podClaimPayload(7n,recipient,{...domain,networkPassphrase:'other'}),signing.podClaimPayload(7n,recipient,{...domain,contractId:asset})]) expect(key.verify(payload,signature)).toBe(false);
 expect(signing.podClaimPayload(7n,recipient,domain).includes(Buffer.from(seed,'hex'))).toBe(false);
});
it('encodes the documented V3 payload with fixed-width integer fields',()=>{
 const expected=Buffer.concat([Buffer.from('agyion:pod-create:v3\0'),hash(Buffer.from(domain.networkPassphrase)),new Address(domain.contractId).toScVal().toXDR(),new Address(funder).toScVal().toXDR(),new Address(asset).toScVal().toXDR(),Buffer.from('0000000000000000000000000000007b','hex'),Buffer.from('000001c8','hex'),key.rawPublicKey()]);
 expect(signing.podCreationPayload(funder,asset,123n,456,signing.podPublicKey(seed),domain)).toEqual(expected);
});
it('matches the independently generated cross-language public fixture byte for byte',()=>{
 const d={contractId:fixture.contractId,networkPassphrase:fixture.networkPassphrase};
 expect(signing.podPublicKey(fixture.seedHex)).toBe(fixture.claimPubkey);
 expect(signing.podCreationPayload(fixture.funder,fixture.asset,BigInt(fixture.amount),fixture.unlockLedger,fixture.claimPubkey,d).toString('hex')).toBe(fixture.createPayloadHex);
 expect(signing.signPodCreation(fixture.seedHex,fixture.funder,fixture.asset,BigInt(fixture.amount),fixture.unlockLedger,d)).toBe(fixture.creationProofHex);
 expect(signing.podClaimPayload(BigInt(fixture.podId),fixture.recipient,d).toString('hex')).toBe(fixture.claimPayloadHex);
 expect(signing.signPodClaim(fixture.seedHex,BigInt(fixture.podId),fixture.recipient,d)).toBe(fixture.claimSignatureHex);
});
it.each(['secret','01'.repeat(16),'gg'.repeat(32),seed+'00'])('rejects a non-32-byte-hex Pod credential %s',value=>expect(()=>signing.podPublicKey(value)).toThrow());
it('generates a fresh 32-byte browser credential without storing it',()=>{
 const a=signing.newPodSeed(),b=signing.newPodSeed();
 expect(a).toMatch(/^[a-f0-9]{64}$/);expect(b).toMatch(/^[a-f0-9]{64}$/);expect(a).not.toBe(b);
 expect(signing.podPublicKey(a)).toMatch(/^[a-f0-9]{64}$/);
});
