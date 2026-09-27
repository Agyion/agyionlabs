/** Dedicated valueless Stellar testnet verification. No deployment or runtime mutation.
 * Default/--plan performs no network or file writes. Explicit --prepare OUTPUT
 * creates new local identities; --fund OUTPUT and --exercise OUTPUT send only
 * bounded testnet transactions. Failed or uncertain phases are never resumed.
 * Derived from the frozen development harness used for the dated USDC receipts;
 * path/CLI hardening makes this published source a different byte identity.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {checkConfirmed,checkFailed,pickupPayload,safeError} from './verify-testnet-market.mjs';
import {parsePrivateJson} from './lib/private-json.mjs';
const ROOT=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const require=createRequire(path.join(ROOT,'app/package.json'));
const {Keypair,Asset,Contract,Operation,TransactionBuilder,nativeToScVal,scValToNative,xdr,rpc,contract}=require('@stellar/stellar-sdk');
const RPC='https://soroban-testnet.stellar.org',HORIZON='https://horizon-testnet.stellar.org';
const NETWORK='Test SDF Network ; September 2015';
const MARKET='CCS7FTPT5XGKN7Q6Y3W3EIRPNF5LE7AV2FAVZ4YYERNGUBU24AAMCSPJ';
const HASH='b1947f2ac6bfa3f42535ed571b956c9fd1ab425b1441adca99d2c8c919ed1c6c';
const ISSUER='GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const USDC=new Asset('USDC',ISSUER),TOKEN='CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
const ROLES=['seller','buyer','relayer','venue'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const json=v=>JSON.stringify(v,(_k,x)=>typeof x==='bigint'?x.toString():x,2)+'\n';
const writeRun=(RUN,name,v,create=false)=>fs.writeFileSync(path.join(RUN,name),json(v),{mode:0o600,...(create?{flag:'wx'}:{})});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const unwrap=v=>v?.unwrap instanceof Function?v.unwrap():v;
export function decimalUnits(s){assert.match(s,/^(0|[1-9][0-9]*)\.[0-9]{7}$/);return BigInt(s.replace('.',''));}
export function decimalString(n){assert.ok(typeof n==='bigint'&&n>=0n);return `${n/10000000n}.${(n%10000000n).toString().padStart(7,'0')}`;}
export function acquisitionLimit(quote){const amount=decimalUnits(quote);assert.ok(amount>0n);const limit=(amount*105n+99n)/100n;assert.ok(limit<=100000000n,'Acquisition exceeds 10 test XLM');return limit;}
export function feeLimit(fee,previous){assert.match(fee,/^[1-9][0-9]*$/);assert.ok(typeof previous==='bigint'&&previous>=0n);const n=BigInt(fee);assert.ok(n<=10000000n,'Fee exceeds one test XLM');assert.ok(previous+n<=100000000n,'Total signed fees exceed ten test XLM');return previous+n;}
function secureRead(RUN,name){const file=path.join(RUN,name),s=fs.lstatSync(file);assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.uid===process.getuid());assert.equal(s.mode&0o777,0o600);return parsePrivateJson(fs.readFileSync(file,'utf8'));}
function runDirectory(value,create=false){
 assert.ok(typeof value==='string'&&value.trim().length>0,'An explicit output directory is required');
 const output=path.resolve(value),artifacts=path.join(ROOT,'artifacts'),relative=path.relative(artifacts,output);
 assert.ok(relative&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative),'Output must remain under ignored artifacts');
 const directory=(file,privateRun=false)=>{const info=fs.lstatSync(file);assert.ok(info.isDirectory()&&!info.isSymbolicLink(),'Output directories cannot be symlinks');assert.equal(info.uid,process.getuid(),'Output directories must be owned by this user');assert.equal(fs.realpathSync(file),file,'Output ancestors cannot contain symlinks');if(privateRun)assert.equal(info.mode&0o777,0o700,'Run directory must be 0700');};
 directory(artifacts);let ancestor=artifacts;for(const part of relative.split(path.sep).slice(0,-1)){ancestor=path.join(ancestor,part);directory(ancestor);}
 if(create)fs.mkdirSync(output,{mode:0o700});directory(output,true);return output;
}
function claimPhase(RUN,mode){
 // Exclusive creation is the cross-process decision. A crash or failure keeps
 // the marker; neither the same command nor another process may retry it.
 const fd=fs.openSync(path.join(RUN,`${mode}.claim`),'wx',0o600);
 try{fs.writeFileSync(fd,json({schema:'agyion-testnet-phase-claim-v1',phase:mode,pid:process.pid,claimedAt:new Date().toISOString()}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 const directory=fs.openSync(RUN,'r');try{fs.fsyncSync(directory);}finally{fs.closeSync(directory);}
}
function prepare(value){
 const RUN=runDirectory(value,true),write=(name,v,create=false)=>writeRun(RUN,name,v,create),keys=Object.fromEntries(ROLES.map(r=>[r,Keypair.random()]));
 write('secrets.json',{testnetOnly:true,roles:Object.fromEntries(ROLES.map(r=>[r,keys[r].secret()]))},true);
 write('config.json',{schema:'agyion-market-usdc-testnet-v1',network:NETWORK,rpc:RPC,market:MARKET,wasmHash:HASH,asset:TOKEN,issuer:ISSUER,accounts:Object.fromEntries(ROLES.map(r=>[r,keys[r].publicKey()])),harnessSha256:sha(fs.readFileSync(fileURLToPath(import.meta.url)))},true);
 write('report.json',{schema:'agyion-market-usdc-evidence-v1',status:'prepared',startedAt:new Date().toISOString(),network:NETWORK,market:MARKET,wasmHash:HASH,asset:TOKEN,issuer:ISSUER,transactions:[],checks:[],offers:[],friendbot:[],boundary:'Valueless testnet assets and dedicated identities; existing pinned marketplace, no mainnet or deployment changes. Five canonical Circle test USDC acquired through the public testnet order book, not minted by this harness. No browser/extension or bank payout claim.'},true);
 console.log('Prepared dedicated testnet identities; no network or funding.');
}
async function boundedJson(url){const r=await fetch(url,{redirect:'error',credentials:'omit',signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);const reader=r.body.getReader();let size=0;const pieces=[];try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;assert.ok(size<=1024*1024);pieces.push(value);}return JSON.parse(Buffer.concat(pieces).toString());}finally{await reader.cancel().catch(()=>{});}}
async function execute(mode,value){
 const RUN=runDirectory(value),write=(name,v,create=false)=>writeRun(RUN,name,v,create);
 const cfg=secureRead(RUN,'config.json'),secrets=secureRead(RUN,'secrets.json'),report=secureRead(RUN,'report.json');
 assert.equal(cfg.schema,'agyion-market-usdc-testnet-v1');assert.equal(cfg.network,NETWORK);assert.equal(cfg.rpc,RPC);assert.equal(cfg.market,MARKET);assert.equal(cfg.wasmHash,HASH);assert.equal(cfg.asset,TOKEN);assert.equal(cfg.issuer,ISSUER);assert.equal(secrets.testnetOnly,true);
 assert.equal(cfg.harnessSha256,sha(fs.readFileSync(fileURLToPath(import.meta.url))),'Harness changed after preparation');
 assert.deepEqual(Object.keys(secrets.roles).sort(),[...ROLES].sort());const keys=Object.fromEntries(ROLES.map(r=>[r,Keypair.fromSecret(secrets.roles[r])]));for(const r of ROLES)assert.equal(keys[r].publicKey(),cfg.accounts[r]);assert.equal(new Set(Object.values(cfg.accounts)).size,4);
 assert.equal(USDC.contractId(NETWORK),TOKEN);assert.ok(['fund','exercise'].includes(mode));assert.equal(report.status,mode==='fund'?'prepared':'funded','No implicit resume or resubmission');
 const server=new rpc.Server(RPC,{timeout:30}),market=new Contract(MARKET),token=new Contract(TOKEN);let spec;
 const save=()=>write('report.json',report),check=(name,data={})=>{report.checks.push({name,...data});save();console.log(`Verified: ${name}`);};
 let totalFees=report.transactions.reduce((n,t)=>n+BigInt(t.maxFee),0n);
 claimPhase(RUN,mode);
 async function broadcast(label,tx,signer){
  totalFees=feeLimit(tx.fee,totalFees);assert.equal(tx.source,signer.publicKey());assert.equal(tx.networkPassphrase,NETWORK);assert.equal(tx.operations.length,1);
  tx.sign(signer);const hash=tx.hash().toString('hex'),evidence={label,hash,source:signer.publicKey(),maxFee:tx.fee,status:'prepared'};
  fs.writeFileSync(path.join(RUN,`${hash}.xdr`),tx.toXDR(),{flag:'wx',mode:0o600});report.transactions.push(evidence);save();
  try{const response=await server.sendTransaction(tx);assert.equal(response.hash,hash);evidence.sendStatus=response.status;save();assert.ok(['PENDING','DUPLICATE'].includes(response.status));
   for(let n=0;n<50;n++){const result=await server.getTransaction(hash);if(result.status==='SUCCESS'){const fee=checkConfirmed(tx,result);Object.assign(evidence,{status:'SUCCESS',ledger:result.ledger,feeCharged:fee.toString()});save();console.log(`Included: ${label} ${hash}`);return {result,evidence};}if(result.status==='FAILED'){const failure=checkFailed(tx,result);Object.assign(evidence,{status:'FAILED',ledger:result.ledger,feeCharged:failure.fee.toString(),transactionResult:failure.result});save();throw Error(`Confirmed failure ${hash}`);}await sleep(1500);}throw Error(`Unresolved ${hash}; reconcile before any further action`);
  }catch(error){if(evidence.status==='prepared')evidence.status='unresolved';save();throw error;}
 }
 async function classic(label,operation,signer){const tx=new TransactionBuilder(await server.getAccount(signer.publicKey()),{fee:'100',networkPassphrase:NETWORK}).addOperation(operation).setTimeout(90).build();return broadcast(label,tx,signer);}
 async function build(method,args,source,target=market){return new TransactionBuilder(await server.getAccount(source),{fee:'100',networkPassphrase:NETWORK}).addOperation(target.call(method,...(target===market?spec.funcArgsToScVals(method,args):args))).setTimeout(90).build();}
 async function read(method,args={},target=market){const sim=await server.simulateTransaction(await build(method,args,cfg.accounts.relayer,target));assert.ok(!rpc.Api.isSimulationError(sim),safeError(sim.error));assert.ok(sim.result);return target===market?unwrap(spec.funcResToNative(method,sim.result.retval)):scValToNative(sim.result.retval);}
 async function send(method,args,signer){const tx=await build(method,args,signer.publicKey()),sim=await server.simulateTransaction(tx);assert.ok(!rpc.Api.isSimulationError(sim),safeError(sim.error));assert.ok(sim.result);const outcome=await broadcast(method,rpc.assembleTransaction(tx,sim).build(),signer);return {...outcome,value:unwrap(spec.funcResToNative(method,outcome.result.returnValue))};}
 const balance=who=>read('balance',[nativeToScVal(who,{type:'address'})],token),reserve=()=>read('reserved_balance',{asset:TOKEN});
 const latest=async()=>{const l=(await server.getLatestLedger()).sequence;assert.ok(Number.isSafeInteger(l)&&l>0);return l;};
 const balances=async()=>({seller:await balance(cfg.accounts.seller),buyer:await balance(cfg.accounts.buyer),contract:await balance(MARKET),reserve:await reserve()});
 try{
  report.status=`${mode}-running`;save();assert.equal((await server.getNetwork()).passphrase,NETWORK);
  const wasm=fs.readFileSync(path.join(ROOT,'contracts/fade-market/target/wasm32v1-none/release/fade_market.wasm'));assert.equal(sha(wasm),HASH);spec=contract.Spec.fromWasm(wasm);
  for(const [key,validate]of [[market.getFootprint(),v=>assert.equal(v.contractData().val().instance().executable().wasmHash().toString('hex'),HASH)],[token.getFootprint(),v=>assert.equal(v.contractData().val().instance().executable().switch().name,'contractExecutableStellarAsset')],[xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({hash:Buffer.from(HASH,'hex')})),v=>assert.ok(Buffer.from(v.contractCode().code()).equals(wasm))]]){const r=await server.getLedgerEntries(key);assert.equal(r.entries.length,1);assert.equal(r.entries[0].key.toXDR('base64'),key.toXDR('base64'));validate(r.entries[0].val);}
  check('Exact existing marketplace WASM and canonical Circle testnet SAC verified');
  if(mode==='fund'){
   for(const role of ['seller','buyer','relayer']){const attempt={role,address:cfg.accounts[role],status:'requested'};report.friendbot.push(attempt);save();await boundedJson(`https://friendbot.stellar.org/?addr=${cfg.accounts[role]}`);await server.getAccount(cfg.accounts[role]);attempt.status='account-observed';save();}
   for(const role of ['seller','buyer'])await classic(`USDC-trustline-${role}`,Operation.changeTrust({asset:USDC,limit:'10'}),keys[role]);
   assert.equal(await balance(cfg.accounts.seller),0n);assert.equal(await balance(cfg.accounts.buyer),0n);
   const q=new URL(`${HORIZON}/paths/strict-receive`);for(const [k,v]of Object.entries({source_assets:'native',destination_asset_type:'credit_alphanum4',destination_asset_code:'USDC',destination_asset_issuer:ISSUER,destination_amount:'5'}))q.searchParams.set(k,v);
   const paths=(await boundedJson(q))._embedded.records;assert.ok(Array.isArray(paths));const quote=paths.find(p=>p.source_asset_type==='native'&&p.destination_asset_type==='credit_alphanum4'&&p.destination_asset_code==='USDC'&&p.destination_asset_issuer===ISSUER&&p.destination_amount==='5.0000000'&&Array.isArray(p.path)&&p.path.length===0);assert.ok(quote,'No direct canonical test USDC liquidity');
   const max=acquisitionLimit(quote.source_amount);report.acquisition={quoteXlm:quote.source_amount,maxXlm:decimalString(max),usdc:'5.0000000',slippagePercent:5,route:'direct testnet order book',requestedAt:new Date().toISOString()};save();
   const nativeBalance=async()=>{const key=xdr.LedgerKey.account(new xdr.LedgerKeyAccount({accountId:keys.seller.xdrPublicKey()}));const r=await server.getLedgerEntries(key);assert.equal(r.entries.length,1);assert.equal(r.entries[0].key.toXDR('base64'),key.toXDR('base64'));return BigInt(r.entries[0].val.account().balance().toString());};
   const before=await nativeBalance();const acquired=await classic('acquire-five-Circle-test-USDC',Operation.pathPaymentStrictReceive({sendAsset:Asset.native(),sendMax:decimalString(max),destination:cfg.accounts.seller,destAsset:USDC,destAmount:'5',path:[]}),keys.seller);
   assert.equal(await balance(cfg.accounts.seller),50000000n);const spent=before-await nativeBalance()-BigInt(acquired.evidence.feeCharged);assert.ok(spent>0n&&spent<=max&&spent<=100000000n);report.acquisition.actualXlm=decimalString(spent);save();
   await classic('distribute-one-test-USDC-to-buyer',Operation.payment({destination:cfg.accounts.buyer,asset:USDC,amount:'1'}),keys.seller);assert.equal(await balance(cfg.accounts.seller),40000000n);assert.equal(await balance(cfg.accounts.buyer),10000000n);
   check('Exactly five canonical test USDC obtained within quote and hard cap; four seller, one buyer',report.acquisition);report.status='funded';
  }else{
   assert.equal(await read('protocol_version'),1);const config=await read('get_config');assert.ok(config.assets.includes(TOKEN));
   const initial=await balances();assert.deepEqual(initial,{seller:40000000n,buyer:10000000n,contract:0n,reserve:0n});report.initialBalances=initial;save();
   await send('register_merchant',{seller:cfg.accounts.seller,public_key:keys.venue.rawPublicKey()},keys.seller);const merchant=await read('get_merchant',{seller:cfg.accounts.seller});assert.equal(merchant.epoch,1);assert.ok(Buffer.from(merchant.public_key).equals(keys.venue.rawPublicKey()));
   const pot=10000000n;
   async function create(price,duration=120){const before=await balances();const result=await send('create_offer',{seller:cfg.accounts.seller,terms:{asset:TOKEN,pot,start_price:price,floor_price:price,slope_num:0n,slope_den:1n,duration_ledgers:duration,lease_ledgers:0,metadata_hash:randomBytes(32)}},keys.seller);assert.ok(typeof result.value==='bigint'&&result.value>0n);report.offers.push(result.value.toString());save();assert.deepEqual(await balances(),{...before,seller:before.seller-pot,contract:before.contract+pot,reserve:before.reserve+pot});return result.value;}
   for(const price of [1000000n,0n,-1000000n]){
    const id=await create(price),o=await read('get_offer',{offer_id:id}),now=await latest(),receipt={offer_id:id,claimant:cfg.accounts.buyer,terms_hash:o.terms_hash,key_epoch:1,sequence:o.sequence+1n,valid_from:now,valid_until:now+12,max_price:price,nonce:randomBytes(32)};
    const value=spec.funcArgsToScVals('settle_walk_in',{receipt,signature:Buffer.alloc(64)})[0],signature=keys.venue.sign(pickupPayload(MARKET,'walk-in',value));
    const before=await balances();await send('settle_walk_in',{receipt,signature},keys.buyer);const after=await balances();assert.deepEqual(after,{seller:before.seller+pot+price,buyer:before.buyer-price,contract:0n,reserve:0n});const settled=await read('get_offer',{offer_id:id});assert.equal(settled.state,2);assert.equal(settled.settled_price,price);assert.equal(settled.settled_to,cfg.accounts.buyer);
    const replay=await server.simulateTransaction(await build('settle_walk_in',{receipt,signature},cfg.accounts.buyer));assert.ok(rpc.Api.isSimulationError(replay)&&/Error\(Contract,\s*#2\)/.test(replay.error));check(`USDC ${price}: exact payer/recipient/pot/reserve deltas and replay rejection`,{offerId:id.toString(),price:price.toString(),before,after});
   }
   const id=await create(0n,8),offer=await read('get_offer',{offer_id:id});let expired=false;for(let n=0;n<80;n++){if(await latest()>offer.deadline_ledger){expired=true;break;}await sleep(1500);}assert.ok(expired,'Deadline wait exceeded');const before=await balances();await send('refund',{offer_id:id},keys.relayer);assert.deepEqual(await balances(),{...before,seller:before.seller+pot,contract:0n,reserve:0n});assert.equal((await read('get_offer',{offer_id:id})).state,3);
   const replay=await server.simulateTransaction(await build('refund',{offer_id:id},cfg.accounts.relayer));assert.ok(rpc.Api.isSimulationError(replay)&&/Error\(Contract,\s*#2\)/.test(replay.error));check('USDC deadline refund restores seller pot and rejects duplicate refund');
   report.finalBalances=await balances();assert.deepEqual(report.finalBalances,initial);report.status='passed';check('All five test USDC accounted for; marketplace USDC balance and reserve zero',report.finalBalances);
  }
 }catch(error){report.status=`${mode}-failed`;report.error=safeError(error);throw error;}finally{report.finishedAt=new Date().toISOString();report.totalFeeCharged=report.transactions.reduce((s,t)=>s+BigInt(t.feeCharged??0),0n).toString();save();console.log(`USDC run status: ${report.status}`);}
}
async function main(){
 const [mode,value,...extra]=process.argv.slice(2);assert.equal(extra.length,0,'Too many command arguments');
 if(!mode||mode==='--plan'){assert.equal(value,undefined,'Plan takes no output directory');console.log('Plan only. Fresh keys, trustlines, one bounded 5-USDC acquisition, existing market USDC settlement and refund. No network or file writes.');return;}
 assert.ok(['--prepare','--fund','--exercise'].includes(mode),'Usage: verify-testnet-market-usdc.mjs [--plan | --prepare OUTPUT | --fund OUTPUT | --exercise OUTPUT]');
 assert.ok(typeof value==='string'&&value.trim().length>0,'An explicit output directory is required');
 if(mode==='--prepare')prepare(value);else await execute(mode.slice(2),value);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(safeError(e));process.exitCode=1;});
