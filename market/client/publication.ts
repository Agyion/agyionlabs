/** Signed publication recovery. Reconcile never posts; explicit retry posts saved bytes only. */
import {Buffer} from 'buffer';
import {hash} from '@stellar/stellar-sdk';
import {hex32,metadataHash,parsePublication,publicationBytes,requireValue,sha256,verifyPublication} from '../shared/codec.ts';
import type {Publication} from '../shared/codec.ts';
import {assertMarketRelease} from './release.ts';
import type {MarketRelease} from './release.ts';
import {assertMarketReader} from './reader.ts';
import type {MarketReader} from './reader.ts';
import type {createMarketCatalog,PublicationReceipt} from './catalog.ts';
import type {MarketJournal,MarketPublicationAttempt,MarketJournalEntry} from './journal.ts';
export interface PublicationOutcome {readonly digest:string;readonly status:'pending'|'accepted'|'known_not_sent';readonly receipt:PublicationReceipt|null}
export function createMarketPublisher(options:{release:MarketRelease;reader:MarketReader;journal:MarketJournal;catalog:ReturnType<typeof createMarketCatalog>;now?:()=>number;signal?:AbortSignal}){
 const {release,reader,journal,catalog}=options;assertMarketRelease(release);assertMarketReader(reader,release);const now=options.now??(()=>Math.floor(Date.now()/1000));
 function current(){options.signal?.throwIfAborted();}
 function attempt(entry:MarketJournalEntry):MarketPublicationAttempt{requireValue(entry.attempt.kind==='publication'&&entry.attempt.releaseId===release.releaseId&&entry.attempt.contract===release.contract,'PUBLICATION_ATTEMPT_SCOPE');return entry.attempt;}
 function outcome(entry:MarketJournalEntry):PublicationOutcome{const a=attempt(entry);requireValue(!entry.terminal||entry.terminal.status==='accepted'||entry.terminal.status==='known_not_sent');return Object.freeze({digest:a.hash,status:entry.terminal?.status==='accepted'?'accepted':entry.terminal?.status==='known_not_sent'?'known_not_sent':'pending',receipt:entry.terminal?.status==='accepted'?entry.terminal.receipt:null});}
 async function reconcileEntry(entry:MarketJournalEntry):Promise<PublicationOutcome>{
  const a=attempt(entry);if(entry.terminal)return outcome(entry);
  try{const receipt=await catalog.receipt(a.hash);requireValue(receipt.contract===a.contract&&receipt.seller===a.source&&receipt.offerId===a.publication.offerId&&receipt.keyEpoch===a.publication.keyEpoch&&receipt.revision===a.publication.revision&&receipt.expiresAt===a.publication.expiresAt&&receipt.signatureHash===hash(Buffer.from(a.signature,'hex')).toString('hex'),'PUBLICATION_RECEIPT_MISMATCH');
   await journal.finish({hash:a.hash,status:'accepted',receipt});return Object.freeze({digest:a.hash,status:'accepted',receipt});
  }catch{return outcome(entry);}
 }
 async function authorize(a:MarketPublicationAttempt){
  current();const p=a.publication;requireValue(p.expiresAt>now()&&p.issuedAt<=now()+60&&p.issuedAt>=now()-300,'PUBLICATION_EXPIRED');
  requireValue(await metadataHash(p.metadata)===p.metadataHash,'PUBLICATION_METADATA_HASH');
  const offer=await reader.offer(p.offerId);requireValue(offer.value.seller===p.seller&&offer.value.state===0&&offer.ledger<offer.value.deadline_ledger&&offer.value.terms_hash.toString('hex')===p.termsHash&&offer.value.terms.metadata_hash.toString('hex')===p.metadataHash,'PUBLICATION_CHAIN_MISMATCH');
  const merchant=await reader.merchant(p.seller);requireValue(merchant.value&&merchant.value.epoch===p.keyEpoch&&await verifyPublication(p,a.signature,merchant.value.public_key.toString('hex')),'PUBLICATION_KEY_MISMATCH');
  current();requireValue(p.expiresAt>now(),'PUBLICATION_EXPIRED');
 }
 async function send(a:MarketPublicationAttempt,fresh=false):Promise<PublicationOutcome>{
  if(options.signal?.aborted&&fresh){await journal.finish({hash:a.hash,status:'known_not_sent',reason:'cancelled'});const entry=await journal.get(a.hash);requireValue(entry);return outcome(entry);}
  current();
  // Caller has already stored this exact public request. Once fetch starts any
  // thrown/HTTP error is uncertain, never permission to create a fresh revision.
  try{await catalog.publish(a.publication,a.signature,options.signal);}catch{}
  const entry=await journal.get(a.hash);requireValue(entry,'PUBLICATION_RECOVERY_REQUIRED');return reconcileEntry(entry);
 }
 return Object.freeze({
  async publish(value:Publication,signature:string):Promise<PublicationOutcome>{
   current();const p=parsePublication(value);requireValue(p.contract===release.contract&&typeof signature==='string'&&/^[0-9a-f]{128}$/.test(signature),'PUBLICATION_SCOPE');
   const digest=await sha256(publicationBytes(p));const a:MarketPublicationAttempt={version:1,kind:'publication',releaseId:release.releaseId,contract:release.contract,source:p.seller,hash:digest,publication:p,signature};
   return journal.exclusive(async()=>{
    const saved=await journal.get(digest);if(saved){const old=attempt(saved);requireValue(old.signature===signature,'PUBLICATION_SIGNATURE_CHANGED');return reconcileEntry(saved);}
    await authorize(a);await journal.commit(a);return send(a,true);
   });
  },
  reconcilePublication(digest:string):Promise<PublicationOutcome>{hex32(digest);return journal.exclusive(async()=>{const saved=await journal.get(digest);requireValue(saved,'PUBLICATION_RECOVERY_REQUIRED');return reconcileEntry(saved);});},
  retryPublication(digest:string):Promise<PublicationOutcome>{hex32(digest);return journal.exclusive(async()=>{const saved=await journal.get(digest);requireValue(saved,'PUBLICATION_RECOVERY_REQUIRED');const recovered=await reconcileEntry(saved);if(recovered.status!=='pending')return recovered;const a=attempt(saved);await authorize(a);return send(a);});},
 });
}
