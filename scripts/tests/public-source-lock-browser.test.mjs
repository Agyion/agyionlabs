import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import http from 'node:http';

test('public source guard prevents preparation in another real browser tab and survives reload',
  { skip: process.env.PUBLIC_SOURCE_BROWSER_TEST !== '1', timeout: 60_000 }, async t => {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const require = createRequire(new URL('../../package.json', import.meta.url));
    const sdk = createRequire(new URL('../../app/package.json', import.meta.url))('@stellar/stellar-sdk');
    const { chromium } = require('@playwright/test');
    const esbuild = [join(root, 'node_modules/esbuild/lib/main.js'), join(root, 'landing/node_modules/esbuild/lib/main.js')].find(existsSync);
    assert.ok(esbuild);
    const directory = mkdtempSync(join(tmpdir(), 'agyion-public-source-browser-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const bundle = join(directory, 'test.js');
    // Production client, generated SDK binding, journal and native Web Locks.
    // Only readiness and RPC are fixture boundaries; no real wallet is used.
    const contents = `
      import { Account } from ${JSON.stringify(join(root, 'app/node_modules/@stellar/stellar-sdk/lib/esm/index.js'))};
      import { SorobanAgyionClient } from ${JSON.stringify(join(root, 'app/app/lib/agyionClient.ts'))};
      import { rememberTransactionAttempt, listTransactionAttempts } from ${JSON.stringify(join(root, 'app/app/lib/transactionReceipts.ts'))};
      const work = new Map();
      globalThis.sourceGuardTest = {
        start(id, scope, action, hold = false) {
          const state = { preparations: 0, simulations: 0, walletCalls: 0, done: false, error: null };
          const client = new SorobanAgyionClient({ contractId: scope.contractId, networkPassphrase: scope.network,
            rpcUrl: 'https://rpc.invalid', signer: { address: async () => scope.account,
              signTransaction: async () => { state.walletCalls++; throw Error('Unexpected wallet call'); } } });
          client.protocolReadiness = async () => 'ready';
          client.server.getAccount = async address => { state.preparations++; return new Account(address, '1'); };
          client.server.simulateTransaction = async () => {
            state.simulations++;
            if (hold) await new Promise(resolve => { state.release = resolve; });
            throw Error('Fixture stopped at actual SDK simulation boundary');
          };
          work.set(id, state);
          const operation = action === 'claim' ? client.claim(1n, scope.account) : client.refund(2n);
          state.completion = operation.then(() => { state.done = true; }, error => { state.error = error.message; state.done = true; });
        },
        state(id) { const s = work.get(id); return { preparations: s.preparations, simulations: s.simulations,
          walletCalls: s.walletCalls, done: s.done, error: s.error }; },
        release(id) { work.get(id).release(); },
        remember(attempt) { rememberTransactionAttempt(attempt); },
        attempts() { return listTransactionAttempts(); }
      };
    `;
    await require(esbuild).build({ stdin: { contents, resolveDir: root }, tsconfig: join(root, 'app/tsconfig.json'),
      bundle: true, format: 'esm', platform: 'browser', target: 'chrome120', outfile: bundle,
      define: { 'process.env': '{"NODE_ENV":"test"}', 'process.browser': 'true' }, logLevel: 'silent' });
    const script = readFileSync(bundle);
    const server = http.createServer((request, response) => {
      if (request.url === '/test.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(script); }
      else if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); }
      else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Local source guard test</title><script type="module" src="/test.js"></script>'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const executablePath = [chromium.executablePath(), '/opt/google/chrome/chrome', '/usr/bin/chromium'].find(existsSync);
    assert.ok(executablePath);
    const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-background-networking'] });
    t.after(() => browser.close());
    const context = await browser.newContext();
    let external = 0;
    const pageErrors = [];
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : (external++, route.abort()));
    const open = async () => {
      const page = await context.newPage(); page.on('pageerror', error => pageErrors.push(error.message));
      await page.goto(origin);
      try { await page.waitForFunction(() => Boolean(globalThis.sourceGuardTest), null, { timeout: 5000 }); }
      catch (error) { throw new Error(`Browser fixture did not load: ${JSON.stringify(pageErrors)}; ${error.message}`); }
      return page;
    };
    const first = await open(), second = await open();
    const scope = { account: sdk.StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 91)), network: sdk.Networks.TESTNET,
      contractId: sdk.StrKey.encodeContract(Buffer.alloc(32, 92)) };
    const other = { ...scope, contractId: sdk.StrKey.encodeContract(Buffer.alloc(32, 93)) };
    await first.evaluate(scope => globalThis.sourceGuardTest.start('first', scope, 'claim', true), scope);
    await first.waitForFunction(() => globalThis.sourceGuardTest.state('first').simulations === 1);
    await second.evaluate(scope => globalThis.sourceGuardTest.start('second', scope, 'refund'), other);
    await second.waitForFunction(() => globalThis.sourceGuardTest.state('second').done);
    const losing = await second.evaluate(() => globalThis.sourceGuardTest.state('second'));
    assert.equal(losing.preparations, 0, 'Contending tab must stop before SDK preparation');
    assert.equal(losing.simulations, 0); assert.equal(losing.walletCalls, 0); assert.match(losing.error, /another tab/i);
    // An unrelated source remains usable while the first source is reserved.
    const unrelated = { ...other, account: sdk.StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 94)) };
    await second.evaluate(scope => globalThis.sourceGuardTest.start('unrelated', scope, 'refund'), unrelated);
    await second.waitForFunction(() => globalThis.sourceGuardTest.state('unrelated').done);
    const independent = await second.evaluate(() => globalThis.sourceGuardTest.state('unrelated'));
    assert.equal(independent.preparations, 1); assert.equal(independent.simulations, 1); assert.equal(independent.walletCalls, 0);
    assert.equal(independent.error, 'Fixture stopped at actual SDK simulation boundary');
    await first.evaluate(() => globalThis.sourceGuardTest.release('first'));
    await first.waitForFunction(() => globalThis.sourceGuardTest.state('first').done);
    const released = await first.evaluate(() => globalThis.sourceGuardTest.state('first'));
    assert.equal(released.preparations, 1); assert.equal(released.simulations, 1); assert.equal(released.walletCalls, 0);
    assert.equal(released.error, 'Fixture stopped at actual SDK simulation boundary');
    assert.deepEqual(await first.evaluate(() => globalThis.sourceGuardTest.attempts()), []);
    // A persisted unknown old-contract hash blocks new-contract preparation,
    // including after the page and its in-memory client have been replaced.
    const hash = 'ab'.repeat(32);
    await first.evaluate(attempt => globalThis.sourceGuardTest.remember(attempt), { ...scope, hash, action: 'claim', refId: '1' });
    await second.reload(); await second.waitForFunction(() => Boolean(globalThis.sourceGuardTest));
    await second.evaluate(scope => globalThis.sourceGuardTest.start('reloaded', scope, 'refund'), other);
    await second.waitForFunction(() => globalThis.sourceGuardTest.state('reloaded').done);
    const reloaded = await second.evaluate(() => globalThis.sourceGuardTest.state('reloaded'));
    assert.equal(reloaded.preparations, 0); assert.equal(reloaded.simulations, 0); assert.equal(reloaded.walletCalls, 0);
    assert.ok(reloaded.error.includes(hash));
    const attempts = await second.evaluate(() => globalThis.sourceGuardTest.attempts());
    assert.equal(attempts.length, 1); assert.equal(attempts[0].hash, hash); assert.equal(attempts[0].contractId, scope.contractId);
    assert.equal(external, 0); assert.deepEqual(pageErrors, []);
    t.diagnostic('Two same-origin tabs, actual Web Locks/localStorage and generated SDK binding; synthetic RPC, zero wallet or external network calls.');
  });
