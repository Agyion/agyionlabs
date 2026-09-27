import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = path.resolve(new URL('../../', import.meta.url).pathname);
const script = path.join(root, 'scripts/deploy-public-testnet.mjs');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const deny = 'data:text/javascript,' + encodeURIComponent(`
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const denied=()=>{fs.writeFileSync(process.env.PUBLIC_DEPLOY_TEST_EXTERNAL,'attempted',{flag:'a',mode:0o600});throw Error('UNEXPECTED_EXTERNAL_ACTION')};
globalThis.fetch=denied;http.request=denied;http.get=denied;https.request=denied;https.get=denied;cp.spawnSync=denied;syncBuiltinESMExports();
`);
function fixture(t) {
  fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  const run = fs.mkdtempSync(path.join(root, 'artifacts/public-cli-test-'));
  fs.chmodSync(run, 0o700);
  t.after(() => fs.rmSync(run, { recursive: true, force: true }));
  const marker = path.join(run, 'external-attempt');
  return {
    run,
    execute(args) {
      const result = spawnSync(process.execPath, ['--import', deny, script, ...args], {
        cwd: root, encoding: 'utf8', timeout: 20000, maxBuffer: 20000,
        env: { ...process.env, PUBLIC_DEPLOY_TEST_EXTERNAL: marker },
      });
      assert.equal(fs.existsSync(marker), false, 'Invalid or offline input reached network or CLI');
      return result;
    },
  };
}

test('public V4 default plan is offline with fixed code and distinct explicit phases', t => {
  const f = fixture(t), result = f.execute([]);
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.testOnly, true);
  assert.equal(plan.protocolVersion, 4);
  assert.equal(plan.candidateWasm, 'd101e0fea1852cf057049cc08695b9e26a8b3c6a82db58d4c2706db03a22b186');
  assert.equal(plan.funding.maximumCalls, 1);
  assert.deepEqual(plan.feeLimitsStroops, { upload: '200000000', create: '2500000000', aggregate: '2700000000' });
  assert.equal(plan.automaticResend, false);
  assert.equal(plan.activation, 'No application release change. Exact readback, public lifecycles and compatible original-record recovery are separate activation gates.');
  assert.deepEqual(fs.readdirSync(f.run), []);
});

test('public execution requires an explicit protected run and reviewed manifest hash', t => {
  const f = fixture(t);
  for (const args of [['--fund'], ['--fund', f.run], ['--fund', f.run, 'bad'], ['--recover', f.run, 'ab'.repeat(32), 'fund'], ['--create', f.run, 'ab'.repeat(32), 'extra'], ['--force', f.run, 'ab'.repeat(32)]]) {
    const result = f.execute(args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /^DEPLOYMENT_[A-Z_]+\./);
    assert.deepEqual(fs.readdirSync(f.run), []);
  }
});

test('malformed or changed public plans never disclose file contents or reach external actions', t => {
  const f = fixture(t), file = path.join(f.run, 'deployment-manifest.json');
  for (const bytes of [Buffer.from('synthetic-private-fragment'), Buffer.from('{"networkPassphrase":"mainnet"}')]) {
    fs.writeFileSync(file, bytes, { mode: 0o600 });
    for (const hash of ['ab'.repeat(32), sha(bytes)]) {
      const result = f.execute(['--fund', f.run, hash]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /^DEPLOYMENT_[A-Z_]+\./);
      assert.doesNotMatch(result.stderr, /synthetic-private-fragment|mainnet/);
      assert.deepEqual(fs.readdirSync(f.run), ['deployment-manifest.json']);
    }
  }
});

test('public plans with loose permissions or symlinks stop before claiming a phase', t => {
  const f = fixture(t), file = path.join(f.run, 'deployment-manifest.json'), bytes = Buffer.from('{}');
  fs.writeFileSync(file, bytes, { mode: 0o644 });
  assert.equal(f.execute(['--upload', f.run, sha(bytes)]).status, 1);
  fs.unlinkSync(file);
  const target = path.join(f.run, 'target.json');
  fs.writeFileSync(target, bytes, { mode: 0o600 });
  fs.symlinkSync(target, file);
  assert.equal(f.execute(['--upload', f.run, sha(bytes)]).status, 1);
  assert.equal(fs.existsSync(path.join(f.run, 'upload.claim')), false);
});
