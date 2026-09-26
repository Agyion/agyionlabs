/** Portable v2 identity binding, byte-for-byte with the Soroban host.
 * Raw IDs are32-byte lowercase hex, not a StrKey string or a wallet secret.
 * ScVal address XDR: discriminator18, then ScAddress contract1/raw32 or
 * account0/PublicKey ed255190/raw32. Other address variants are unsupported.
 */
import {sha256} from '@noble/hashes/sha2.js';
import {hexToBytes,bytesToHex,concatBytes} from '@noble/hashes/utils.js';
import {poseidon2} from 'poseidon-lite';
import {record,hex,domain,fail} from './validation.mjs';

const FR=21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const encoder=new TextEncoder();
function address(kind,id){
 const bytes=hexToBytes(hex(id,32,'addressId',true));
 if(kind==='contract')return concatBytes(new Uint8Array([0,0,0,18,0,0,0,1]),bytes);
 if(kind==='account')return concatBytes(new Uint8Array([0,0,0,18,0,0,0,0,0,0,0,0]),bytes);
 fail('SUPPORTED_ADDRESS_KIND_REQUIRED','kind');
}
function tagged(tag,...parts){
 const digest=bytesToHex(sha256(concatBytes(encoder.encode(tag),...parts)));
 return poseidon2([BigInt('0x'+digest.slice(0,32)),BigInt('0x'+digest.slice(32))]);
}
export function domainField(value){
 const d=domain(value,'domain');
 return tagged('AGYION_DOMAIN_V2\0',hexToBytes(d.networkId),address('contract',d.contractId));
}
export function assetField(contractId){return tagged('AGYION_ASSET_V2\0',address('contract',contractId));}
export function accountField(value){
 const v=record(value,['kind','id'],'account');
 return tagged('AGYION_ACCOUNT_V2\0',address(v.kind,v.id));
}
export function revocationTag(domainValue,publicKey){
 if(typeof domainValue!=='bigint'||domainValue<=0n||domainValue>=FR)fail('CANONICAL_NONZERO_DOMAIN_REQUIRED','domain');
 return tagged('AGYION_REVOKE_KEY_V2\0',hexToBytes(domainValue.toString(16).padStart(64,'0')),hexToBytes(hex(publicKey,32,'publicKey',true)));
}
