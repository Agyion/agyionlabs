import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = path.resolve(new URL('../../', import.meta.url).pathname);
const script = path.join(root, 'scripts/deploy-private-testnet.mjs');
const deny = 'data:text/javascript,' + encodeURIComponent("globalThis.fetch=()=>{throw Error('UNEXPECTED_NETWORK')};");
function execute(args) { return spawnSync(process.execPath, ['--import', deny, script, ...args], { cwd: root, encoding: 'utf8', timeout: 20000, maxBuffer: 20000 }); }
function runDirectory(t) {
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    const dir = fs.mkdtempSync(path.join(root, 'artifacts/private-cli-test-'));
    fs.chmodSync(dir, 0o700);
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
}
const sha = b => createHash('sha256').update(b).digest('hex');
test('default plan is offline and declares separate bounded testnet phases', () => {
    const result = execute([]);
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.testOnly, true);
    assert.equal(plan.funding.maximumCalls, 1);
    assert.equal(plan.feeLimitsStroops.upload, '200000000');
    assert.equal(plan.feeLimitsStroops.create, '2500000000');
    assert.equal(plan.feeLimitsStroops.aggregate, '2700000000');
    assert.equal(plan.automaticResend, false);
});
test('every execution requires an explicit directory and externally reviewed manifest hash', t => {
    const dir = runDirectory(t);
    for (const args of [['--fund'], ['--fund', dir], ['--fund', dir, 'bad'], ['--recover', dir, 'ab'.repeat(32), 'fund'], ['--create', dir, 'ab'.repeat(32), 'extra'], ['--anything', dir, 'ab'.repeat(32)]]) {
        const result = execute(args);
        assert.equal(result.status, 1);
        assert.doesNotMatch(result.stderr, /UNEXPECTED_NETWORK/);
        assert.deepEqual(fs.readdirSync(dir), []);
    }
});
test('changed or malformed manifest stops before a phase claim, network or CLI identity access', t => {
    const dir = runDirectory(t), file = path.join(dir, 'deployment-manifest.json');
    for (const [bytes, hash] of [[Buffer.from('synthetic-secret-fragment'), 'ab'.repeat(32)], [Buffer.from('synthetic-secret-fragment'), sha(Buffer.from('synthetic-secret-fragment'))], [Buffer.from('{"networkPassphrase":"mainnet"}'), sha(Buffer.from('{"networkPassphrase":"mainnet"}'))]]) {
        fs.writeFileSync(file, bytes, { mode: 0o600 });
        const result = execute(['--fund', dir, hash]);
        assert.equal(result.status, 1);
        assert.doesNotMatch(result.stderr, /synthetic-secret-fragment|mainnet|UNEXPECTED_NETWORK/);
        assert.deepEqual(fs.readdirSync(dir), ['deployment-manifest.json']);
    }
});
test('unprotected and symlinked local plans cannot reach external execution', t => {
    const dir = runDirectory(t), file = path.join(dir, 'deployment-manifest.json'), data = Buffer.from('{}');
    fs.writeFileSync(file, data, { mode: 0o644 });
    assert.equal(execute(['--upload', dir, sha(data)]).status, 1);
    fs.unlinkSync(file);
    const target = path.join(dir, 'public.json');
    fs.writeFileSync(target, data, { mode: 0o600 });
    fs.symlinkSync(target, file);
    const result = execute(['--upload', dir, sha(data)]);
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stderr, /UNEXPECTED_NETWORK/);
    assert.equal(fs.existsSync(path.join(dir, 'upload.claim')), false);
});
