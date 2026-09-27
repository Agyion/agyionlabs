/** Real crypto, branded releases and SDK reader fixtures; accepting proof and
 * in-memory journal doubles test gates, not live consensus or proof validity. */
import {File as NodeFile} from 'node:buffer';
import {afterAll,afterEach,beforeAll,expect,it,vi} from 'vitest';
import {StrKey} from '@stellar/stellar-sdk';
import {createPoolReader} from '../../contracts/private-pool/client/reader';
import {verifyPoolRelease} from '../../contracts/private-pool/client/release';
import {createPrivateProtocol} from '../app/lib/private/protocol';
import type {PrivateProtocol} from '../app/lib/private/protocol-types';
import type {PrivateReleasePolicy} from '../app/lib/private/release';
import {createPrivacyVault,backupPrivacyVault,forgetPrivacyVault} from '../../privacy/src/vault.mjs';
import {createPrivateVaultController} from '../app/lib/privateVault';
import {BASE8} from '../../privacy/src/model.mjs';
import {initializeProtocolFixture,protocolFixture,password,selected,grants} from './private-protocol.fixture';
type H=Awaited<ReturnType<typeof protocolFixture>>;
vi.setConfig({testTimeout:30000});
const opened:H[]=[],extra:PrivateProtocol[]=[];
async function h(policy:PrivateReleasePolicy='recovery'){const x=await protocolFixture(undefined,policy);opened.push(x);return x}
beforeAll(async()=>{vi.stubGlobal('File',NodeFile);await initializeProtocolFixture()},30000);
afterEach(()=>{extra.splice(0).forEach(p=>p.dispose());opened.splice(0).forEach(x=>x.close());vi.restoreAllMocks()});afterAll(()=>vi.unstubAllGlobals());
it('rejects a foreign production release key before any wallet, RPC or journal work',async()=>{
 const x=await h(),fetch=vi.spyOn(globalThis,'fetch');
 await expect(createPrivateProtocol({releaseKey:'https://evil.invalid/manifest',vault:x.vault,maxFeeStroops:'1000',confirmFee:async()=>true})).rejects.toThrow('UNKNOWN_PRIVATE_RELEASE');
 expect(fetch).not.toHaveBeenCalled();expect(x.calls.proves+x.calls.signs+x.calls.sends).toBe(0);
});
it('recovery refuses deposit, transfer and each new instrument before wallet lookup or proof creation',async()=>{
 const x=await h(),recipient=await x.protocol.receiveDescriptor(),wallet=vi.spyOn(x.adapters,'wallet');
 const commands=[{action:'deposit',asset:x.asset,amount:'4'},{action:'transfer',asset:x.asset,amount:'4',recipient},
  {action:'pod-create',asset:x.asset,amount:'4',recipient,unlockLedger:'1100',grantId:grants[0].id},
  {action:'trigger-create',asset:x.asset,amount:'4',recipient,deadline:'1100',condition:'1',attester:BASE8.map(String),attesterRecipient:recipient,grantId:grants[1].id},
  {action:'envoy-grant',asset:x.asset,amount:'4',agent:recipient,recipient,validFrom:'1005',expiresAt:'1100',maxPerClaim:'2',claims:'2',grantId:grants[2].id}];
 for(const command of commands)await expect(x.protocol.prepare(command)).rejects.toThrow('PRIVATE_RELEASE_RECOVERY_ONLY');
 expect(wallet).not.toHaveBeenCalled();expect(x.calls.proves+x.calls.signs+x.calls.sends).toBe(0);expect(x.journal.rows.size).toBe(0);
});
it('recovery can prove and explicitly submit a withdrawal of existing encrypted cash',async()=>{
 const x=await h();await x.fundFixture('100');
 const handle=await x.protocol.prepare({action:'withdraw',asset:x.asset,amount:'4',recipient:{kind:'account',id:'77'.repeat(32)}});
 expect(handle.summary).toMatchObject({action:'withdraw',amount:'4'});expect(x.calls.proves).toBe(1);
 const result=await x.protocol.submit(handle);expect(result.status).toBe('pending');expect(x.calls.signs).toBe(1);expect(x.calls.sends).toBe(1);
 x.vault.lock();expect((await x.protocol.refreshPending()).map(row=>row.hash)).toEqual([result.hash]);
 expect((await x.protocol.reconcile(result.hash)).status).toBe('pending');expect(x.calls.sends).toBe(1);
});
it('rechecks a narrowed policy after recovery, before proof creation',async()=>{
 const x=await h('funding');
 // Narrowing is injected at a trusted async read boundary, not by user data.
 const transport=x.adapters.transport(x.release),read=transport.getLatestLedger;
 vi.spyOn(x.adapters,'transport').mockReturnValue({...transport,getLatestLedger:async()=>{const ledger=await read();x.hooks.policy='recovery';return ledger}});
 const p=await createPrivateProtocol({vault:x.vault,maxFeeStroops:'1000',confirmFee:async()=>true},x.adapters);extra.push(p);
 await expect(p.prepare({action:'deposit',asset:x.asset,amount:'4'})).rejects.toThrow('PRIVATE_RELEASE_RECOVERY_ONLY');
 expect(x.calls.proves+x.calls.signs+x.calls.sends).toBe(0);
});
it('rechecks a prepared action and a delayed fee decision before any signature or send',async()=>{
 const x=await h('funding'),handle=await x.protocol.prepare({action:'deposit',asset:x.asset,amount:'4'});x.hooks.policy='recovery';
 await expect(x.protocol.submit(handle)).rejects.toThrow('PRIVATE_RELEASE_RECOVERY_ONLY');expect(x.calls.signs+x.calls.sends).toBe(0);expect(x.journal.rows.size).toBe(0);
 const y=await h('funding'),late=await y.protocol.prepare({action:'deposit',asset:y.asset,amount:'4'});y.hooks.onFee=async()=>{y.hooks.policy='recovery'};
 await expect(y.protocol.submit(late)).rejects.toThrow('PRIVATE_RELEASE_RECOVERY_ONLY');expect(y.calls.signs+y.calls.sends).toBe(0);expect(y.journal.rows.size).toBe(0);
});
it('keeps opaque handles and authenticated vault scopes isolated across two trusted synthetic profiles',async()=>{
 const x=await h('funding'),handle=await x.protocol.prepare({action:'deposit',asset:x.asset,amount:'4'});
 // Different reviewed bytes give a distinct profile even when network/domain
 // remain equal. No fixture is admitted to the production catalogue.
 const other=await verifyPoolRelease({...x.f.manifest,wasmHash:'ab'.repeat(32)},x.f.dkg);
 expect(other.scope.profileId).not.toBe(x.release.scope.profileId);
 const vault=createPrivacyVault(other.scope),controller=createPrivateVaultController(other.scope);
 try{
  await controller.restore(selected(await backupPrivacyVault(vault,password)),password);
  const wallet=vi.spyOn(x.adapters,'wallet'),prover=vi.spyOn(x.adapters,'prover');
  const p=await createPrivateProtocol({vault:controller,maxFeeStroops:'1000',confirmFee:async()=>true},{...x.adapters,release:async()=>other,reader:r=>createPoolReader(r,{fetch:x.f.fetcher})});extra.push(p);
  await expect(p.submit(handle)).rejects.toThrow('PRIVATE_PREPARATION_REQUIRED');
  const wrongVault=await createPrivateProtocol({vault:x.vault,maxFeeStroops:'1000',confirmFee:async()=>true},{...x.adapters,release:async()=>other,reader:r=>createPoolReader(r,{fetch:x.f.fetcher})});extra.push(wrongVault);
  await expect(wrongVault.prepare({action:'deposit',asset:StrKey.decodeContract(x.f.manifest.config.assets[0]).toString('hex'),amount:'4'})).rejects.toThrow('PRIVATE_VAULT_SCOPE_MISMATCH');
  expect(wallet).not.toHaveBeenCalled();expect(prover).not.toHaveBeenCalled();expect(x.calls.signs+x.calls.sends).toBe(0);
  x.protocol.dispose();await expect(x.protocol.submit(handle)).rejects.toThrow('PRIVATE_PROTOCOL_DISPOSED');
 }finally{controller.lock();forgetPrivacyVault(vault)}
},60000);
