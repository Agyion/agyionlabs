import {File as NodeFile} from 'node:buffer';
import {afterAll,afterEach,beforeAll,expect,it,vi} from 'vitest';
import {createPrivacyVault,backupPrivacyVault,forgetPrivacyVault} from '../../privacy/src/vault.mjs';
import {receiveDescriptor} from '../../privacy/src/credentials.mjs';
import {createPrivateProtocol} from '../app/lib/private/protocol';
import {WalletSignatureRejectedError} from '../app/lib/wallet-errors';
import {initializeProtocolFixture,protocolFixture,grants,password} from './private-protocol.fixture';
type H=Awaited<ReturnType<typeof protocolFixture>>;
vi.setConfig({testTimeout:30000});
const opened:H[]=[];async function h(){const v=await protocolFixture();opened.push(v);return v}
beforeAll(async()=>{vi.stubGlobal('File',NodeFile);await initializeProtocolFixture()},30000);
afterEach(()=>{opened.splice(0).forEach(h=>h.close());vi.restoreAllMocks()});afterAll(()=>vi.unstubAllGlobals());
it('requires branded release/reader and exactly pinned assets before opening storage',async()=>{
 const x=await h(),options={vault:x.vault,maxFeeStroops:'1000',confirmFee:async()=>true},journal=vi.fn(x.adapters.journal);
 await expect(createPrivateProtocol(options,{...x.adapters,release:async()=>({...x.release}),journal})).rejects.toThrow();
 await expect(createPrivateProtocol(options,{...x.adapters,reader:r=>({...x.adapters.reader(r)}),journal})).rejects.toThrow();
 await expect(createPrivateProtocol(options,{...x.adapters,assets:[],journal})).rejects.toThrow('PRIVATE_ASSET_POLICY_REQUIRED');expect(journal).not.toHaveBeenCalled();
});
it('recovers genuine encrypted notes, preserves ready on local descriptor, and clears balance after failed refresh',async()=>{
 const x=await h();await x.fundFixture('123');const initial=await x.protocol.refresh();expect(initial.balances).toEqual([{asset:x.asset,amount:'123'}]);expect(initial.notes).toHaveLength(1);
 const descriptor=await x.protocol.receiveDescriptor();expect(descriptor.kind).toBe('PrivateReceiveDescriptor');expect(x.protocol.getSnapshot().status).toBe('ready');
 x.hooks.readFailure=true;await expect(x.protocol.refresh()).rejects.toThrow();expect(x.protocol.getSnapshot()).toMatchObject({status:'unavailable',balances:[],notes:[],ledger:null});expect(x.calls.proves+x.calls.signs+x.calls.sends).toBe(0);
});
it('rejects unknown command fields and freezes the user command before the first await',async()=>{
 const x=await h();await expect(x.protocol.prepare({action:'deposit',asset:x.asset,amount:'4',hidden:'change-recipient'})).rejects.toThrow();expect(x.calls.proves).toBe(0);
 const command={action:'deposit',asset:x.asset,amount:'4'},preparing=x.protocol.prepare(command);command.amount='900';const handle=await preparing;
 expect(handle.summary.amount).toBe('4');expect(x.fields[18]).toBe('4');expect(x.calls.signs+x.calls.sends).toBe(0);
});
it('reports exact fee, never raises a cap silently, and consumes the old opaque handle for explicit repricing',async()=>{
 const x=await h(),handle=await x.protocol.prepare({action:'deposit',asset:x.asset,amount:'4'});x.hooks.resourceFee='1001';
 await expect(x.protocol.submit(handle)).rejects.toMatchObject({message:'FEE_BUDGET_EXCEEDED',feeStroops:'1101',maxFeeStroops:'1000'});
 expect(x.protocol.getSnapshot().feeQuote).toEqual({feeStroops:'1101',maxFeeStroops:'1000'});expect(x.calls.fees).toHaveLength(0);expect(x.calls.signs+x.calls.sends).toBe(0);
 const next=x.protocol.withFeeLimit(handle,'2000');await expect(x.protocol.submit(handle)).rejects.toThrow('PRIVATE_PREPARATION_REQUIRED');
 const result=await x.protocol.submit(next);expect(result.status).toBe('pending');expect(x.calls.proves).toBe(1);expect(x.calls.signs).toBe(1);expect(x.calls.sends).toBe(1);expect(x.calls.fees[0]).toMatchObject({feeStroops:'1101',maxFeeStroops:'2000'});
 expect(()=>x.protocol.withFeeLimit(next,'3000')).toThrow();expect(await x.protocol.submit(next)).toEqual(result);expect(x.calls.sends).toBe(1);expect(x.protocol.getSnapshot().pending[0].hash).toBe(result.hash);
});
it('cancelling the exact fee confirmation calls no signer and creates no durable attempt',async()=>{
 const x=await h(),handle=await x.protocol.prepare({action:'deposit',asset:x.asset,amount:'4'});x.hooks.acceptFee=false;
 await expect(x.protocol.submit(handle)).rejects.toThrow('PRIVATE_FEE_CONFIRMATION_CANCELLED');expect(x.calls.signs+x.calls.sends).toBe(0);expect(x.journal.rows.size).toBe(0);
 expect(x.protocol.getSnapshot()).toMatchObject({status:'ready',phase:null,error:null});expect(x.vault.getSnapshot().error).toBeNull();
 x.hooks.acceptFee=true;expect((await x.protocol.submit(handle)).status).toBe('pending');expect(x.calls.proves).toBe(1);
});
it('a verified wallet decline preserves checked keys and proof for an explicit fresh fee review',async()=>{
 const x=await h(),handle=await x.protocol.prepare({action:'deposit',asset:x.asset,amount:'4'});
 const decline=new WalletSignatureRejectedError();x.hooks.onSign=async()=>{throw decline};
 await expect(x.protocol.submit(handle)).rejects.toBe(decline);
 expect(x.calls.signs).toBe(1);expect(x.calls.sends).toBe(0);expect(x.journal.rows.size).toBe(0);
 expect(x.protocol.getSnapshot()).toMatchObject({status:'ready',phase:null,error:null});expect(x.vault.getSnapshot()).toMatchObject({status:'ready',busy:null,error:null});
 const revised=x.protocol.withFeeLimit(handle,'2000');x.hooks.onSign=async()=>{};
 const outcome=await x.protocol.submit(revised);expect(outcome.status).toBe('pending');
 expect(x.calls.proves).toBe(1);expect(x.calls.signs).toBe(2);expect(x.calls.sends).toBe(1);expect(x.calls.fees).toHaveLength(2);
 expect(await x.protocol.submit(revised)).toEqual(outcome);expect(x.calls.signs).toBe(2);expect(x.calls.sends).toBe(1);
});
it.each([new Error('Signature declined in the wallet. This request was not submitted.'),{name:'WalletSignatureRejectedError',code:-4,message:'The user rejected this request.'}])('an unclassified signing failure is not promoted to a safe cancellation',async failure=>{
 const x=await h(),handle=await x.protocol.prepare({action:'deposit',asset:x.asset,amount:'4'});x.hooks.onSign=async()=>{throw failure};
 await expect(x.protocol.submit(handle)).rejects.toBe(failure);
 expect(x.protocol.getSnapshot()).toMatchObject({status:'unavailable',balances:[],notes:[]});expect(x.vault.getSnapshot().error).not.toBeNull();
 expect(()=>x.protocol.withFeeLimit(handle,'2000')).toThrow('PRIVATE_PREPARATION_REQUIRED');expect(x.calls.signs).toBe(1);expect(x.calls.sends).toBe(0);
});
it('a late wallet decline cannot restore a locked vault or its retired proof',async()=>{
 const x=await h(),handle=await x.protocol.prepare({action:'deposit',asset:x.asset,amount:'4'});x.hooks.onSign=async()=>{x.vault.lock();throw new WalletSignatureRejectedError()};
 await expect(x.protocol.submit(handle)).rejects.toThrow();expect(x.protocol.getSnapshot()).toMatchObject({status:'locked',balances:[],notes:[]});
 expect(x.vault.getSnapshot().status).toBe('locked');expect(()=>x.protocol.withFeeLimit(handle,'2000')).toThrow();expect(x.calls.sends).toBe(0);
});
it('locking during proving or before actual signing invalidates the opaque authority',async()=>{
 const x=await h();let finish!:()=>void;x.hooks.onProve=()=>new Promise(resolve=>{finish=resolve});
 const preparing=x.protocol.prepare({action:'deposit',asset:x.asset,amount:'4'}),rejected=expect(preparing).rejects.toThrow();await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));x.vault.lock();finish();await rejected;expect(x.protocol.getSnapshot().status).toBe('locked');expect(x.calls.signs+x.calls.sends).toBe(0);
 const y=await h(),handle=await y.protocol.prepare({action:'deposit',asset:y.asset,amount:'4'});y.hooks.onFee=async()=>{y.vault.lock()};await expect(y.protocol.submit(handle)).rejects.toThrow();expect(y.calls.signs+y.calls.sends).toBe(0);expect(y.journal.rows.size).toBe(0);
});
it('durable pending evidence survives a wallet change and can be rediscovered after vault lock',async()=>{
 const x=await h(),handle=await x.protocol.prepare({action:'deposit',asset:x.asset,amount:'4'}),result=await x.protocol.submit(handle);
 x.hooks.session='replacement';x.hooks.walletListener();expect(x.protocol.getSnapshot()).toMatchObject({status:'locked',balances:[],notes:[]});x.vault.lock();
 const pending=await x.protocol.refreshPending();expect(pending.map(p=>p.hash)).toEqual([result.hash]);expect((await x.protocol.reconcile(result.hash)).status).toBe('pending');expect(x.calls.sends).toBe(1);
 await expect(x.protocol.prepare({action:'deposit',asset:x.asset,amount:'4'})).rejects.toThrow();expect(x.calls.sends).toBe(1);
});
it('an unbacked new grant invalidates every preparation and its saved proof',async()=>{
 const x=await h(),handle=await x.protocol.prepare({action:'deposit',asset:x.asset,amount:'4'});await x.vault.addGrant({kind:'pod',id:'55'.repeat(32)});
 expect(x.protocol.getSnapshot().status).toBe('locked');await expect(x.protocol.submit(handle)).rejects.toThrow();expect(x.calls.signs+x.calls.sends).toBe(0);
});
it('reconciliation refreshes a cached pending handle without ever re-signing it',async()=>{
 const x=await h(),handle=await x.protocol.prepare({action:'deposit',asset:x.asset,amount:'4'}),pending=await x.protocol.submit(handle);
 // Simulate the separate journal's authenticated terminal-evidence boundary.
 // This is not a claim that this unit fixture transaction reached any chain.
 await x.journal.terminal({hash:pending.hash,status:'failed',ledger:1007});
 expect((await x.protocol.reconcile(pending.hash)).status).toBe('failed');
 expect((await x.protocol.submit(handle)).status).toBe('failed');expect(x.calls.signs).toBe(1);expect(x.calls.sends).toBe(1);
});
it('a late reconciliation cannot survive vault generation changes or overlap new preparation',async()=>{
 const x=await h(),handle=await x.protocol.prepare({action:'deposit',asset:x.asset,amount:'4'}),pending=await x.protocol.submit(handle);
 let finish!:()=>void;x.hooks.onGet=()=>new Promise(resolve=>{finish=resolve});
 const reconciling=x.protocol.reconcile(pending.hash),rejected=expect(reconciling).rejects.toThrow();await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
 try{await expect(x.protocol.prepare({action:'deposit',asset:x.asset,amount:'4'})).rejects.toThrow('PRIVATE_OPERATION_BUSY');}
 finally{x.vault.lock();finish();await rejected;}
 expect(x.protocol.getSnapshot().status).toBe('locked');expect(x.journal.rows.get(pending.hash)?.terminal).toBe(null);expect(x.calls.sends).toBe(1);
});
it('foreign Pod funding requires the actual reselected encrypted credential, not just its download',async()=>{
 const x=await h();await x.fundFixture();const recipient=createPrivacyVault(x.release.scope);
 try{const handle=await x.protocol.prepare({action:'pod-create',asset:x.asset,amount:'4',recipient:receiveDescriptor(recipient),unlockLedger:'1100',grantId:grants[0].id});
  expect(handle.credentials).toHaveLength(1);const id=handle.credentials[0].id;
  await expect(x.protocol.submit(handle)).rejects.toThrow('PRIVATE_CREDENTIAL_BACKUP_REQUIRED');expect(x.calls.signs).toBe(0);
  const download=await x.protocol.exportCredential(handle,id,password);await expect(x.protocol.submit(handle)).rejects.toThrow('PRIVATE_CREDENTIAL_BACKUP_REQUIRED');
  const file=new File([await download.blob.text()],'selected-grant.json');await expect(x.protocol.checkExportedCredential(handle,id,file,'bad-password')).rejects.toThrow();
  await x.protocol.checkExportedCredential(handle,id,file,password);expect((await x.protocol.submit(handle)).status).toBe('pending');expect(x.calls.sends).toBe(1);
  x.acceptLastPrepared();
  const receiver=await protocolFixture(await backupPrivacyVault(recipient,password));opened.push(receiver);
  receiver.f.entries.clear();for(const [key,value]of x.f.entries)receiver.f.entries.set(key,value);
  Object.assign(receiver.f.state,x.f.state);
  expect((await receiver.protocol.refresh()).notes).toEqual([]);
  await receiver.protocol.importCredential(file,password);const received=await receiver.protocol.refresh();
  expect(received.notes).toHaveLength(1);expect(received.notes[0]).toMatchObject({kind:'pod',amount:'4',grantId:grants[0].id,supportedActions:[]});
  expect(received.balances[0].amount).toBe('0');
  await expect(receiver.protocol.importCredential(file,password)).rejects.toThrow('PRIVATE_CREDENTIAL_ALREADY_IMPORTED');
  await expect(x.protocol.importCredential(file,password)).rejects.toThrow();
 }finally{forgetPrivacyVault(recipient)}
},60000);

it('a fee callback queued before invalidation is never invoked after that invalidation', async () => {
  const x = await h(), handle = await x.protocol.prepare({ action: 'deposit', asset: x.asset, amount: '4' });
  const order: string[] = []; let queued = false;
  x.hooks.onFee = async () => { order.push('fee-callback'); };
  const detach = x.protocol.subscribe(() => {
    if (queued || x.protocol.getSnapshot().phase !== 'confirming-fee') return;
    queued = true; order.push('phase-published');
    // Public subscription boundary, not a scheduler or private-method patch:
    // this continuation is queued during publish, ahead of confirmFee's then.
    queueMicrotask(() => { order.push('invalidated'); x.vault.lock(); });
  });
  try {
    await expect(x.protocol.submit(handle)).rejects.toThrow();
    expect(queued).toBe(true); expect(x.vault.getSnapshot().status).toBe('locked');
    expect(x.calls.signs).toBe(0); expect(x.calls.sends).toBe(0); expect(x.journal.rows.size).toBe(0);
    expect(x.calls.fees).toHaveLength(0);
    expect(order).toEqual(['phase-published', 'invalidated']);
  } finally { detach(); }
});
