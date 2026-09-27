/** Owned, separate Fade Market testnet deployment and custody checks.
 * Default: no RPC or writes. --prepare OUTPUT creates new local test identities.
 * --execute OUTPUT uses only those identities and the exact reviewed WASM.
 * An uncertain submission is journaled and never automatically retried.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
const require = createRequire(new URL('../app/package.json', import.meta.url));
const { Keypair, Address, Asset, Contract, Operation, TransactionBuilder, nativeToScVal, scValToNative, xdr, rpc, contract } = require('@stellar/stellar-sdk');
const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const RPC = 'https://soroban-testnet.stellar.org';
const NETWORK = 'Test SDF Network ; September 2015';
const EXPECTED_HASH = 'b1947f2ac6bfa3f42535ed571b956c9fd1ab425b1441adca99d2c8c919ed1c6c';
const WASM = path.join(ROOT, 'contracts/fade-market/target/wasm32v1-none/release/fade_market.wasm');
const CIRCLE_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const ASSETS = [Asset.native(), new Asset('USDC', CIRCLE_ISSUER)];
const ROLES = ['seller', 'buyer', 'relayer', 'venue'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, (_k,v) => typeof v === 'bigint' ? v.toString() : v, 2)+'\n';
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
const unwrap = value => value?.unwrap instanceof Function ? value.unwrap() : value;
export function safeError(error) { return String(error?.message ?? error).replace(/S[A-Z2-7]{55}/g, '[redacted-secret]').slice(0,3000); }
export function checkFee(fee, previous, kind='invoke') {
  assert.match(fee,/^[1-9][0-9]*$/); assert.ok(typeof previous==='bigint' && previous>=0n);
  assert.ok(kind==='invoke'||kind==='upload');const cap=kind==='upload'?100_000_000n:10_000_000n;
  const n=BigInt(fee); assert.ok(n<=cap,`Fee exceeds ${kind==='upload'?'ten':'one'} testnet XLM`);
  assert.ok(previous+n<=300_000_000n,'Aggregate signed fees exceed 30 testnet XLM'); return previous+n;
}
export function retryBeforeSigningAllowed(previous){
  assert.equal(previous.status,'failed');assert.equal(previous.contractId,undefined);assert.deepEqual(previous.transactions,[]);
  assert.ok(previous.checks.some(check=>check.name==='Three distinct dedicated testnet accounts funded by Friendbot'));
  return true;
}
export function pickupPayload(id, action, value) {
  assert.ok(['walk-in','reserve','reserved'].includes(action));
  const address = new Address(id); assert.equal(address.type,'contract');
  return Buffer.concat([Buffer.from(`agyion:market-${action}:v1\0`),Buffer.from(sha(Buffer.from(NETWORK)),'hex'),address.toScVal().toXDR(),value.toXDR()]);
}
export function checkConfirmed(submitted, confirmed) {
  assert.equal(confirmed.status,'SUCCESS'); assert.ok(Number.isSafeInteger(confirmed.ledger)&&confirmed.ledger>0);
  assert.equal(confirmed.envelopeXdr.toXDR('base64'),submitted.toXDR(),'Included envelope differs');
  assert.equal(confirmed.resultXdr.result().switch().name,'txSuccess');
  const fee=BigInt(confirmed.resultXdr.feeCharged().toString()); assert.ok(fee>=0n&&fee<=BigInt(submitted.fee)); return fee;
}
export function checkFailed(submitted, confirmed) {
  assert.equal(confirmed.status,'FAILED');assert.ok(Number.isSafeInteger(confirmed.ledger)&&confirmed.ledger>0);
  assert.equal(confirmed.envelopeXdr.toXDR('base64'),submitted.toXDR(),'Failed inclusion envelope differs');
  const arm=confirmed.resultXdr.result().switch();assert.ok(Number.isInteger(arm.value)&&arm.value<0,'Failure evidence contains a non-failure result');const result=arm.name;
  const fee=BigInt(confirmed.resultXdr.feeCharged().toString());assert.ok(fee>=0n&&fee<=BigInt(submitted.fee));return {fee,result};
}
function runDirectory(value, create=false) {
  assert.equal(typeof value,'string'); const output=path.resolve(value), artifacts=fs.realpathSync(path.join(ROOT,'artifacts'));
  assert.ok(output.startsWith(artifacts+path.sep),'Run must stay inside ignored artifacts');
  assert.ok(fs.realpathSync(path.dirname(output)).startsWith(artifacts+path.sep),'Run parent must be a real artifacts directory');
  if(create)fs.mkdirSync(output,{mode:0o700});
  const info=fs.lstatSync(output); assert.ok(info.isDirectory()&&!info.isSymbolicLink());
  assert.equal(info.mode&0o777,0o700,'Run directory must be 0700'); assert.equal(info.uid,process.getuid()); return output;
}
function secureRead(file) {
  const info=fs.lstatSync(file); assert.ok(info.isFile()&&!info.isSymbolicLink()); assert.equal(info.mode&0o777,0o600); assert.equal(info.uid,process.getuid());
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function prepare(value) {
  const wasm=fs.readFileSync(WASM); assert.equal(sha(wasm),EXPECTED_HASH);
  const output=runDirectory(value,true), keys=Object.fromEntries(ROLES.map(role=>[role,Keypair.random()]));
  fs.writeFileSync(path.join(output,'test-only-secrets.json'),json({testnetOnly:true,roles:Object.fromEntries(ROLES.map(role=>[role,keys[role].secret()]))}),{flag:'wx',mode:0o600});
  fs.writeFileSync(path.join(output,'configuration.json'),json({schema:'agyion-market-testnet-run-v1',network:NETWORK,rpc:RPC,wasmSha256:EXPECTED_HASH,salt:randomBytes(32).toString('hex'),accounts:Object.fromEntries(ROLES.map(role=>[role,keys[role].publicKey()])),preparedAt:new Date().toISOString()}),{flag:'wx',mode:0o600});
  console.log(`Prepared fresh local test identities; no RPC or funding. ${output}`);
}
async function execute(value,retry=false) {
  const output=runDirectory(value), cfg=secureRead(path.join(output,'configuration.json')), secret=secureRead(path.join(output,'test-only-secrets.json'));
  assert.equal(cfg.schema,'agyion-market-testnet-run-v1'); assert.equal(cfg.network,NETWORK); assert.equal(cfg.rpc,RPC); assert.equal(cfg.wasmSha256,EXPECTED_HASH);
  assert.match(cfg.salt,/^[a-f0-9]{64}$/); assert.equal(secret.testnetOnly,true); assert.deepEqual(Object.keys(secret.roles).sort(),[...ROLES].sort());
  const keys=Object.fromEntries(ROLES.map(role=>[role,Keypair.fromSecret(secret.roles[role])]));
  for(const role of ROLES)assert.equal(keys[role].publicKey(),cfg.accounts[role]);
  assert.equal(new Set(Object.values(cfg.accounts)).size,4);
  const wasm=fs.readFileSync(WASM); assert.equal(sha(wasm),EXPECTED_HASH);
  const spec=contract.Spec.fromWasm(wasm), server=new rpc.Server(RPC,{timeout:30});
  const reportFile=path.join(output,'report.json');
  if(retry){
    const previous=secureRead(reportFile);retryBeforeSigningAllowed(previous);assert.equal(previous.wasmSha256,EXPECTED_HASH);assert.deepEqual(previous.accounts,cfg.accounts);
    fs.writeFileSync(path.join(output,'failed-before-signing.json'),json(previous),{flag:'wx',mode:0o600});fs.unlinkSync(reportFile);
  }
  const report={schema:'agyion-market-testnet-evidence-v1',network:NETWORK,rpc:RPC,wasmSha256:EXPECTED_HASH,harnessSha256:sha(fs.readFileSync(fileURLToPath(import.meta.url))),status:'running',startedAt:new Date().toISOString(),accounts:cfg.accounts,feeCaps:{wasmUploadStroops:'100000000',otherTransactionStroops:'10000000',totalSignedStroops:'300000000'},assets:ASSETS.map(a=>({code:a.code,issuer:a.issuer??null,contractId:a.contractId(NETWORK)})),checks:[],transactions:[],offers:[],boundary:'Dedicated Friendbot test identities; actual native XLM transfers only. Circle testnet USDC is an immutable configured SAC, not a claim of tested USDC custody, browser wallet or production readiness.'};
  fs.writeFileSync(reportFile,json(report),{flag:'wx',mode:0o600});
  const save=()=>fs.writeFileSync(reportFile,json(report),{mode:0o600});
  const check=(name,details={})=>{report.checks.push({name,...details});save();console.log(`Verified: ${name}`);};
  let signedFees=0n, market;
  const sendOp=async(label,operation,signer,decode=scValToNative,advanceLedgerBeforeSend=false)=>{
    const tx=new TransactionBuilder(await server.getAccount(signer.publicKey()),{fee:'100',networkPassphrase:NETWORK}).addOperation(operation).setTimeout(90).build();
    // Default RPC root-auth mode is intentional: no non-root authorization bypass.
    const sim=await server.simulateTransaction(tx);
    assert.ok(!rpc.Api.isSimulationError(sim),`${label} simulation: ${sim.error??'no result'}`); assert.ok(sim.result);
    const ready=rpc.assembleTransaction(tx,sim).build(); signedFees=checkFee(ready.fee,signedFees,label==='upload-reviewed-market-wasm'?'upload':'invoke');
    ready.sign(signer); const hash=ready.hash().toString('hex');
    const evidence={label,hash,source:signer.publicKey(),maxFee:ready.fee,status:'prepared',simulationLedger:sim.latestLedger};
    report.transactions.push(evidence);save();
    try {
      if(advanceLedgerBeforeSend){
        assert.ok(Number.isSafeInteger(sim.latestLedger));let advanced=false;
        for(let n=0;n<20;n++){if((await server.getLatestLedger()).sequence>sim.latestLedger){advanced=true;break;}await sleep(1000);}
        assert.ok(advanced,'Ledger did not advance after transaction preparation');
      }
      const sent=await server.sendTransaction(ready);evidence.sendStatus=sent.status;save();
      assert.equal(sent.hash,hash);assert.ok(['PENDING','DUPLICATE'].includes(sent.status),`${label} submission ${sent.status}`);
      for(let n=0;n<55;n++){
        const result=await server.getTransaction(hash);
        if(result.status==='SUCCESS'){
          const fee=checkConfirmed(ready,result); Object.assign(evidence,{status:'SUCCESS',ledger:result.ledger,feeCharged:fee.toString()});save();
          console.log(`Included: ${label} at ledger ${result.ledger}`);return {value:unwrap(decode(result.returnValue)),evidence};
        }
        if(result.status==='FAILED'){const failure=checkFailed(ready,result);Object.assign(evidence,{status:'FAILED',ledger:result.ledger,feeCharged:failure.fee.toString(),transactionResult:failure.result});save();throw new Error(`Chain rejected ${label}: ${hash}`);}
        await sleep(1500);
      }
      throw new Error(`Unresolved inclusion ${hash}; inspect this exact hash before any new submission`);
    }catch(error){if(evidence.status==='prepared')evidence.status='unresolved';save();throw error;}
  };
  const build=async(method,args,source,target=market)=>new TransactionBuilder(await server.getAccount(source),{fee:'100',networkPassphrase:NETWORK}).addOperation(target.call(method,...(target===market?spec.funcArgsToScVals(method,args):args))).setTimeout(90).build();
  const read=async(method,args={},target=market)=>{
    const sim=await server.simulateTransaction(await build(method,args,cfg.accounts.relayer,target));assert.ok(!rpc.Api.isSimulationError(sim),`${method} read: ${sim.error}`);assert.ok(sim.result);
    return target===market?unwrap(spec.funcResToNative(method,sim.result.retval)):scValToNative(sim.result.retval);
  };
  const send=(method,args,signer,advance=false)=>sendOp(method,market.call(method,...spec.funcArgsToScVals(method,args)),signer,value=>spec.funcResToNative(method,value),advance);
  const reject=async(name,method,args,source,expected)=>{
    const sim=await server.simulateTransaction(await build(method,args,source));
    assert.ok(rpc.Api.isSimulationError(sim)&&expected.test(sim.error),`Expected ${expected}; got ${sim.error}`);
    check(name,{simulationOnly:true,error:sim.error.split('\n')[0]});
  };
  const latest=async()=>{const x=await server.getLatestLedger();assert.ok(Number.isSafeInteger(x.sequence)&&x.sequence>0);return x.sequence;};
  const waitPast=async(ledger)=>{for(let n=0;n<140;n++){if(await latest()>ledger)return;await sleep(1500);}throw new Error('Ledger expiry wait exceeded');};
  try {
    assert.equal((await server.getNetwork()).passphrase,NETWORK);
    for(const role of ['seller','buyer','relayer']){
      if(!retry){const response=await fetch(`https://friendbot.stellar.org/?addr=${cfg.accounts[role]}`,{signal:AbortSignal.timeout(30000),redirect:'error'});
      assert.ok(response.ok,`Friendbot ${role}: ${response.status}`);await response.arrayBuffer();}await server.getAccount(cfg.accounts[role]);
    }
    check('Three distinct dedicated testnet accounts funded by Friendbot');
    assert.equal(ASSETS[1].contractId(NETWORK),'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA');
    for(const asset of ASSETS){
      const key=new Contract(asset.contractId(NETWORK)).getFootprint(), found=await server.getLedgerEntries(key);
      assert.equal(found.entries.length,1);assert.equal(found.entries[0].key.toXDR('base64'),key.toXDR('base64'));
      assert.equal(found.entries[0].val.contractData().val().instance().executable().switch().name,'contractExecutableStellarAsset');
    }
    const uploaded=await sendOp('upload-reviewed-market-wasm',Operation.uploadContractWasm({wasm}),keys.seller);
    assert.equal(Buffer.from(uploaded.value).toString('hex'),EXPECTED_HASH);
    const args=spec.funcArgsToScVals('__constructor',{asset_xdrs:ASSETS.map(a=>a.toXDRObject().toXDR())});
    const deployed=await sendOp('deploy-new-market',Operation.createCustomContract({address:new Address(cfg.accounts.seller),wasmHash:Buffer.from(EXPECTED_HASH,'hex'),salt:Buffer.from(cfg.salt,'hex'),constructorArgs:args}),keys.seller);
    assert.match(deployed.value,/^C[A-Z2-7]{55}$/);report.contractId=deployed.value;market=new Contract(deployed.value);save();
    const instance=await server.getLedgerEntries(market.getFootprint());assert.equal(instance.entries.length,1);assert.equal(instance.entries[0].key.toXDR('base64'),market.getFootprint().toXDR('base64'));
    assert.equal(instance.entries[0].val.contractData().val().instance().executable().wasmHash().toString('hex'),EXPECTED_HASH);
    const codeKey=xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({hash:Buffer.from(EXPECTED_HASH,'hex')}));
    const code=await server.getLedgerEntries(codeKey);assert.equal(code.entries.length,1);assert.equal(code.entries[0].key.toXDR('base64'),codeKey.toXDR('base64'));
    const bytes=code.entries[0].val.contractCode().code();assert.equal(sha(bytes),EXPECTED_HASH);assert.ok(Buffer.from(bytes).equals(wasm));
    fs.writeFileSync(path.join(output,'deployed-market.wasm'),bytes,{flag:'wx',mode:0o600});
    assert.equal(await read('protocol_version'),1);
    assert.deepEqual(await read('get_config'),{assets:ASSETS.map(a=>a.contractId(NETWORK)),max_lease_ledgers:720,max_offer_ledgers:1_000_000,max_receipt_ledgers:12});
    check('Separate protocol 1 deployment, exact WASM readback, native XLM and Circle testnet USDC allowlist');
    const asset=ASSETS[0].contractId(NETWORK),token=new Contract(asset),pot=10_000_000n;
    const balance=who=>read('balance',[nativeToScVal(who,{type:'address'})],token);
    const reserves=()=>read('reserved_balance',{asset});
    assert.equal(await balance(report.contractId),0n);assert.equal(await reserves(),0n);
    await send('register_merchant',{seller:cfg.accounts.seller,public_key:keys.venue.rawPublicKey()},keys.seller);
    const merchant=await read('get_merchant',{seller:cfg.accounts.seller});assert.equal(merchant.epoch,1);assert.equal(merchant.seller,cfg.accounts.seller);assert.ok(Buffer.from(merchant.public_key).equals(keys.venue.rawPublicKey()));
    const create=async(price,duration=80,lease=8,termsDelta={})=>{
      const before=await balance(cfg.accounts.seller),r=await send('create_offer',{seller:cfg.accounts.seller,terms:{asset,pot,start_price:price,floor_price:price,slope_num:0n,slope_den:1n,duration_ledgers:duration,lease_ledgers:lease,metadata_hash:randomBytes(32),...termsDelta}},keys.seller);
      assert.ok(typeof r.value==='bigint'&&r.value>0n&&r.value<=(1n<<64n)-1n);report.offers.push(r.value.toString());save();
      assert.equal(await balance(cfg.accounts.seller),before-pot-BigInt(r.evidence.feeCharged));return r.value;
    };
    const get=id=>read('get_offer',{offer_id:id});
    const receipt=async(id,reserved=false)=>{const o=await get(id),now=await latest();return {offer_id:id,claimant:cfg.accounts.buyer,terms_hash:o.terms_hash,key_epoch:1,sequence:o.sequence+(reserved?0n:1n),valid_from:now,valid_until:now+12,max_price:o.terms.start_price,nonce:randomBytes(32)};};
    const signed=(action,value)=>{
      const method=action==='walk-in'?'settle_walk_in':action==='reserved'?'settle_reserved':'reserve',field=action==='reserve'?'permit':'receipt';
      const sc=spec.funcArgsToScVals(method,{[field]:value,signature:Buffer.alloc(64)})[0];return keys.venue.sign(pickupPayload(report.contractId,action,sc));
    };
    const settle=async(method,r,sig,price)=>{
      const beforeBuyer=await balance(cfg.accounts.buyer),beforeSeller=await balance(cfg.accounts.seller);
      const done=await send(method,{receipt:r,signature:sig},keys.buyer);
      assert.equal(await balance(cfg.accounts.buyer),beforeBuyer-price-BigInt(done.evidence.feeCharged));
      assert.equal(await balance(cfg.accounts.seller),beforeSeller+pot+price);
      const o=await get(r.offer_id);assert.equal(o.state,2);assert.equal(o.settled_price,price);assert.equal(o.settled_to,cfg.accounts.buyer);
      assert.equal(await reserves(),0n);assert.equal(await balance(report.contractId),0n);
    };
    for(const price of [1_000_000n,0n,-1_000_000n]){
      const id=await create(price),r=await receipt(id),signature=signed('walk-in',r);
      assert.equal(await reserves(),pot);assert.equal(await balance(report.contractId),pot);
      const enforced=await server.simulateTransaction(await build('settle_walk_in',{receipt:r,signature},cfg.accounts.relayer),undefined,'enforce');
      assert.ok(rpc.Api.isSimulationError(enforced)&&/Error\(Auth,\s*InvalidAction\)/.test(enforced.error),`Missing claimant authorization was not rejected: ${enforced.error}`);
      check(`Price ${price} requires claimant authorization even with a valid venue receipt`,{simulationOnly:true,mode:'enforce',error:enforced.error.split('\n')[0]});
      if(price===1_000_000n){
        const foreign={...r,claimant:cfg.accounts.relayer};
        await reject('Venue signature cannot redirect a pickup to a different claimant','settle_walk_in',{receipt:foreign,signature},cfg.accounts.relayer,/Error\(Crypto,\s*InvalidInput\)/);
      }
      await settle('settle_walk_in',r,signature,price);
      await reject(`Walk-in ${price} replay rejected`,'settle_walk_in',{receipt:r,signature},cfg.accounts.buyer,/Error\(Contract,\s*#2\)/);
      check(`Actual walk-in price ${price}: exact claimant and seller deltas, fee accounted, all reserve returned`);
    }
    const moving=await create(2_000_000n,80,0,{floor_price:1_000_000n,slope_num:10_000n});
    const movingReceipt=await receipt(moving),buyerBefore=await balance(cfg.accounts.buyer),sellerBefore=await balance(cfg.accounts.seller);
    const moved=await send('settle_walk_in',{receipt:movingReceipt,signature:signed('walk-in',movingReceipt)},keys.buyer,true);
    const movingOffer=await get(moving),computed=2_000_000n-10_000n*BigInt(movingReceipt.valid_from-movingOffer.start_ledger),paid=computed<1_000_000n?1_000_000n:computed;
    const atInclusion=2_000_000n-10_000n*BigInt(moved.evidence.ledger-movingOffer.start_ledger),livePrice=atInclusion<1_000_000n?1_000_000n:atInclusion;
    assert.ok(moved.evidence.ledger>moved.evidence.simulationLedger+1,'Moving-price test did not cross execution ledgers');
    assert.ok(livePrice<paid,'Live curve did not decline below the fixed signed quote');assert.equal(movingOffer.state,2);assert.equal(movingOffer.settled_price,paid);
    assert.equal(await balance(cfg.accounts.buyer),buyerBefore-paid-BigInt(moved.evidence.feeCharged));
    assert.equal(await balance(cfg.accounts.seller),sellerBefore+pot+paid);assert.equal(await reserves(),0n);assert.equal(await balance(report.contractId),0n);
    check('Exact positive quote debit succeeds across ledger advancement while the browsing price declines',{quoteLedger:movingReceipt.valid_from,simulationLedger:moved.evidence.simulationLedger,includedLedger:moved.evidence.ledger,settledQuotePrice:paid.toString(),liveCurveAtInclusion:livePrice.toString()});
    const reservationId=await create(-1_000_000n,100,12);
    const first=await receipt(reservationId),permit={receipt:first,lease_until:first.valid_from+12};
    await send('reserve',{permit,signature:signed('reserve',permit)},keys.buyer);
    assert.equal((await get(reservationId)).state,1);assert.equal(await reserves(),pot);
    await reject('Another account cannot cancel customer reservation','cancel_reservation',{offer_id:reservationId,claimant:cfg.accounts.relayer,sequence:1n},cfg.accounts.relayer,/Error\(Contract,\s*#16\)/);
    const oldHandoff={...await receipt(reservationId,true)},oldSignature=signed('reserved',oldHandoff);
    await send('cancel_reservation',{offer_id:reservationId,claimant:cfg.accounts.buyer,sequence:1n},keys.buyer);
    assert.equal((await get(reservationId)).state,0);assert.equal(await reserves(),pot);assert.equal(await read('get_active',{seller:cfg.accounts.seller,claimant:cfg.accounts.buyer}),null);
    const next=await receipt(reservationId),nextPermit={receipt:next,lease_until:next.valid_from+12};
    await send('reserve',{permit:nextPermit,signature:signed('reserve',nextPermit)},keys.buyer);
    await reject('Cancelled receipt cannot settle reopened same-customer reservation','settle_reserved',{receipt:oldHandoff,signature:oldSignature},cfg.accounts.buyer,/Error\(Contract,\s*#7\)/);
    const final=await receipt(reservationId,true);await settle('settle_reserved',final,signed('reserved',final),-1_000_000n);
    check('Reservation, authorized cancellation, reopening, old-sequence rejection and actual reserved payout');
    const expires=await create(0n,24,8),expReceipt=await receipt(expires),expPermit={receipt:expReceipt,lease_until:expReceipt.valid_from+8};
    await send('reserve',{permit:expPermit,signature:signed('reserve',expPermit)},keys.buyer);
    await waitPast(expPermit.lease_until);
    const beforeExpiry=await balance(cfg.accounts.seller),expired=await send('expire_reservation',{offer_id:expires},keys.relayer);
    const reopened=await get(expires);assert.equal(reopened.sequence,1n);
    assert.equal(await read('get_active',{seller:cfg.accounts.seller,claimant:cfg.accounts.buyer}),null);
    if(expired.evidence.ledger<=reopened.deadline_ledger){
      assert.equal(reopened.state,0);assert.equal(await reserves(),pot);assert.equal(await balance(cfg.accounts.seller),beforeExpiry);
      check('Expired lease reopened before original offer deadline and retained its pot');
      await waitPast(reopened.deadline_ledger);const beforeRefund=await balance(cfg.accounts.seller);
      await send('refund',{offer_id:expires},keys.relayer);assert.equal(await balance(cfg.accounts.seller),beforeRefund+pot);
    }else{
      assert.equal(reopened.state,3);assert.equal(await reserves(),0n);assert.equal(await balance(cfg.accounts.seller),beforeExpiry+pot);
      check('Delayed expiry transaction included after listing deadline and refunded directly',{expiryInclusionLedger:expired.evidence.ledger,offerDeadline:reopened.deadline_ledger});
    }
    assert.equal((await get(expires)).state,3);await reject('Final refund cannot be repeated','refund',{offer_id:expires},cfg.accounts.relayer,/Error\(Contract,\s*#2\)/);
    assert.equal(await reserves(),0n);assert.equal(await balance(report.contractId),0n);
    assert.equal(await read('reserved_balance',{asset:ASSETS[1].contractId(NETWORK)}),0n);
    check('Permissionless expired lease cleanup and deadline refund leave zero native/USDC obligations');
    report.totalFeesCharged=report.transactions.reduce((sum,t)=>sum+BigInt(t.feeCharged??0),0n).toString();
    report.status='passed';
  }catch(error){report.status='failed';report.error=safeError(error);throw error;}
  finally{report.finishedAt=new Date().toISOString();save();console.log(`Market testnet run ${report.status}; evidence ${reportFile}`);}
}
async function main(){
  const [mode,value,...extra]=process.argv.slice(2);assert.equal(extra.length,0);
  if(mode==='--prepare'){assert.ok(value);prepare(value);}
  else if(mode==='--execute'){assert.ok(value);await execute(value);}
  else if(mode==='--retry-before-signing'){assert.ok(value);await execute(value,true);}
  else{assert.ok(!mode||mode==='--plan');assert.equal(value,undefined);console.log('Plan only: prepare fresh test identities, verify reviewed market WASM, fund with Friendbot, deploy separate native-XLM/Circle-testnet-USDC contract, test settlement and reservation recovery, verify zero obligations. No RPC or writes.');}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(safeError(error));process.exitCode=1;});
