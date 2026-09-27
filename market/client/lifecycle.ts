/** Owned testnet public lifecycle. Uncertain sends only reconcile the saved hash.
 * Wallet, transport and local storage adapters are trust boundaries; the public
 * factory supplies the compiled pins and actual durable browser journal. */
import {Account,BASE_FEE,Contract,Networks,StrKey,Transaction,TransactionBuilder,rpc,xdr} from '@stellar/stellar-sdk';
import {Buffer} from 'buffer';
import {decimal,exact,hex32,requireValue} from '../shared/codec.ts';
import {assertMarketRelease} from './release.ts';
import type {MarketRelease} from './release.ts';
import {assertMarketReader} from './reader.ts';
import type {MarketReader} from './reader.ts';
import {planCommand,snapshotCommand} from './commands.ts';
import type {MarketPlan} from './commands.ts';
import type {MarketJournal,MarketJournalEntry,MarketTransactionAttempt} from './journal.ts';
import {snapshotMarketAttempt} from './journal.ts';
import type {MarketCommand,MarketWallet,MarketWalletSession,MarketProtocolOptions,PreparedMarketOperation,MarketOutcome} from './protocol-types.ts';
import {callHash,invocation,returnIdentity,transactionEvidence,validateSignedTransaction,validateSimulationAuth} from './transaction-safety.ts';
export interface MarketTransport {getAccount(source:string):Promise<Account>;getLatestLedger():Promise<{sequence:number}>;simulateTransaction(tx:Transaction):Promise<rpc.Api.SimulateTransactionResponse>;sendTransaction(tx:Transaction):Promise<{hash:string;status:string}>;getTransaction(hash:string):Promise<rpc.Api.GetTransactionResponse>}
export class MarketFeeBudgetExceededError extends Error {constructor(readonly feeStroops:string,readonly maxFeeStroops:string){super('MARKET_FEE_BUDGET_EXCEEDED');this.name='MarketFeeBudgetExceededError';}}
function budget(v:string){decimal(v,32);requireValue(BigInt(v)>0n,'EXPLICIT_MARKET_FEE_LIMIT_REQUIRED');return v;}
function session(wallet:MarketWallet):MarketWalletSession{const s=exact(wallet.session(),['id','account','networkPassphrase']);requireValue(typeof s.id==='string'&&s.id.length>0&&s.id.length<=128&&typeof s.account==='string'&&StrKey.isValidEd25519PublicKey(s.account)&&s.networkPassphrase===Networks.TESTNET,'TESTNET_WALLET_REQUIRED');return Object.freeze({id:s.id,account:s.account,networkPassphrase:Networks.TESTNET});}
export function createMarketLifecycle(options:MarketProtocolOptions&{release:MarketRelease;reader:MarketReader;journal:MarketJournal;transport:MarketTransport}){
 const {release,reader,journal,transport,wallet}=options;assertMarketRelease(release);assertMarketReader(reader,release);const cap=budget(options.maxFeeStroops);requireValue(typeof options.confirmFee==='function','EXPLICIT_FEE_CONFIRMATION_REQUIRED');
 interface Draft {command:MarketCommand;session:MarketWalletSession;plan:MarketPlan;cap:string;id:string;active:boolean;running:boolean;attempted:boolean}
 const drafts=new WeakMap<object,Draft>();let disposed=false;const confirmations=new Set<AbortController>();
 function alive(){requireValue(!disposed,'MARKET_SESSION_DISPOSED');}
 function current(expected:MarketWalletSession){alive();const actual=session(wallet);requireValue(actual.id===expected.id&&actual.account===expected.account&&actual.networkPassphrase===expected.networkPassphrase,'WALLET_SESSION_CHANGED');}
 function handle(d:Draft){const h=Object.freeze({id:d.id,action:d.command.action,summary:d.plan.summary,maxFeeStroops:d.cap});drafts.set(h,d);return h;}
 function unwrap(h:PreparedMarketOperation){alive();const d=drafts.get(h);requireValue(d?.active,'PREPARED_MARKET_OPERATION_REQUIRED');return d;}
 function scoped(entry:MarketJournalEntry):MarketTransactionAttempt{requireValue(entry.attempt.kind==='transaction'&&entry.attempt.releaseId===release.releaseId&&entry.attempt.contract===release.contract,'MARKET_ATTEMPT_RELEASE_MISMATCH');return entry.attempt;}
 function outcome(entry:MarketJournalEntry):MarketOutcome{const a=scoped(entry),t=entry.terminal;requireValue(t?.status!=='accepted');return Object.freeze({hash:a.hash,status:t?.status??'pending',ledger:t&&'ledger'in t?t.ledger:null,offerId:t&&'offerId'in t?t.offerId:null});}
 async function reconcileEntry(entry:MarketJournalEntry):Promise<MarketOutcome>{
  const a=scoped(entry);if(entry.terminal)return outcome(entry);
  try{await reader.state();const response=await transport.getTransaction(a.hash),evidence=transactionEvidence(response,a);if(!evidence)return outcome(entry);await journal.finish({hash:a.hash,...evidence});return outcome({attempt:a,terminal:{hash:a.hash,...evidence}});}catch{return outcome(entry);}
 }
 async function refresh(d:Draft){current(d.session);const plan=await planCommand(d.command,d.session.account,release,reader);current(d.session);requireValue(plan.snapshotId===d.plan.snapshotId,'MARKET_STATE_CHANGED');return plan;}
 function window(ledger:number,plan:MarketPlan){requireValue(Number.isInteger(ledger)&&ledger>=plan.minLedger&&ledger<=plan.maxLedger,'MARKET_TRANSACTION_EXPIRED');}
 async function confirm(d:Draft,fee:string){
  const control=new AbortController();confirmations.add(control);let rejectAbort:(reason:unknown)=>void=()=>{};
  const abort=()=>rejectAbort(new Error('MARKET_FEE_CONFIRMATION_CANCELLED'));control.signal.addEventListener('abort',abort,{once:true});const timer=setTimeout(()=>control.abort(),60000);
  try{const cancelled=new Promise<never>((_,reject)=>{rejectAbort=reject;});const allowed=await Promise.race([options.confirmFee(Object.freeze({feeStroops:fee,maxFeeStroops:d.cap,source:d.session.account,action:d.command.action,signal:control.signal})),cancelled]);requireValue(allowed===true&&!control.signal.aborted,'MARKET_FEE_CONFIRMATION_CANCELLED');current(d.session);}finally{clearTimeout(timer);control.signal.removeEventListener('abort',abort);confirmations.delete(control);}
 }
 return Object.freeze({
  async prepare(value:MarketCommand):Promise<PreparedMarketOperation>{alive();const command=snapshotCommand(value),expected=session(wallet),plan=await planCommand(command,expected.account,release,reader);current(expected);const d:Draft={command,session:expected,plan,cap,id:Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex'),active:true,running:false,attempted:false};return handle(d);},
  withFeeLimit(h:PreparedMarketOperation,newCap:string):PreparedMarketOperation{const d=unwrap(h);requireValue(!d.running&&!d.attempted,'MARKET_ATTEMPT_ALREADY_STARTED');const next={...d,cap:budget(newCap)};current(d.session);d.active=false;return handle(next);},
  async submit(h:PreparedMarketOperation):Promise<MarketOutcome>{
   const d=unwrap(h);requireValue(!d.running,'MARKET_OPERATION_BUSY');d.running=true;
   try{return await journal.exclusive(async()=>{
    const existing=await journal.byIntent(d.id);if(existing)return reconcileEntry(existing);current(d.session);requireValue((await journal.pending()).every(a=>a.kind!=='transaction'||a.source!==d.session.account),'UNRESOLVED_MARKET_TRANSACTION');
    const plan=await refresh(d),account=await transport.getAccount(d.session.account);current(d.session);requireValue(account.accountId()===d.session.account,'SOURCE_ACCOUNT_MISMATCH');decimal(account.sequenceNumber(),63);requireValue(BigInt(account.sequenceNumber())<(1n<<63n)-1n,'INVALID_SOURCE_SEQUENCE');
    const op=new Contract(release.contract).call(d.command.action,...plan.args),raw=new TransactionBuilder(new Account(d.session.account,account.sequenceNumber()),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET}).addOperation(op).setTimeout(0).setLedgerbounds(plan.minLedger,plan.maxLedger+1).build();
    const encoded=raw.toXDR(),expected=xdr.HostFunction.fromXDR(invocation(raw).func.toXDR());
    const simulation=await transport.simulateTransaction(TransactionBuilder.fromXDR(encoded,Networks.TESTNET) as Transaction);current(d.session);
    requireValue(rpc.Api.isSimulationSuccess(simulation)&&!rpc.Api.isSimulationRestore(simulation)&&simulation.result,'MARKET_SIMULATION_OR_RESTORE_REQUIRED');window(simulation.latestLedger,plan);returnIdentity(d.command.action,simulation.result.retval,expected.invokeContract());
    const assembled=rpc.assembleTransaction(TransactionBuilder.fromXDR(encoded,Networks.TESTNET) as Transaction,simulation).build();validateSimulationAuth(assembled,expected,plan,release.contract);
    if(BigInt(assembled.fee)>BigInt(d.cap))throw new MarketFeeBudgetExceededError(assembled.fee,d.cap);await refresh(d);await confirm(d,assembled.fee);await refresh(d);window((await transport.getLatestLedger()).sequence,plan);current(d.session);
    const returned=await wallet.signTransaction(assembled.toXDR(),Networks.TESTNET,d.session.account);current(d.session);const signed=validateSignedTransaction(assembled,returned,d.session.account);
    const attempt=snapshotMarketAttempt({version:1,kind:'transaction',intentId:d.id,releaseId:release.releaseId,contract:release.contract,source:d.session.account,action:d.command.action,hash:signed.hash().toString('hex'),sequence:signed.sequence,callHash:callHash(signed)}) as MarketTransactionAttempt;
    await journal.commit(attempt);d.attempted=true;let sendStarted=false;
    try{
     await refresh(d);window((await transport.getLatestLedger()).sequence,plan);current(d.session);sendStarted=true;
     const sent=await transport.sendTransaction(signed);const entry={attempt,terminal:null};if(sent.hash!==attempt.hash)return outcome(entry);return reconcileEntry(entry);
    }catch(error){
     const entry:MarketJournalEntry={attempt,terminal:null};if(!sendStarted){const message=error instanceof Error?error.message:'';const reason=message==='WALLET_SESSION_CHANGED'||message==='TESTNET_WALLET_REQUIRED'?'session_changed':message==='MARKET_SESSION_DISPOSED'?'cancelled':message==='MARKET_STATE_CHANGED'||message==='MARKET_TRANSACTION_EXPIRED'?'state_changed':'read_failed';
      try{const terminal={hash:attempt.hash,status:'known_not_sent' as const,reason} as const;await journal.finish(terminal);return outcome({attempt,terminal});}catch{return outcome(entry);}}
     return reconcileEntry(entry);
    }
   });}finally{d.running=false;}
  },
  async reconcile(value:string){hex32(value);return journal.exclusive(async()=>{const entry=await journal.get(value);requireValue(entry,'MARKET_ATTEMPT_REQUIRED');return reconcileEntry(entry);});},
  dispose(){disposed=true;for(const control of confirmations)control.abort();confirmations.clear();},
 });
}
