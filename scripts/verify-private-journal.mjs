// Independent browser fault-injection checks. Public synthetic attempts only;
// no signer, transaction transport or external network access is provided.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';

const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(new URL('../contracts/private-pool/client/package.json',import.meta.url));
const {Keypair,hash}=require('@stellar/stellar-sdk');
const output=path.resolve(process.env.JOURNAL_REVIEW_OUTPUT||path.join(root,'artifacts/security/2026-09-26/privacy/journal-independent'));
fs.mkdirSync(output,{recursive:true});
const sourcePath=path.join(root,'contracts/private-pool/client/journal.ts');
let bundle,source;
if(process.env.JOURNAL_REVIEW_BUNDLE){
 bundle=fs.readFileSync(path.resolve(process.env.JOURNAL_REVIEW_BUNDLE));
 source=JSON.parse(fs.readFileSync(path.join(path.dirname(path.resolve(process.env.JOURNAL_REVIEW_BUNDLE)),'source.json'),'utf8'));
}else{
 const {build}=require(path.join(root,'landing/node_modules/esbuild/lib/main.js'));
 const text=fs.readFileSync(sourcePath,'utf8');
 await build({stdin:{contents:text+'\nglobalThis.journalFactory=createIndexedDbSubmissionJournal;\n',resolveDir:path.dirname(sourcePath),loader:'ts'},bundle:true,platform:'browser',format:'esm',target:'chrome120',define:{'process.browser':'true'},outfile:path.join(output,'journal.js'),logLevel:'silent'});
 bundle=fs.readFileSync(path.join(output,'journal.js'));
 source={path:'contracts/private-pool/client/journal.ts',sha256:createHash('sha256').update(text).digest('hex')};
}
const fixture=JSON.parse(fs.readFileSync(path.join(root,'contracts/private-pool/fixtures/verified-v2/proofs/02-create-pod.json'),'utf8'));
const pool=JSON.parse(fs.readFileSync(path.join(root,'contracts/private-pool/fixtures/host-config.json'),'utf8')).pool;
const a={version:1,retryOf:null,hash:'11'.repeat(32),sequence:'101',callHash:'22'.repeat(32),releaseId:'33'.repeat(32),pool,
 source:Keypair.fromRawEd25519Seed(Buffer.alloc(32,93)).publicKey(),recordId:fixture.ciphertextDigest,publicSignals:fixture.publicSignals};
const changed=structuredClone(a);changed.hash='55'.repeat(32);changed.source=Keypair.fromRawEd25519Seed(Buffer.alloc(32,94)).publicKey();
changed.publicSignals[23]=(BigInt(changed.publicSignals[23])+1n).toString();
changed.recordId=hash(Buffer.concat(changed.publicSignals.slice(23).map(n=>Buffer.from(BigInt(n).toString(16).padStart(64,'0'),'hex')))).toString('hex');
const intent=({releaseId,pool,source,recordId,publicSignals})=>({releaseId,pool,source,recordId,publicSignals});
const report={at:new Date().toISOString(),source,bundleSha256:createHash('sha256').update(bundle).digest('hex'),checks:[],requests:[],console:[],pageErrors:[],csp:[],status:'running',
 boundary:'Actual headless Chromium IndexedDB and Web Locks across two pages. Corruption is deliberate local fault injection, not a claim that normal IDB transactions partially commit. No storage rollback resilience, physical disk flush, live signing, RPC or submission claim.'};
