import { vi } from 'vitest';
import { Account, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
function installSdkBufferRealm() {
  // jsdom has its own Uint8Array; the SDK's Node Buffer must pass noble's
  // instanceof check just as the single browser realm does in production.
  if (typeof window !== 'undefined') vi.stubGlobal('Uint8Array',Object.getPrototypeOf(Buffer));
}
/** Real SDK envelopes let recovery tests verify identity under the expected network. */
export function recoveryTransactionFixture(label = 'recovery', network: string = Networks.TESTNET) {
  installSdkBufferRealm();
  const signed=new TransactionBuilder(new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF','1'),{fee:'100',networkPassphrase:network})
    .addOperation(Operation.manageData({name:label,value:null})).setTimeout(0).build();
  return {signed,hash:signed.hash().toString('hex'),envelopeXdr:signed.toEnvelope()};
}
/** Test-only browser coordination boundary. Contended ifAvailable requests get null. */
export function installRecoveryLocks() {
  installSdkBufferRealm();
  const held=new Set<string>();
  vi.stubGlobal('navigator',{locks:{request:async(name:string,_options:unknown,callback:(lock:unknown)=>Promise<unknown>)=>{
    if(held.has(name)) return callback(null);
    held.add(name);try{return await callback({name})}finally{held.delete(name)}
  }}});
}
