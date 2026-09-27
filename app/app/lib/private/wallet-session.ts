import type {PrivateWallet} from '../../../../contracts/private-pool/client/submission';
import {Networks,StrKey} from '@stellar/stellar-sdk';
import {CONFIG} from '../config';
import {activeSigner,walletSessionVersion,assertSignedTransactionMatches} from '../wallet';
export interface BoundPrivateWallet {readonly account:string;readonly wallet:PrivateWallet}
/** Capture only a verified public account. The existing signer authenticates
 * its actual wallet network/account; this adapter also binds its exact lifetime
 * and the local checked-vault capability across all asynchronous boundaries. */
export async function bindPrivateWallet(assertCurrent:()=>void):Promise<BoundPrivateWallet>{
 if(CONFIG.networkPassphrase!==Networks.TESTNET)throw new Error('TESTNET_WALLET_REQUIRED');
 const signer=activeSigner(),version=walletSessionVersion();
 if(!signer)throw new Error('CONNECTED_WALLET_REQUIRED');
 const current=()=>{
  assertCurrent();
  if(activeSigner()!==signer||walletSessionVersion()!==version)throw new Error('WALLET_SESSION_CHANGED');
 };
 current();const account=await signer.address();current();
 if(!StrKey.isValidEd25519PublicKey(account))throw new Error('EXPECTED_WALLET_ACCOUNT_REQUIRED');
 const verifyAddress=async()=>{current();const address=await signer.address();current();if(address!==account)throw new Error('WALLET_SESSION_CHANGED');};
 const wallet:PrivateWallet=Object.freeze({
  session(){current();return Object.freeze({id:`wallet:${version}:${account}`,account,networkPassphrase:Networks.TESTNET});},
  async signTransaction(value:string,network:string,expectedAccount:string){
   if(network!==Networks.TESTNET||expectedAccount!==account)throw new Error('TESTNET_WALLET_REQUIRED');
   await verifyAddress();current();
   const signed=await signer.signTransaction(value,network);current();
   await verifyAddress();current();assertSignedTransactionMatches(value,signed,network,account);
   return signed;
  },
 });
 return Object.freeze({account,wallet});
}