const server=http.createServer((req,res)=>{
 res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; connect-src 'none'; img-src 'self'");
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.writeHead(405);res.end();return;}
 if(req.url==='/journal.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle);return;}
 if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Local journal verification</title><h1>Public transaction journal</h1><p>Local synthetic storage checks. No transaction submission.</p><script type="module" src="/journal.js"></script>');return;}
 res.writeHead(404);res.end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
let browser,serial=0;
const name=()=>`agyion.journal.review.${Date.now()}.${++serial}`;
async function check(label,operation){
 try{const result=await operation();report.checks.push({name:label,passed:result===true,result});}
 catch(error){report.checks.push({name:label,passed:false,error:error?.message?.slice(0,200)||'BROWSER_CHECK_FAILED'});}
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
}
async function init(page,dbName){return page.evaluate(async name=>{globalThis.journal=await globalThis.journalFactory({name});},dbName);}
async function mutate(page,dbName,operation,id){
 return page.evaluate(async({dbName,operation,id})=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(dbName,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const tx=db.transaction(['attempts','terminals','reservations'],'readwrite');
  const done=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);});
  const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const bases=tx.objectStore('attempts'),res=tx.objectStore('reservations'),term=tx.objectStore('terminals');
  if(operation==='delete-reservations')res.clear();
  else if(operation==='delete-attempt')bases.delete(id);
  else if(operation==='bad-digest'){const row=await request(bases.get(id));row.digest='00'.repeat(32);bases.put(row);}
  else if(operation==='orphan-terminal')term.put({hash:id,status:'confirmed',ledger:1001});
  else if(operation==='bad-reservation'){const rows=await request(res.getAll());rows[0].hash='66'.repeat(32);res.put(rows[0]);}
  else if(operation==='delete-one-reservation'){const keys=await request(res.getAllKeys());res.delete(keys[0]);}
  else if(operation==='extra-reservation')res.put({key:'unexpected-reservation-key',hash:id});
  else if(operation==='delete-terminal')term.delete(id);
  else throw new Error('UNKNOWN_REVIEW_MUTATION');
  await done;db.close();
 },{dbName,operation,id});
}
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--disable-background-networking']});
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',route=>{
  const request=route.request(),u=new URL(request.url()),allowed=u.origin===base&&['/','/journal.js','/favicon.ico'].includes(u.pathname)&&request.method()==='GET'&&!u.search&&!request.postData();
  report.requests.push({method:request.method(),allowed,path:allowed?u.pathname:'[unexpected URL redacted]'});
  return allowed?route.continue():route.abort();
 });
 await context.exposeBinding('__journalCsp',()=>report.csp.push({violation:true}));
 await context.addInitScript(()=>document.addEventListener('securitypolicyviolation',()=>globalThis.__journalCsp()));
 const pages=await Promise.all([context.newPage(),context.newPage()]);
 for(const p of pages){p.on('console',m=>report.console.push({type:m.type(),characters:m.text().length}));p.on('pageerror',()=>report.pageErrors.push('SANITIZED_PAGE_ERROR'));await p.goto(base);await p.waitForFunction(()=>typeof globalThis.journalFactory==='function');}
 const [p,q]=pages;
 await check('two actual pages: one winner for concurrent identical atomic commits',async()=>{
  const db=name();await Promise.all(pages.map(page=>init(page,db)));
  const results=await Promise.all(pages.map(page=>page.evaluate(async a=>{try{await journal.commit(a);return true;}catch{return false;}},a)));
  return results.filter(Boolean).length===1;
 });
 await check('different sources cannot reserve an already pending nullifier',async()=>{
  try{await q.evaluate(async changed=>journal.commit(changed),changed);return false;}catch{return await q.evaluate(async hash=>await journal.get(hash)===null,changed.hash);}
 });
 await check('Web Locks serialize actual overlapping work from two pages',async()=>{
  const hold=p.evaluate(()=>journal.exclusive(async()=>{globalThis.lockEntered=true;await new Promise(resolve=>globalThis.releaseLock=resolve);}));
  await p.waitForFunction(()=>globalThis.lockEntered===true);
  const following=q.evaluate(()=>{globalThis.followRequested=true;return journal.exclusive(async()=>{globalThis.followEntered=true;});});
  await q.waitForFunction(()=>globalThis.followRequested===true);await new Promise(resolve=>setTimeout(resolve,100));
  const blocked=await q.evaluate(()=>globalThis.followEntered!==true);
  await p.evaluate(()=>globalThis.releaseLock());await Promise.all([hold,following]);
  return blocked&&await q.evaluate(()=>globalThis.followEntered===true);
 });
 await check('reload retains the pending attempt and reservations',async()=>{
  const db=name();await init(p,db);await p.evaluate(a=>journal.commit(a),a);await p.reload();await p.waitForFunction(()=>typeof globalThis.journalFactory==='function');await init(p,db);
  return p.evaluate(async({a,i})=>{const saved=await journal.get(a.hash);return saved.attempt.hash===a.hash&&saved.terminal===null&&(await journal.conflicts(i)).length===1;},{a,i:intent(a)});
 });
 await check('reload discovers pending immutable hashes without a separate index',async()=>{
  return p.evaluate(async a=>{const entries=await journal.pending();return entries.length===1&&entries[0].hash===a.hash&&Object.isFrozen(entries)&&Object.isFrozen(entries[0])&&JSON.stringify(entries[0].publicSignals)===JSON.stringify(a.publicSignals);},a);
 });
 await check('terminal history is found and cannot be replaced by an implicit new attempt',async()=>{
  const db=name();await init(p,db);
  return p.evaluate(async({a,i})=>{
   await journal.commit(a);await journal.terminal({hash:a.hash,status:'known_not_sent',reason:'session_changed'});
   const found=await journal.find(i);let refused=false;
   try{await journal.commit({...a,hash:'77'.repeat(32),sequence:'102'});}catch{refused=true;}
   return refused&&found.attempt.hash===a.hash&&found.terminal.status==='known_not_sent'&&(await journal.conflicts(i)).length===0;
  },{a,i:intent(a)});
 });
 await check('two actual pages permit only one explicit retry of a known-not-sent attempt',async()=>{
  const db=name();await Promise.all(pages.map(page=>init(page,db)));
  await p.evaluate(async a=>{await journal.commit(a);await journal.terminal({hash:a.hash,status:'known_not_sent',reason:'session_changed'});},a);
  const retries=['77','88'].map(pair=>({...a,hash:pair.repeat(32),sequence:'102',retryOf:a.hash}));
  const results=await Promise.all(pages.map((page,i)=>page.evaluate(async a=>{try{await journal.commit(a);return a.hash;}catch{return null;}},retries[i])));
  const wins=results.filter(Boolean);
  return wins.length===1&&await p.evaluate(async({winner,i,original})=>{const latest=await journal.find(i),old=await journal.get(original);return latest.attempt.hash===winner&&latest.terminal===null&&old.terminal.status==='known_not_sent';},{winner:wins[0],i:intent(a),original:a.hash});
 });
 await check('confirmed or failed history cannot authorize an explicit retry',async()=>{
  for(const status of ['confirmed','failed']){
   const db=name();await init(p,db);
   const refused=await p.evaluate(async({a,status})=>{await journal.commit(a);await journal.terminal({hash:a.hash,status,ledger:1001});try{await journal.commit({...a,hash:'77'.repeat(32),sequence:'102',retryOf:a.hash});return false;}catch{return true;}},{a,status});
   if(!refused)return false;
  }
  return true;
 });
 for(const operation of ['bad-digest','delete-attempt','orphan-terminal','bad-reservation']){
  await check(`corrupt storage fails closed: ${operation}`,async()=>{
   const db=name();await init(p,db);if(operation!=='orphan-terminal')await p.evaluate(a=>journal.commit(a),a);
   await mutate(p,db,operation,a.hash);
   return p.evaluate(async({operation,a,i})=>{try{if(operation==='delete-attempt'||operation==='bad-reservation')await journal.conflicts(i);else await journal.get(a.hash);return false;}catch{return true;}},{operation,a,i:intent(a)});
  });
 }
  await check('missing reservations cannot permit a second conflicting pending attempt',async()=>{
  const db=name();await init(p,db);await p.evaluate(a=>journal.commit(a),a);await mutate(p,db,'delete-reservations',a.hash);
  return p.evaluate(async({changed,i})=>{try{await journal.conflicts(i);await journal.commit(changed);return false;}catch{return true;}},{changed,i:intent(changed)});
  });
 for(const method of ['get','commit','pending']){
  await check(`missing reservation fails closed through direct ${method}`,async()=>{
   const db=name();await init(p,db);await p.evaluate(a=>journal.commit(a),a);await mutate(p,db,'delete-reservations',a.hash);
   return p.evaluate(async({method,a,changed})=>{try{if(method==='get')await journal.get(a.hash);else if(method==='pending')await journal.pending();else await journal.commit(changed);return false;}catch{return true;}},{method,a,changed});
  });
 }
 await check('unrelated extra reservation is rejected by journal consistency checks',async()=>{
  const db=name();await init(p,db);await p.evaluate(a=>journal.commit(a),a);await mutate(p,db,'extra-reservation',a.hash);
  return p.evaluate(async a=>{try{await journal.get(a.hash);return false;}catch{return true;}},a);
 });
 await check('a lost terminal cannot silently revive an unlocked attempt',async()=>{
  const db=name();await init(p,db);await p.evaluate(async a=>{await journal.commit(a);await journal.terminal({hash:a.hash,status:'known_not_sent',reason:'session_changed'});},a);
  await mutate(p,db,'delete-terminal',a.hash);
  return p.evaluate(async a=>{try{await journal.get(a.hash);return false;}catch{return true;}},a);
 });
 await check('missing reservation aborts terminal write atomically',async()=>{
  const db=name();await init(p,db);await p.evaluate(a=>journal.commit(a),a);await mutate(p,db,'delete-one-reservation',a.hash);
  return p.evaluate(async({db,a})=>{
   let refused=false;try{await journal.terminal({hash:a.hash,status:'known_not_sent',reason:'session_changed'});}catch{refused=true;}
   const database=await new Promise(resolve=>{const r=indexedDB.open(db,1);r.onsuccess=()=>resolve(r.result);});
   const result=await new Promise(resolve=>{const r=database.transaction('terminals','readonly').objectStore('terminals').get(a.hash);r.onsuccess=()=>resolve(r.result);});database.close();return refused&&result===undefined;
  },{db,a});
 });
 await check('version-change closure refuses further durable commits',async()=>{
  const db=name();await init(p,db);
  await p.evaluate(async db=>{const database=await new Promise(resolve=>{const r=indexedDB.open(db,2);r.onsuccess=()=>resolve(r.result);});database.close();},db);
  return p.evaluate(async a=>{try{await journal.commit(a);return false;}catch{return true;}},a);
 });
 await check('database missing required stores fails before any commit',async()=>{
  const db=name();await p.evaluate(async db=>{const database=await new Promise(resolve=>{const r=indexedDB.open(db,1);r.onupgradeneeded=()=>r.result.createObjectStore('attempts',{keyPath:'hash'});r.onsuccess=()=>resolve(r.result);});database.close();},db);
  return p.evaluate(async({db,a})=>{let j;try{j=await journalFactory({name:db});await j.commit(a);return false;}catch{return true;}finally{j?.close();}},{db,a});
 });
 report.checks.push({name:'no external requests, console/page/CSP failures',passed:report.requests.every(r=>r.allowed)&&report.console.length===0&&report.pageErrors.length===0&&report.csp.length===0});
 report.status=report.checks.every(c=>c.passed)?'passed':'failed';
}catch(error){report.status='failed';report.harnessError=error?.message?.slice(0,200)||'HARNESS_FAILED';}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,checks:report.checks,output},null,2));
if(report.status!=='passed')process.exitCode=1;
