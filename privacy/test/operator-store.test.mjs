import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, chmod, readFile, readdir, stat, writeFile, symlink, rm, open, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createFileReplayStore } from '../src/operator-store.mjs';

const exec = promisify(execFile), key = '11'.repeat(32), digest = '22'.repeat(32);
async function directory(t) {
  const parent = await mkdtemp(join(tmpdir(),'agyion-replay-test-'));
  await chmod(parent,0o700); t.after(() => rm(parent,{recursive:true,force:true}));
  return join(parent,'claims');
}
async function store(t,dir) { const result = await createFileReplayStore({directory:dir}); t.after(() => result.close()); return result; }

test('claims are0600 public digest metadata, persistent across instances and restarts',async t => {
  const dir = await directory(t), a = await store(t,dir), b = await store(t,dir);
  assert.equal(await a.claimRequest(key,digest),true);
  assert.equal(await b.claimRequest(key,digest),false);
  assert.equal(await b.claimRequest(key,'33'.repeat(32)),false);
  assert.equal((await stat(dir)).mode & 0o777,0o700);
  const files = await readdir(dir); assert.deepEqual(files,[`${key}.json`]);
  assert.equal((await stat(join(dir,files[0]))).mode & 0o777,0o600);
  assert.deepEqual(JSON.parse(await readFile(join(dir,files[0]),'utf8')),{version:'1',replayKey:key,authorizationDigest:digest});
  await a.close(); await b.close();
  const restarted = await store(t,dir); assert.equal(await restarted.claimRequest(key,digest),false);
});

test('concurrent independent processes can acknowledge exactly one durable claim',async t => {
  const dir = await directory(t), initialized = await store(t,dir); await initialized.close();
  const code = `import {createFileReplayStore} from ${JSON.stringify(new URL('../src/operator-store.mjs',import.meta.url).href)};
    const s=await createFileReplayStore({directory:process.argv[1]});
    try { process.stdout.write(String(await s.claimRequest(process.argv[2],process.argv[3]))); } finally { await s.close(); }`;
  const replies = await Promise.all(Array.from({length:6},(_,i) => exec(process.execPath,['--input-type=module','-e',code,dir,key,String(i+1).repeat(64)],{timeout:20000})));
  assert.equal(replies.filter(r => r.stdout === 'true').length,1);
  assert.equal(replies.filter(r => r.stdout === 'false').length,5);
  const restarted = await store(t,dir); assert.equal(await restarted.claimRequest(key,digest),false);
});

test('corrupt, incomplete, symlink and directory claim entries remain consumed without repair',async t => {
  const dir = await directory(t), s = await store(t,dir);
  const keys = ['31','32','33','34'].map(n => n.repeat(32));
  await writeFile(join(dir,`${keys[0]}.json`),'',{mode:0o600});
  await writeFile(join(dir,`${keys[1]}.json`),'not-json',{mode:0o600});
  await symlink(join(dir,'absent'),join(dir,`${keys[2]}.json`));
  await mkdir(join(dir,`${keys[3]}.json`),{mode:0o700});
  for(const k of keys) assert.equal(await s.claimRequest(k,digest),false);
  assert.equal(await readFile(join(dir,`${keys[1]}.json`),'utf8'),'not-json');
});

test('rejects nonprivate directories, symlinks and noncanonical keys before writing',async t => {
  const dir = await directory(t); await mkdir(dir,{mode:0o755});
  await assert.rejects(createFileReplayStore({directory:dir})); await chmod(dir,0o700);
  const alias = `${dir}-alias`; await symlink(dir,alias); await assert.rejects(createFileReplayStore({directory:alias}));
  const s = await store(t,dir);
  for(const k of ['../x','a'.repeat(63),'A'.repeat(64),'1'.repeat(65),null]) {
    await assert.rejects(s.claimRequest(k,digest)); await assert.rejects(s.claimRequest(key,k));
  }
  assert.deepEqual(await readdir(dir),[]);
  assert.equal(await s.claimRequest(key,digest),true);
});

test('file fsync failure never acknowledges or removes a claim; a fresh instance still refuses it',async t => {
  const dir = await directory(t), s = await store(t,dir);
  const probe = await open(join(dir,'probe'),'wx',0o600), prototype = Object.getPrototypeOf(probe), original = prototype.sync;
  await probe.close(); await rm(join(dir,'probe'));
  const mocked = t.mock.method(prototype,'sync',async function() {
    if ((await this.stat()).isFile()) { const error = new Error('injected fsync failure'); error.code='EIO'; throw error; }
    return original.call(this);
  });
  await assert.rejects(s.claimRequest(key,digest),{code:'REPLAY_STORAGE_UNAVAILABLE'});
  assert.ok((await readdir(dir)).includes(`${key}.json`));
  await assert.rejects(s.claimRequest('44'.repeat(32),digest));
  mocked.mock.restore();
  const restarted = await store(t,dir); assert.equal(await restarted.claimRequest(key,digest),false);
});

test('directory fsync failure consumes the key and close prevents future acknowledgements',async t => {
  const dir = await directory(t), s = await store(t,dir);
  const probe = await open(dir,'r'), prototype = Object.getPrototypeOf(probe), original = prototype.sync; await probe.close();
  const mocked = t.mock.method(prototype,'sync',async function() {
    if ((await this.stat()).isDirectory()) throw new Error('injected directory sync failure');
    return original.call(this);
  });
  await assert.rejects(s.claimRequest(key,digest),{code:'REPLAY_STORAGE_UNAVAILABLE'}); mocked.mock.restore();
  const fresh = await store(t,dir); assert.equal(await fresh.claimRequest(key,digest),false);
  await fresh.close(); await assert.rejects(fresh.claimRequest('55'.repeat(32),digest));
});

test('directory replacement is detected before a new claim can be issued',async t => {
  const dir = await directory(t), s = await store(t,dir);
  await rename(dir,`${dir}-old`); await mkdir(dir,{mode:0o700});
  await assert.rejects(s.claimRequest(key,digest),{code:'REPLAY_STORAGE_UNAVAILABLE'});
  assert.deepEqual(await readdir(dir),[]);
});

test('rejects writable nonsticky ancestors rather than relying on private child permissions',async t => {
  const dir = await directory(t), parent = join(dir,'..');
  await chmod(parent,0o777);
  await assert.rejects(createFileReplayStore({directory:dir}),{code:'REPLAY_STORAGE_UNAVAILABLE'});
  await chmod(parent,0o700);
  const s = await store(t,dir);
  await chmod(parent,0o770);
  await assert.rejects(s.claimRequest(key,digest),{code:'REPLAY_STORAGE_UNAVAILABLE'});
  await chmod(parent,0o700);
});
