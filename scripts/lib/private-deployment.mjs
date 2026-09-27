/** Durable transaction boundary for a separately validated valueless testnet plan.
 * This module never selects a release, opens a secret key, funds an account or
 * raises a cap. Unknown outcomes retain their phase and original signed bytes. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const { Address, Keypair, Operation, TransactionBuilder, Networks, xdr } = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
const sha = b => createHash('sha256').update(b).digest('hex');
const ensure = (ok, code) => { if (!ok)
    throw Error(code); };
export const DEPLOYMENT_LIMITS = Object.freeze({ upload: 200000000n, create: 2500000000n, aggregate: 2700000000n });
const phaseName = p => ensure(['fund', 'upload', 'create'].includes(p), 'DEPLOYMENT_PHASE');
const hashValue = v => ensure(typeof v === 'string' && /^[0-9a-f]{64}$/.test(v) && v !== '0'.repeat(64), 'DEPLOYMENT_HASH');
export function feeBudget(phase, fee, previous) {
    ensure(['upload', 'create'].includes(phase), 'DEPLOYMENT_PHASE');
    ensure(typeof fee === 'string' && /^[1-9][0-9]{0,9}$/.test(fee), 'DEPLOYMENT_FEE');
    ensure(typeof previous === 'bigint' && previous >= 0n, 'DEPLOYMENT_FEE');
    const n = BigInt(fee);
    ensure(n <= DEPLOYMENT_LIMITS[phase] && previous + n <= DEPLOYMENT_LIMITS.aggregate, 'DEPLOYMENT_FEE_CAP');
    return previous + n;
}
export function privateRunDirectory(value) {
    ensure(typeof value === 'string' && path.isAbsolute(value) && path.resolve(value) === value, 'DEPLOYMENT_DIRECTORY');
    const relative = path.relative(path.join(ROOT, 'artifacts'), value);
    ensure(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'DEPLOYMENT_DIRECTORY');
    const stat = fs.lstatSync(value);
    ensure(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o700 && fs.realpathSync(value) === value, 'DEPLOYMENT_PRIVATE_DIRECTORY');
    return value;
}
function syncDirectory(run) { const fd = fs.openSync(run, 'r'); try {
    fs.fsyncSync(fd);
}
finally {
    fs.closeSync(fd);
} }
export function durableCreate(run, name, value) {
    privateRunDirectory(run);
    ensure(/^(fund|upload|create)\.(claim|attempt\.json|receipt\.json)$/.test(name), 'DEPLOYMENT_FILENAME');
    const bytes = JSON.stringify(value, null, 2) + '\n';
    ensure(Buffer.byteLength(bytes) <= 2 * 1024 * 1024, 'DEPLOYMENT_RECORD_SIZE');
    const fd = fs.openSync(path.join(run, name), fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    try {
        fs.writeFileSync(fd, bytes);
        fs.fsyncSync(fd);
    }
    finally {
        fs.closeSync(fd);
    }
    syncDirectory(run);
}
export function readPrivateBytes(file) {
    const stat = fs.lstatSync(file);
    ensure(stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o600 && stat.size > 0 && stat.size <= 2 * 1024 * 1024, 'DEPLOYMENT_RECORD');
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const opened = fs.fstatSync(fd);
        ensure(opened.ino === stat.ino && opened.dev === stat.dev && opened.size === stat.size && opened.mode === stat.mode && opened.uid === stat.uid, 'DEPLOYMENT_RECORD');
        // Never let a concurrently growing file turn a bounded record into an
        // unbounded read. One extra byte detects growth after the descriptor check.
        const bytes = Buffer.alloc(opened.size + 1);
        let length = 0;
        while (length < bytes.length) {
            const count = fs.readSync(fd, bytes, length, bytes.length - length, length);
            if (count === 0)
                break;
            length += count;
        }
        ensure(length === opened.size && fs.fstatSync(fd).size === opened.size, 'DEPLOYMENT_RECORD');
        return bytes.subarray(0, length);
    }
    finally {
        fs.closeSync(fd);
    }
}
export function readPrivateRecord(run, name) {
    privateRunDirectory(run);
    ensure(/^(fund|upload|create)\.(claim|attempt\.json|receipt\.json)$/.test(name), 'DEPLOYMENT_FILENAME');
    try {
        return JSON.parse(readPrivateBytes(path.join(run, name)).toString('utf8'));
    }
    catch (error) {
        if (error instanceof SyntaxError)
            throw Error('DEPLOYMENT_RECORD_JSON');
        throw error;
    }
}
export function claimDeploymentPhase(run, phase, planSha256) {
    phaseName(phase);
    hashValue(planSha256);
    durableCreate(run, `${phase}.claim`, { schema: 'agyion-private-deployment-claim-v1', phase, planSha256, claimedAt: new Date().toISOString() });
}
export function expectedOperation(plan, wasm, phase) {
    ensure(plan.networkPassphrase === Networks.TESTNET && plan.rpcUrl === 'https://soroban-testnet.stellar.org', 'DEPLOYMENT_TESTNET');
    hashValue(plan.wasmSha256);
    ensure(Buffer.isBuffer(wasm) && sha(wasm) === plan.wasmSha256, 'DEPLOYMENT_WASM');
    if (phase === 'upload')
        return Operation.uploadContractWasm({ wasm });
    ensure(phase === 'create', 'DEPLOYMENT_PHASE');
    hashValue(plan.salt);
    ensure(Array.isArray(plan.constructorXdr) && plan.constructorXdr.length > 0, 'DEPLOYMENT_CONSTRUCTOR');
    return Operation.createCustomContract({ address: new Address(plan.sourceAccount), wasmHash: Buffer.from(plan.wasmSha256, 'hex'), salt: Buffer.from(plan.salt, 'hex'), constructorArgs: plan.constructorXdr.map(v => xdr.ScVal.fromXDR(v, 'base64')) });
}
export function validateEnvelope(tx, plan, wasm, phase) {
    ensure(tx.networkPassphrase === Networks.TESTNET && tx.source === plan.sourceAccount, 'DEPLOYMENT_SOURCE');
    ensure(tx.toEnvelope().switch().name === 'envelopeTypeTx', 'DEPLOYMENT_ENVELOPE');
    const body = tx.toEnvelope().v1().tx(), ops = body.operations();
    ensure(ops.length === 1 && !ops[0].sourceAccount(), 'DEPLOYMENT_OPERATION');
    ensure(body.memo().switch().name === 'memoNone', 'DEPLOYMENT_MEMO');
    ensure(tx.timeBounds && tx.timeBounds.minTime === '0' && /^[1-9][0-9]*$/.test(tx.timeBounds.maxTime), 'DEPLOYMENT_TIMEBOUND');
    const expected = expectedOperation(plan, wasm, phase).body().invokeHostFunctionOp();
    ensure(ops[0].body().switch().name === 'invokeHostFunction', 'DEPLOYMENT_OPERATION');
    const actual = ops[0].body().invokeHostFunctionOp();
    ensure(actual.hostFunction().toXDR().equals(expected.hostFunction().toXDR()), 'DEPLOYMENT_OPERATION');
    const auth = actual.auth();
    if (auth.length) {
        ensure(phase === 'create' && auth.length === 1, 'DEPLOYMENT_AUTH');
        const entry = auth[0], invocation = entry.rootInvocation();
        ensure(entry.credentials().switch().name === 'sorobanCredentialsSourceAccount' && invocation.subInvocations().length === 0 && invocation.function().switch().name === 'sorobanAuthorizedFunctionTypeCreateContractV2HostFn', 'DEPLOYMENT_AUTH');
        ensure(invocation.function().createContractV2HostFn().toXDR().equals(expected.hostFunction().createContractV2().toXDR()), 'DEPLOYMENT_AUTH');
    }
    feeBudget(phase, tx.fee, 0n);
    ensure(body.ext().switch() === 1, 'DEPLOYMENT_RESOURCES');
    const resourceFee = BigInt(body.ext().sorobanData().resourceFee().toString());
    ensure(resourceFee >= 0n && resourceFee <= BigInt(tx.fee), 'DEPLOYMENT_RESOURCE_FEE');
    return true;
}
function verifiedSigned(envelope, plan, wasm, phase) {
    ensure(typeof envelope === 'string' && envelope.length <= 1024 * 1024, 'DEPLOYMENT_ENVELOPE');
    const tx = TransactionBuilder.fromXDR(envelope, Networks.TESTNET);
    validateEnvelope(tx, plan, wasm, phase);
    ensure(tx.signatures.length === 1, 'DEPLOYMENT_SIGNATURE');
    const key = Keypair.fromPublicKey(plan.sourceAccount), signature = tx.signatures[0];
    ensure(signature.hint().equals(key.signatureHint()) && key.verify(tx.hash(), signature.signature()), 'DEPLOYMENT_SIGNATURE');
    return tx;
}
function attemptFor(run, phase, planSha256, plan, wasm) {
    const a = readPrivateRecord(run, `${phase}.attempt.json`);
    ensure(a.schema === 'agyion-private-deployment-attempt-v1' && a.phase === phase && a.planSha256 === planSha256, 'DEPLOYMENT_SCOPE');
    hashValue(a.hash);
    const tx = verifiedSigned(a.envelopeXdr, plan, wasm, phase);
    ensure(tx.hash().toString('hex') === a.hash && tx.fee === a.maxFee, 'DEPLOYMENT_ATTEMPT');
    return { a, tx };
}
function receipt(run, value) {
    try {
        durableCreate(run, `${value.phase}.receipt.json`, value);
    }
    catch (error) {
        if (error?.code !== 'EEXIST')
            throw error;
        ensure(JSON.stringify(readPrivateRecord(run, `${value.phase}.receipt.json`)) === JSON.stringify(value), 'DEPLOYMENT_RECEIPT_CONFLICT');
    }
}
export async function recoverDeploymentPhase({ run, phase, planSha256, plan, wasm, getTransaction }) {
    phaseName(phase);
    hashValue(planSha256);
    const { a, tx } = attemptFor(run, phase, planSha256, plan, wasm);
    let result;
    try {
        result = await getTransaction(a.hash);
    }
    catch {
        return { status: 'pending', hash: a.hash };
    }
    if (result.status === 'NOT_FOUND')
        return { status: 'pending', hash: a.hash };
    ensure(['SUCCESS', 'FAILED'].includes(result.status), 'DEPLOYMENT_RECEIPT_STATUS');
    ensure(Number.isSafeInteger(result.ledger) && result.ledger > 0, 'DEPLOYMENT_RECEIPT_LEDGER');
    ensure(result.envelopeXdr.toXDR('base64') === tx.toXDR(), 'DEPLOYMENT_RECEIPT_ENVELOPE');
    const outcome = result.resultXdr.result().switch();
    ensure(result.status === 'SUCCESS' ? outcome.name === 'txSuccess' : Number.isInteger(outcome.value) && outcome.value < 0, 'DEPLOYMENT_RECEIPT_STATUS');
    const charged = BigInt(result.resultXdr.feeCharged().toString());
    ensure(charged >= 0n && charged <= BigInt(tx.fee), 'DEPLOYMENT_RECEIPT_FEE');
    const value = { schema: 'agyion-private-deployment-receipt-v1', phase, planSha256, hash: a.hash, status: result.status === 'SUCCESS' ? 'confirmed' : 'failed', ledger: result.ledger, feeCharged: charged.toString() };
    receipt(run, value);
    return value;
}
export async function executeDeploymentPhase({ run, phase, planSha256, plan, wasm, prepare, sign, sendTransaction, getTransaction }) {
    ensure(['upload', 'create'].includes(phase), 'DEPLOYMENT_PHASE');
    expectedOperation(plan, wasm, phase);
    claimDeploymentPhase(run, phase, planSha256);
    const prepared = await prepare();
    validateEnvelope(prepared, plan, wasm, phase);
    ensure(prepared.signatures.length === 0, 'DEPLOYMENT_UNSIGNED_REQUIRED');
    const expires = BigInt(prepared.timeBounds.maxTime), now = BigInt(Math.floor(Date.now() / 1000));
    ensure(expires > now && expires <= now + 180n, 'DEPLOYMENT_TIMEBOUND');
    let previous = 0n;
    for (const name of ['upload', 'create'])
        if (fs.existsSync(path.join(run, `${name}.attempt.json`)))
            previous += BigInt(attemptFor(run, name, planSha256, plan, wasm).tx.fee);
    feeBudget(phase, prepared.fee, previous);
    const before = prepared.toEnvelope().v1().tx().toXDR('base64');
    const signed = verifiedSigned(await sign(prepared), plan, wasm, phase);
    ensure(signed.toEnvelope().v1().tx().toXDR('base64') === before, 'DEPLOYMENT_SIGNER_CHANGED_TRANSACTION');
    const hash = signed.hash().toString('hex');
    durableCreate(run, `${phase}.attempt.json`, { schema: 'agyion-private-deployment-attempt-v1', phase, planSha256, hash, maxFee: signed.fee, envelopeXdr: signed.toXDR(), preparedAt: new Date().toISOString() });
    try {
        await sendTransaction(signed);
    }
    catch { /* An uncertain transport cannot authorize a replacement. */ }
    return recoverDeploymentPhase({ run, phase, planSha256, plan, wasm, getTransaction });
}
