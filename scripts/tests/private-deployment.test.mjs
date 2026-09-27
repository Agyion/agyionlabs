import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync, spawn } from 'node:child_process';
import { feeBudget, expectedOperation, validateEnvelope, claimDeploymentPhase, executeDeploymentPhase, recoverDeploymentPhase, readPrivateRecord } from '../lib/private-deployment.mjs';
const { Keypair, Account, TransactionBuilder, SorobanDataBuilder, Operation, Networks, xdr } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const root = path.resolve(new URL('../../', import.meta.url).pathname), key = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 31)), other = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 32));
const wasm = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
const sha = b => createHash('sha256').update(b).digest('hex');
const plan = { networkPassphrase: Networks.TESTNET, rpcUrl: 'https://soroban-testnet.stellar.org', sourceAccount: key.publicKey(), wasmSha256: sha(wasm), salt: 'ab'.repeat(32), constructorXdr: [xdr.ScVal.scvU32(1).toXDR('base64')] };
const planSha256 = 'cd'.repeat(32);
function directory(t) {
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    const run = fs.mkdtempSync(path.join(root, 'artifacts/private-deploy-test-'));
    fs.chmodSync(run, 0o700);
    t.after(() => fs.rmSync(run, { recursive: true, force: true }));
    return run;
}
function tx(phase = 'upload', opts = {}) { return new TransactionBuilder(new Account(opts.source || key.publicKey(), '0'), { fee: opts.fee || '100', networkPassphrase: opts.network || Networks.TESTNET }).addOperation(opts.op || expectedOperation(plan, wasm, phase)).setSorobanData(new SorobanDataBuilder().build()).setTimeout(90).build(); }
const sign = async (value) => { value.sign(key); return value.toXDR(); };
const options = (run, overrides = {}) => ({ run, phase: 'upload', plan, planSha256, wasm, prepare: async () => tx(), sign, getTransaction: async () => ({ status: 'NOT_FOUND' }), sendTransaction: async (value) => ({ status: 'PENDING', hash: value.hash().toString('hex') }), ...overrides });
test('deployment fees have canonical positive individual and aggregate caps', () => {
    assert.equal(feeBudget('upload', '200000000', 0n), 200000000n);
    assert.equal(feeBudget('create', '2500000000', 200000000n), 2700000000n);
    for (const [phase, fee, previous] of [['upload', '200000001', 0n], ['create', '2500000001', 0n], ['create', '1', 2700000000n], ['upload', '0', 0n], ['upload', '0100', 0n], ['upload', '100', -1n], ['other', '100', 0n]])
        assert.throws(() => feeBudget(phase, fee, previous));
});
test('only the exact reviewed upload or constructor operation can be authorized', () => {
    assert.equal(validateEnvelope(tx(), plan, wasm, 'upload'), true);
    assert.equal(validateEnvelope(tx('create'), plan, wasm, 'create'), true);
    for (const changed of [tx('upload', { source: other.publicKey() }), tx('upload', { network: Networks.PUBLIC }), tx('upload', { op: Operation.payment({ destination: other.publicKey(), asset: requireAsset(), amount: '1' }) }), tx('create')])
        assert.throws(() => validateEnvelope(changed, plan, wasm, 'upload'));
    const different = { ...plan, constructorXdr: [xdr.ScVal.scvU32(2).toXDR('base64')] };
    assert.throws(() => validateEnvelope(tx('create'), different, wasm, 'create'));
    const salted = { ...plan, salt: 'ef'.repeat(32) };
    assert.throws(() => validateEnvelope(tx('create'), salted, wasm, 'create'));
});
function requireAsset() { return createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk').Asset.native(); }
test('signed bytes are durable before a single send, and an unknown send never releases its phase', async (t) => {
    const run = directory(t);
    let sends = 0, prepares = 0;
    const o = options(run, { prepare: async () => { prepares++; return tx(); }, sendTransaction: async (value) => { sends++; const stored = JSON.parse(fs.readFileSync(path.join(run, 'upload.attempt.json'))); assert.equal(stored.envelopeXdr, value.toXDR()); assert.equal(stored.hash, value.hash().toString('hex')); assert.equal(fs.statSync(path.join(run, 'upload.attempt.json')).mode & 0o777, 0o600); throw Error('uncertain transport'); } });
    const result = await executeDeploymentPhase(o);
    assert.equal(result.status, 'pending');
    assert.equal(sends, 1);
    await assert.rejects(executeDeploymentPhase(o));
    assert.equal(sends, 1);
    assert.equal(prepares, 1);
    assert.ok(fs.existsSync(path.join(run, 'upload.claim')));
});
test('a changed or foreign signed envelope is rejected before any send', async (t) => {
    for (const signer of [async () => { const changed = tx('upload', { fee: '101' }); changed.sign(key); return changed.toXDR(); }, async (value) => { value.sign(other); return value.toXDR(); }, async (value) => value.toXDR()]) {
        const run = directory(t);
        let sends = 0;
        await assert.rejects(executeDeploymentPhase(options(run, { sign: signer, sendTransaction: async () => { sends++; throw Error('sent'); } })));
        assert.equal(sends, 0);
        assert.equal(fs.existsSync(path.join(run, 'upload.attempt.json')), false);
        assert.ok(fs.existsSync(path.join(run, 'upload.claim')));
    }
});
test('a crash before preparation cannot enter the same durable phase again', async (t) => {
    const run = directory(t);
    await assert.rejects(executeDeploymentPhase(options(run, { prepare: async () => { throw Error('interrupted'); } })));
    let preparations = 0;
    await assert.rejects(executeDeploymentPhase(options(run, { prepare: async () => { preparations++; return tx(); } })));
    assert.equal(preparations, 0);
});
test('recovery queries only the original signed hash and cannot sign, simulate or resend', async (t) => {
    const run = directory(t), first = await executeDeploymentPhase(options(run));
    let queried;
    const result = await recoverDeploymentPhase({ run, phase: 'upload', plan, planSha256, wasm, getTransaction: async (hash) => { queried = hash; return { status: 'NOT_FOUND' }; } });
    assert.equal(result.status, 'pending');
    assert.equal(queried, first.hash);
    assert.equal(fs.existsSync(path.join(run, 'upload.receipt.json')), false);
    await assert.rejects(recoverDeploymentPhase({ run, phase: 'upload', plan, planSha256: 'ef'.repeat(32), wasm, getTransaction: async () => { throw Error('must not lookup'); } }), /SCOPE/);
});
test('included evidence must match exact signed envelope, status and fee before a receipt exists', async (t) => {
    const run = directory(t);
    await executeDeploymentPhase(options(run));
    const stored = JSON.parse(fs.readFileSync(path.join(run, 'upload.attempt.json'))), signed = TransactionBuilder.fromXDR(stored.envelopeXdr, Networks.TESTNET);
    const reply = (fee = '100', envelope = signed.toEnvelope()) => ({ status: 'SUCCESS', ledger: 123, envelopeXdr: envelope, resultXdr: new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString(fee), result: xdr.TransactionResultResult.txSuccess([]), ext: new xdr.TransactionResultExt(0) }) });
    for (const response of [reply('101'), reply('100', tx().toEnvelope())])
        await assert.rejects(recoverDeploymentPhase({ run, phase: 'upload', plan, planSha256, wasm, getTransaction: async () => response }));
    assert.equal(fs.existsSync(path.join(run, 'upload.receipt.json')), false);
    const o = { run, phase: 'upload', plan, planSha256, wasm, getTransaction: async () => reply() };
    const result = await recoverDeploymentPhase(o);
    assert.equal(result.status, 'confirmed');
    assert.equal(result.feeCharged, '100');
    assert.equal((await recoverDeploymentPhase(o)).hash, result.hash);
    assert.equal(JSON.parse(fs.readFileSync(path.join(run, 'upload.receipt.json'))).status, 'confirmed');
});
test('private directory, fixed phase names and output files reject symlinks and overwrites', t => {
    const run = directory(t);
    assert.throws(() => claimDeploymentPhase(run, '../escape', planSha256));
    fs.chmodSync(run, 0o755);
    assert.throws(() => claimDeploymentPhase(run, 'upload', planSha256));
    fs.chmodSync(run, 0o700);
    const target = path.join(run, 'target');
    fs.writeFileSync(target, 'untouched');
    fs.symlinkSync(target, path.join(run, 'upload.claim'));
    assert.throws(() => claimDeploymentPhase(run, 'upload', planSha256));
    assert.equal(fs.readFileSync(target, 'utf8'), 'untouched');
});
test('separate processes cannot replay the same source phase', t => {
    const run = directory(t), module = new URL('../lib/private-deployment.mjs', import.meta.url).href;
    const code = `import {claimDeploymentPhase} from ${JSON.stringify(module)};claimDeploymentPhase(process.argv[1],'upload',${JSON.stringify(planSha256)});`;
    const first = spawnSync(process.execPath, ['--input-type=module', '-e', code, run], { encoding: 'utf8' }), second = spawnSync(process.execPath, ['--input-type=module', '-e', code, run], { encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    assert.notEqual(second.status, 0);
    assert.equal(fs.statSync(path.join(run, 'upload.claim')).mode & 0o777, 0o600);
});
test('a record that grows after opening is bounded and rejected', t => {
    const run = directory(t);
    claimDeploymentPhase(run, 'upload', planSha256);
    const file = path.join(run, 'upload.claim'), open = fs.openSync, read = fs.readFileSync;
    let unbounded = false;
    fs.openSync = (value, ...args) => { const fd = open(value, ...args); if (value === file)
        fs.appendFileSync(file, ' '.repeat(2 * 1024 * 1024)); return fd; };
    fs.readFileSync = (value, ...args) => { if (typeof value === 'number')
        unbounded = true; return read(value, ...args); };
    try {
        assert.throws(() => readPrivateRecord(run, 'upload.claim'), /RECORD/);
        assert.equal(unbounded, false, 'Oversized file must not enter an unbounded read');
    }
    finally {
        fs.openSync = open;
        fs.readFileSync = read;
    }
});
test('fee, expiry and extra authorization failures stop before signing', async (t) => {
    const prepareCases = [() => tx('upload', { fee: '200000001' }), () => {
            const value = tx();
            value.toEnvelope();
            return TransactionBuilder.cloneFrom(value).setTimebounds(0, Math.floor(Date.now() / 1000) + 3600).build();
        }, () => {
            const op = expectedOperation(plan, wasm, 'upload');
            op.body().invokeHostFunctionOp().auth([
                new xdr.SorobanAuthorizationEntry({ credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(), rootInvocation: new xdr.SorobanAuthorizedInvocation({ function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeCreateContractV2HostFn(expectedOperation(plan, wasm, 'create').body().invokeHostFunctionOp().hostFunction().createContractV2()), subInvocations: [] }) })
            ]);
            return tx('upload', { op });
        }];
    for (const prepare of prepareCases) {
        let signatures = 0, sends = 0;
        await assert.rejects(executeDeploymentPhase(options(directory(t), { prepare: async () => prepare(), sign: async (value) => { signatures++; return sign(value); }, sendTransaction: async () => { sends++; } })));
        assert.equal(signatures, 0);
        assert.equal(sends, 0);
    }
});
test('a failed disk sync prevents submission and keeps the phase consumed', async (t) => {
    const run = directory(t), sync = fs.fsyncSync;
    let sends = 0;
    try {
        await assert.rejects(executeDeploymentPhase(options(run, { sign: async (value) => { fs.fsyncSync = () => { throw Error('synthetic fsync failure'); }; return sign(value); }, sendTransaction: async () => { sends++; } })), /fsync/);
    }
    finally {
        fs.fsyncSync = sync;
    }
    assert.equal(sends, 0);
    assert.ok(fs.existsSync(path.join(run, 'upload.claim')));
    await assert.rejects(executeDeploymentPhase(options(run, { sendTransaction: async () => { sends++; } })));
    assert.equal(sends, 0);
});
test('included failure is preserved and cannot authorize a replacement', async (t) => {
    const run = directory(t);
    await executeDeploymentPhase(options(run));
    const stored = JSON.parse(fs.readFileSync(path.join(run, 'upload.attempt.json'))), signed = TransactionBuilder.fromXDR(stored.envelopeXdr, Networks.TESTNET);
    const reply = { status: 'FAILED', ledger: 123, envelopeXdr: signed.toEnvelope(), resultXdr: new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString('100'), result: xdr.TransactionResultResult.txFailed([]), ext: new xdr.TransactionResultExt(0) }) };
    const result = await recoverDeploymentPhase({ run, phase: 'upload', plan, planSha256, wasm, getTransaction: async () => reply });
    assert.equal(result.status, 'failed');
    await assert.rejects(executeDeploymentPhase(options(run)));
    assert.equal(JSON.parse(fs.readFileSync(path.join(run, 'upload.receipt.json'))).status, 'failed');
});
function claimProcess(t, run, hold = false) {
    const module = new URL('../lib/private-deployment.mjs', import.meta.url).href;
    const code = `import fs from 'node:fs';import {claimDeploymentPhase} from ${JSON.stringify(module)};
 process.once('message',()=>{try{claimDeploymentPhase(process.argv[1],'upload',${JSON.stringify(planSha256)});fs.appendFileSync(process.argv[1]+'/crossed',process.pid+'\\n');if(${hold}){process.send('claimed');setInterval(()=>{},1000);}else process.exit(0);}catch{process.exit(2)}});process.send('ready');`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', code, run], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
    t.after(() => { clearTimeout(timer); if (child.exitCode === null)
        child.kill('SIGKILL'); });
    const ready = new Promise((resolve, reject) => { child.once('error', reject); child.once('message', value => value === 'ready' ? resolve() : reject(Error('child readiness'))); });
    const exited = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); }); });
    return { child, ready, exited };
}
test('simultaneous processes admit exactly one participant before the RPC boundary', async (t) => {
    const run = directory(t), a = claimProcess(t, run), b = claimProcess(t, run);
    await Promise.all([a.ready, b.ready]);
    a.child.send('go');
    b.child.send('go');
    const results = await Promise.all([a.exited, b.exited]);
    assert.deepEqual(results.map(r => r.code).sort(), [0, 2]);
    assert.ok(results.every(r => r.signal === null));
    assert.equal(fs.readFileSync(path.join(run, 'crossed'), 'utf8').trim().split('\n').length, 1);
});
test('SIGKILL after a durable claim does not let a new process repeat the phase', async (t) => {
    const run = directory(t), a = claimProcess(t, run, true);
    await a.ready;
    const claimed = new Promise(resolve => a.child.once('message', resolve));
    a.child.send('go');
    assert.equal(await claimed, 'claimed');
    a.child.kill('SIGKILL');
    assert.equal((await a.exited).signal, 'SIGKILL');
    const b = claimProcess(t, run);
    await b.ready;
    b.child.send('go');
    assert.equal((await b.exited).code, 2);
    assert.equal(fs.readFileSync(path.join(run, 'crossed'), 'utf8').trim().split('\n').length, 1);
});
