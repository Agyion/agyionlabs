/** Guarded, explicit deployment of a reviewed public V4 valueless testnet plan.
 * Default mode is offline. No identity creation, automatic resend, application
 * pin change, trustee key read, or mainnet operation is available here. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { preparePublicDeployment, readPublicDeploymentWasm, TESTNET, RPC, PUBLIC_CANDIDATE_WASM } from './lib/public-deployment-plan.mjs';
import { DEPLOYMENT_LIMITS, privateRunDirectory, readPrivateBytes, readPrivateRecord, durableCreate, claimDeploymentPhase, expectedOperation, executeDeploymentPhase, recoverDeploymentPhase } from './lib/private-deployment.mjs';
import { publicDeploymentReadbackKeys, verifyPublicDeploymentReadback } from './lib/public-deployment-readback.mjs';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const { Contract, Keypair, TransactionBuilder, xdr, rpc } = createRequire(new URL('../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const CANDIDATE = PUBLIC_CANDIDATE_WASM;
const ORIGINAL = Object.freeze({
    'deployments/public-testnet.json': '9401031958e828761a3d13b3a0fe696b9da460a052d0812b848e2945fde0087e',
    'app/app/lib/private/guarded-release.json': '4883e3a9dda52b552b873d138c1d255e3235fed3ddcc02ac9f17b5ec89d9dd62',
    'app/app/lib/private/release.json': '4944e60b435b6f0f943b90690d53ff0ca4492b678b296c9a3c12ac3bcbcf5b1e',
    'app/app/lib/private/committee.json': 'b3cf846a83e9d1c1d7757f6e35e6a9af45d65b3784176e36bfa516b7648d0c85',
});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const ensure = (ok, code) => { if (!ok)
    throw Error(code); };
const report = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
const hashValue = value => ensure(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) && value !== '0'.repeat(64), 'DEPLOYMENT_HASH');
const json = bytes => { try {
    return JSON.parse(bytes.toString('utf8'));
}
catch {
    throw Error('DEPLOYMENT_PLAN_JSON');
} };
const accountKey = source => xdr.LedgerKey.account(new xdr.LedgerKeyAccount({ accountId: Keypair.fromPublicKey(source).xdrPublicKey() }));
const codeKey = hash => xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from(hash, 'hex') }));
export async function loadDeploymentPlan(run, manifestSha256) {
    privateRunDirectory(run);
    hashValue(manifestSha256);
    const manifestPath = path.join(run, 'deployment-manifest.json');
    const manifestBytes = readPrivateBytes(manifestPath);
    ensure(sha(manifestBytes) === manifestSha256, 'DEPLOYMENT_REVIEWED_MANIFEST');
    const manifest = json(manifestBytes);
    ensure(manifest.testOnly === true && manifest.networkPassphrase === TESTNET && manifest.rpcUrl === RPC, 'DEPLOYMENT_TESTNET');
    ensure(manifest.wasm?.sha256 === CANDIDATE, 'DEPLOYMENT_REVIEWED_WASM');
    const planBytes = readPrivateBytes(path.join(run, 'offline-plan.json')), stored = json(planBytes);
    const plan = await preparePublicDeployment(manifestPath, path.join(run, 'identity'));
    ensure(plan.manifestSha256 === manifestSha256 && isDeepStrictEqual(plan, stored), 'DEPLOYMENT_OFFLINE_PLAN');
    const wasm = readPublicDeploymentWasm(plan.wasmPath);
    ensure(sha(wasm) === CANDIDATE, 'DEPLOYMENT_REVIEWED_WASM');
    return { run, plan, wasm, planSha256: sha(planBytes), manifestSha256 };
}
function verifyOriginalPins() {
    for (const [name, hash] of Object.entries(ORIGINAL))
        ensure(sha(fs.readFileSync(path.join(ROOT, name))) === hash, 'DEPLOYMENT_ORIGINAL_PINS');
}
function cli(plan, args, input) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('STELLAR_') && !key.startsWith('SOROBAN_')));
    const result = spawnSync('stellar', args, { env, input, encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
    ensure(result.status === 0 && !result.signal && !result.error, 'DEPLOYMENT_CLI');
    return result.stdout.trim();
}
function verifySource(plan) {
    ensure(cli(plan, ['keys', 'address', 'agyion-public-v4-testnet', '--config-dir', plan.identityDirectory]) === plan.sourceAccount, 'DEPLOYMENT_IDENTITY');
}
export function deploymentServer() {
    const server = new rpc.Server(RPC);
    Object.assign(server.httpClient.defaults, { timeout: 15000, maxContentLength: 2 * 1024 * 1024, maxRedirects: 0, fetchOptions: { credentials: 'omit', cache: 'no-store' } });
    return server;
}
async function ledger(server, keys) {
    const result = await server.getLedgerEntries(...keys);
    ensure(Number.isSafeInteger(result.latestLedger) && result.latestLedger > 0 && Array.isArray(result.entries), 'DEPLOYMENT_LEDGER');
    const wanted = new Set(keys.map(k => k.toXDR('base64'))), values = new Map();
    for (const e of result.entries) {
        const k = e.key.toXDR('base64');
        ensure(wanted.has(k) && !values.has(k), 'DEPLOYMENT_LEDGER_KEY');
        values.set(k, e.val);
    }
    return { ledger: result.latestLedger, values, get: key => values.get(key.toXDR('base64')) };
}
async function network(server) { ensure((await server.getNetwork()).passphrase === TESTNET, 'DEPLOYMENT_TESTNET'); }
async function initialState(context, server) {
    const { plan } = context, source = accountKey(plan.sourceAccount), pool = new Contract(plan.intendedContractId).getFootprint(), code = codeKey(plan.wasmSha256);
    const snapshot = await ledger(server, [source, pool, code]);
    return { snapshot, source: snapshot.get(source), pool: snapshot.get(pool), code: snapshot.get(code) };
}
function sourceEntry(plan, value) {
    ensure(value?.switch().name === 'account', 'DEPLOYMENT_ACCOUNT');
    const a = value.account();
    ensure(a.accountId().toXDR().equals(Keypair.fromPublicKey(plan.sourceAccount).xdrPublicKey().toXDR()), 'DEPLOYMENT_ACCOUNT');
    ensure(a.numSubEntries() === 0 && a.signers().length === 0 && a.thresholds().equals(Buffer.from([1, 0, 0, 0])) && a.flags() === 0, 'DEPLOYMENT_ACCOUNT_AUTHORITY');
    ensure(BigInt(a.balance().toString()) > DEPLOYMENT_LIMITS.aggregate + 10000000n, 'DEPLOYMENT_ACCOUNT_BALANCE');
    return a;
}
async function friendbot(source) {
    const url = new URL('https://friendbot.stellar.org/');
    url.searchParams.set('addr', source);
    const response = await fetch(url, { redirect: 'error', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(30000) });
    ensure(response.ok && response.body, 'DEPLOYMENT_FRIENDBOT_RESPONSE');
    const reader = response.body.getReader();
    let size = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done)
                break;
            size += value.byteLength;
            ensure(size <= 1024 * 1024, 'DEPLOYMENT_FRIENDBOT_SIZE');
        }
    }
    finally {
        await reader.cancel().catch(() => { });
    }
}
async function recoverFunding(context, server) {
    const { run, plan, planSha256 } = context, a = readPrivateRecord(run, 'fund.attempt.json');
    ensure(a.schema === 'agyion-public-funding-attempt-v1' && a.planSha256 === planSha256 && a.source === plan.sourceAccount && a.maximumCalls === 1, 'DEPLOYMENT_FUNDING_SCOPE');
    await network(server);
    const state = await initialState(context, server);
    if (!state.source)
        return { status: 'pending', phase: 'fund', source: plan.sourceAccount };
    sourceEntry(plan, state.source);
    const value = { schema: 'agyion-public-funding-receipt-v1', planSha256, source: plan.sourceAccount, status: 'account-observed', ledger: state.snapshot.ledger };
    if (fs.existsSync(path.join(run, 'fund.receipt.json'))) {
        const old = readPrivateRecord(run, 'fund.receipt.json');
        ensure(old.schema === value.schema && old.planSha256 === planSha256 && old.source === plan.sourceAccount && old.status === value.status, 'DEPLOYMENT_FUNDING_SCOPE');
        return old;
    }
    durableCreate(run, 'fund.receipt.json', value);
    return value;
}
async function fund(context, server) {
    const { run, plan, planSha256 } = context;
    claimDeploymentPhase(run, 'fund', planSha256);
    await network(server);
    const state = await initialState(context, server);
    ensure(!state.source && !state.pool, 'DEPLOYMENT_FRESH_SOURCE_REQUIRED');
    durableCreate(run, 'fund.attempt.json', { schema: 'agyion-public-funding-attempt-v1', planSha256, source: plan.sourceAccount, maximumCalls: 1, requestedAt: new Date().toISOString() });
    try {
        await friendbot(plan.sourceAccount);
    }
    catch { /* Preserve the sole attempt; only query the original account. */ }
    return recoverFunding(context, server);
}
async function prerequisite(context, server, phase) {
    const { run, plan, wasm } = context;
    await network(server);
    const funding = await recoverFunding(context, server);
    ensure(funding.status === 'account-observed', 'DEPLOYMENT_FUNDING_PENDING');
    if (phase === 'create') {
        const upload = await recoverDeploymentPhase({ ...context, phase: 'upload', getTransaction: hash => server.getTransaction(hash) });
        ensure(upload.status === 'confirmed', 'DEPLOYMENT_UPLOAD_UNCONFIRMED');
    }
    const state = await initialState(context, server);
    sourceEntry(plan, state.source);
    ensure(!state.pool, 'DEPLOYMENT_POOL_EXISTS');
    if (phase === 'create')
        ensure(state.code?.switch().name === 'contractCode' && Buffer.from(state.code.contractCode().code()).equals(wasm), 'DEPLOYMENT_CODE_READBACK');
    // Uploading identical existing code is unnecessary, so stop before signing.
    if (phase === 'upload')
        ensure(!state.code, 'DEPLOYMENT_CODE_ALREADY_EXISTS');
}
async function transact(context, server, phase) {
    const { plan, wasm } = context;
    return executeDeploymentPhase({ ...context, phase,
        prepare: async () => {
            await prerequisite(context, server, phase);
            const tx = new TransactionBuilder(await server.getAccount(plan.sourceAccount), { fee: '100', networkPassphrase: TESTNET }).addOperation(expectedOperation(plan, wasm, phase)).setTimeout(90).build();
            const simulation = await server.simulateTransaction(tx);
            ensure(rpc.Api.isSimulationSuccess(simulation) && !rpc.Api.isSimulationRestore(simulation), 'DEPLOYMENT_SIMULATION');
            return rpc.assembleTransaction(tx, simulation).build();
        },
        sign: async (tx) => cli(plan, ['tx', 'sign', '--sign-with-key', 'agyion-public-v4-testnet', '--config-dir', plan.identityDirectory, '--rpc-url', RPC, '--network-passphrase', TESTNET, '--quiet'], tx.toXDR()),
        sendTransaction: tx => server.sendTransaction(tx),
        getTransaction: hash => server.getTransaction(hash),
    });
}
export async function main(args = process.argv.slice(2)) {
    const [mode = '--plan', run, manifestHash, phase] = args;
    if (mode === '--plan' && args.length <= 1) {
        report({ testOnly: true, protocolVersion: 4, network: TESTNET, candidateWasm: CANDIDATE, funding: { maximumCalls: 1, provider: 'Stellar Friendbot' }, feeLimitsStroops: Object.fromEntries(Object.entries(DEPLOYMENT_LIMITS).map(([k, v]) => [k, v.toString()])), automaticResend: false, usage: '--check|--fund|--recover-fund|--upload|--create|--readback RUN REVIEWED_MANIFEST_SHA256; --recover RUN REVIEWED_MANIFEST_SHA256 upload|create', activation: 'No application release change. Exact readback, public lifecycles and compatible original-record recovery are separate activation gates.' });
        return;
    }
    ensure(['--check', '--fund', '--recover-fund', '--upload', '--create', '--recover', '--readback'].includes(mode), 'DEPLOYMENT_USAGE');
    ensure(mode === '--recover' ? args.length === 4 && ['upload', 'create'].includes(phase) : args.length === 3, 'DEPLOYMENT_USAGE');
    const context = await loadDeploymentPlan(run, manifestHash);
    if (['--fund', '--upload', '--create'].includes(mode)) {
        verifyOriginalPins();
        verifySource(context.plan);
    }
    const server = deploymentServer();
    if (mode === '--check') {
        await network(server);
        const state = await initialState(context, server);
        report({ status: 'checked-read-only', manifestSha256: context.manifestSha256, offlinePlanSha256: context.planSha256, source: context.plan.sourceAccount, contractId: context.plan.intendedContractId, wasmSha256: CANDIDATE, sourceExists: !!state.source, poolExists: !!state.pool, codeExists: !!state.code, ledger: state.snapshot.ledger, signatures: 0, transactions: 0 });
        return;
    }
    if (mode === '--fund') {
        report(await fund(context, server));
        return;
    }
    if (mode === '--recover-fund') {
        report(await recoverFunding(context, server));
        return;
    }
    if (mode === '--recover') {
        await network(server);
        report(await recoverDeploymentPhase({ ...context, phase, getTransaction: hash => server.getTransaction(hash) }));
        return;
    }
    if (mode === '--readback') {
        await network(server);
        const creation = await recoverDeploymentPhase({ ...context, phase: 'create', getTransaction: hash => server.getTransaction(hash) });
        ensure(creation.status === 'confirmed', 'DEPLOYMENT_CREATE_UNCONFIRMED');
        report(verifyPublicDeploymentReadback(context, await server.getLedgerEntries(...publicDeploymentReadbackKeys(context.plan))));
        return;
    }
    report(await transact(context, server, mode.slice(2)));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
    main().catch(error => {
        // Never print raw CLI, file, SDK or JSON diagnostics that could contain keys.
        const code = typeof error?.message === 'string' && /^DEPLOYMENT_[A-Z_]+$/.test(error.message) ? error.message : 'DEPLOYMENT_STOPPED';
        process.stderr.write(code + '. No automatic retry is permitted; retain the run directory and reconcile the original attempt.\n');
        process.exitCode = 1;
    });
