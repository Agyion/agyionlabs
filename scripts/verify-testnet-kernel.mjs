/** Explicit owned-kernel testnet integration. Default is a plan with no RPC.
 * Dedicated random identities, Friendbot XLM only, no existing wallet keys.
 * Records hashes before broadcasting; never automatically resubmits an uncertain send.
 * Usage: node scripts/verify-testnet-kernel.mjs --execute CONTRACT WASM SHA256 OUTPUT
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(new URL('../app/package.json', import.meta.url));
const { Keypair, Address, Asset, Contract, TransactionBuilder, nativeToScVal, scValToNative, xdr, rpc, contract } = require('@stellar/stellar-sdk');
const RPC = 'https://soroban-testnet.stellar.org';
const NETWORK = 'Test SDF Network ; September 2015';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const args = process.argv.slice(2);
if (args[0] !== '--execute') {
  console.log('Plan only: verify pinned V3 bytes/network, create three dedicated Friendbot accounts, run Fade/Pod/Trigger/Envoy settlement and rejection checks, save public transaction evidence. No RPC, identity creation or funding performed.');
  process.exit(0);
}
assert.equal(args.length, 5, 'Expected --execute CONTRACT WASM SHA256 OUTPUT');
const [, id, wasmPath, expectedHash, outputValue] = args;
assert.match(id, /^C[A-Z2-7]{55}$/); assert.match(expectedHash, /^[a-f0-9]{64}$/);
const wasm = fs.readFileSync(wasmPath); assert.equal(sha(wasm), expectedHash);
const spec = contract.Spec.fromWasm(wasm), kernel = new Contract(id), server = new rpc.Server(RPC);
const output = path.resolve(outputValue);
assert.ok(output.startsWith(path.resolve('artifacts') + path.sep), 'Evidence must stay in ignored artifacts');
fs.mkdirSync(output, { recursive: false, mode: 0o700 });
const report = { schema: 'agyion-testnet-kernel-integration-v1', at: new Date().toISOString(), contractId: id, wasmSha256: expectedHash, network: NETWORK, rpc: RPC, status: 'running', checks: [], transactions: [], accounts: {}, boundary: 'Actual testnet transactions using dedicated local keypairs and native XLM SAC. No browser wallet, Circle USDC funding, SEP ramp, private ZK activation, mainnet or audit claim.' };
const json = value => JSON.stringify(value, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2) + '\n';
const save = () => fs.writeFileSync(path.join(output, 'report.json'), json(report));
const check = (name, evidence = {}) => { report.checks.push({ name, ...evidence }); save(); console.log(`Verified: ${name}`); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const unwrap = v => v?.unwrap instanceof Function ? v.unwrap() : v;
const read = async (method, params = {}, source, target = kernel) => {
  const account = await server.getAccount(source);
  const values = target === kernel ? spec.funcArgsToScVals(method, params) : params;
  const tx = new TransactionBuilder(account, { fee: '100', networkPassphrase: NETWORK }).addOperation(target.call(method, ...values)).setTimeout(90).build();
  const sim = await server.simulateTransaction(tx);
  assert.ok(!rpc.Api.isSimulationError(sim), `Simulation ${method}: ${sim.error || 'failed'}`);
  assert.ok(sim.result, `Simulation ${method} has no result`);
  return target === kernel ? unwrap(spec.funcResToNative(method, sim.result.retval)) : scValToNative(sim.result.retval);
};
const send = async (method, params, signer) => {
  const tx = new TransactionBuilder(await server.getAccount(signer.publicKey()), { fee: '100', networkPassphrase: NETWORK }).addOperation(kernel.call(method, ...spec.funcArgsToScVals(method, params))).setTimeout(90).build();
  const sim = await server.simulateTransaction(tx);
  assert.ok(!rpc.Api.isSimulationError(sim), `Simulation ${method}: ${sim.error || 'failed'}`);
  const ready = rpc.assembleTransaction(tx, sim).build();
  assert.ok(BigInt(ready.fee) <= 10_000_000n, 'Refusing fee over one testnet XLM');
  ready.sign(signer);
  const hash = ready.hash().toString('hex');
  const evidence = { method, hash, account: signer.publicKey(), status: 'prepared', maxFee: ready.fee };
  report.transactions.push(evidence); save();
  try {
    const sent = await server.sendTransaction(ready); evidence.sendStatus = sent.status; save();
    assert.equal(sent.hash, hash, 'RPC returned a different transaction hash');
    assert.ok(['PENDING', 'DUPLICATE'].includes(sent.status), `Submit ${method}: ${sent.status}`);
    for (let i = 0; i < 50; i++) {
      const confirmed = await server.getTransaction(hash);
      if (confirmed.status === 'SUCCESS') {
        assert.ok(Number.isSafeInteger(confirmed.ledger) && confirmed.ledger > 0, 'Inclusion ledger missing');
        assert.equal(confirmed.envelopeXdr.toXDR('base64'), ready.toXDR(), 'Included envelope differs from submitted envelope');
        assert.equal(confirmed.resultXdr.result().switch().name, 'txSuccess');
        const fee = BigInt(confirmed.resultXdr.feeCharged().toString());
        assert.ok(fee >= 0n && fee <= BigInt(ready.fee), 'Unexpected charged fee');
        Object.assign(evidence, { status: 'SUCCESS', ledger: confirmed.ledger, feeCharged: confirmed.resultXdr.feeCharged().toString() }); save();
        console.log(`Included: ${method} ledger ${confirmed.ledger}`);
        const value = unwrap(spec.funcResToNative(method, confirmed.returnValue));
        if (method.startsWith('create_')) assert.ok(typeof value === 'bigint' && value > 0n && value <= (1n << 64n) - 1n, 'Created ID must be positive u64');
        return { value, evidence };
      }
      if (confirmed.status === 'FAILED') { evidence.status = 'FAILED'; save(); throw new Error(`Chain rejected ${method}: ${hash}`); }
      await sleep(1500);
    }
    throw new Error(`Inclusion unresolved: ${hash}; inspect recorded hash before retrying.`);
  } catch (e) { if (evidence.status !== 'FAILED') evidence.status = 'unresolved'; save(); throw e; }
};
const rejected = async (name, method, params, source, expected = /Error\(Contract,\s*#2\)/) => {
  // Negative cases are simulations only. The exact expected contract error is
  // required; transport/parser failures cannot count as a rejected operation.
  const tx = new TransactionBuilder(await server.getAccount(source), { fee: '100', networkPassphrase: NETWORK }).addOperation(kernel.call(method, ...spec.funcArgsToScVals(method, params))).setTimeout(90).build();
  const sim = await server.simulateTransaction(tx);
  assert.ok(rpc.Api.isSimulationError(sim) && expected.test(sim.error), `Expected ${expected} rejection, got ${sim.error}`);
  check(name, { simulationOnly: true, error: sim.error.split('\n')[0] });
};
const u64 = n => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; };
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const address = value => new Address(value).toScVal().toXDR();
const domain = (name, version = 'v2') => Buffer.concat([Buffer.from(`agyion:${name}:${version}\0`), Buffer.from(sha(Buffer.from(NETWORK)), 'hex'), address(id)]);
const credential = (key, name, ...values) => key.sign(Buffer.concat([domain(name), ...values]));
const latest = async () => (await server.getLatestLedger()).sequence;
const waitPast = async ledger => { for (let i = 0; i < 45; i++) { if (await latest() > ledger) return; await sleep(1500); } throw new Error('Ledger deadline wait exceeded'); };
try {
  assert.equal((await server.getNetwork()).passphrase, NETWORK);
  const instance = await server.getLedgerEntries(kernel.getFootprint());
  assert.equal(instance.entries.length, 1); assert.equal(instance.entries[0].key.toXDR('base64'), kernel.getFootprint().toXDR('base64'));
  const actual = instance.entries[0].val.contractData().val().instance().executable().wasmHash().toString('hex');
  assert.equal(actual, expectedHash);
  const codeKey = xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from(expectedHash, 'hex') }));
  const code = await server.getLedgerEntries(codeKey); assert.equal(code.entries.length, 1); assert.equal(code.entries[0].key.toXDR('base64'), codeKey.toXDR('base64'));
  assert.equal(sha(code.entries[0].val.contractCode().code()), expectedHash);
  check('Pinned testnet contract instance and actual WASM bytes match reviewed source artifact');
  const keys = { seller: Keypair.random(), recipient: Keypair.random(), relayer: Keypair.random(), pod: Keypair.random(), venue: Keypair.random(), attester: Keypair.random(), agent: Keypair.random() };
  fs.writeFileSync(path.join(output, 'test-only-keys.json'), json(Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, { publicKey: v.publicKey(), testnetOnlySecret: v.secret() }]))), { flag: 'wx', mode: 0o600 });
  for (const name of ['seller', 'recipient', 'relayer']) {
    const key = keys[name]; report.accounts[name] = key.publicKey(); save();
    const response = await fetch(`https://friendbot.stellar.org/?addr=${key.publicKey()}`, { signal: AbortSignal.timeout(30000) });
    assert.ok(response.ok, `Friendbot ${name}: ${response.status}`); await response.arrayBuffer();
    await server.getAccount(key.publicKey());
  }
  const { seller, recipient, relayer } = report.accounts;
  assert.equal(await read('protocol_version', {}, relayer), 3);
  const asset = Asset.native().contractId(NETWORK), token = new Contract(asset), amount = 10_000_000n;
  report.asset = { contractId: asset, code: 'XLM', amountPerPot: amount.toString() }; save();
  const balance = who => read('balance', [nativeToScVal(who, { type: 'address' })], relayer, token);
  const initialReserve = await balance(id);
  check('New dedicated test accounts funded and V3 read from actual deployment');
  const fadeArgs = price => ({ seller, asset, pot: amount, start_price: price, floor_price: price, slope_num: 0n, slope_den: 1n, duration_ledgers: 100, handoff_window: 30, venue_pubkey: keys.venue.rawPublicKey() });
  for (const price of [-1_000_000n, 1_000_000n]) {
    const { value: fadeId } = await send('create_fade', fadeArgs(price), keys.seller);
    assert.equal(await balance(id), initialReserve + amount);
    await send('claim', { fade_id: fadeId, claimant: recipient }, keys.recipient);
    await rejected('Second Fade claim rejected', 'claim', { fade_id: fadeId, claimant: relayer }, relayer);
    const ts = BigInt(Date.now()), sig = credential(keys.venue, 'handoff', u64(fadeId), address(recipient), u64(ts));
    const before = await balance(recipient);
    const settled = await send('confirm_handoff', { fade_id: fadeId, ts, sig }, price > 0 ? keys.recipient : keys.relayer);
    assert.equal(await balance(id), initialReserve);
    assert.equal(await balance(recipient), before - price - (price > 0 ? BigInt(settled.evidence.feeCharged) : 0n));
    assert.equal((await read('get_fade', { fade_id: fadeId }, relayer)).state, 2);
    await rejected('Fade settlement replay rejected', 'confirm_handoff', { fade_id: fadeId, ts, sig }, relayer);
    check(`Fade ${price > 0 ? 'positive' : 'negative'} settlement preserves reserve and exact recipient payment`);
  }
  const unlock = await latest(), pub = keys.pod.rawPublicKey();
  const proof = keys.pod.sign(Buffer.concat([domain('pod-create', 'v3'), address(seller), address(asset), Buffer.from(amount.toString(16).padStart(32, '0'), 'hex'), u32(unlock), pub]));
  const { value: podId } = await send('create_pod', { funder: seller, asset, amount, unlock_ledger: unlock, claim_pubkey: pub, key_proof: proof }, keys.seller);
  const signature = keys.pod.sign(Buffer.concat([domain('pod-claim', 'v3'), u64(podId), address(recipient)]));
  await rejected('Pod signature cannot redirect recipient', 'claim_pod', { pod_id: podId, recipient: relayer, signature }, relayer, /Error\(Crypto,\s*InvalidInput\)/);
  const beforePod = await balance(recipient);
  const opened = await send('claim_pod', { pod_id: podId, recipient, signature }, keys.recipient);
  assert.equal(await balance(recipient), beforePod + amount - BigInt(opened.evidence.feeCharged));
  assert.equal(await balance(id), initialReserve);
  await rejected('Pod second claim rejected', 'claim_pod', { pod_id: podId, recipient, signature }, recipient);
  check('Pod V3 creation and recipient-bound opening settle exact amount once');
  const triggerArgs = deadline => ({ funder: seller, asset, amount, beneficiary: recipient, attester_pubkey: keys.attester.rawPublicKey(), deadline_ledger: deadline });
  const { value: triggerId } = await send('create_trigger', triggerArgs(await latest() + 60), keys.seller);
  const ts = BigInt(Date.now()), sig = credential(keys.attester, 'attest', u64(triggerId), address(recipient), u64(ts)), beforeTrigger = await balance(recipient);
  await send('attest', { trigger_id: triggerId, ts, sig }, keys.relayer);
  assert.equal(await balance(recipient), beforeTrigger + amount); assert.equal(await balance(id), initialReserve);
  await rejected('Trigger repeat attestation rejected', 'attest', { trigger_id: triggerId, ts, sig }, relayer);
  check('Trigger signed payout reaches fixed beneficiary once');
  const deadline = await latest() + 4;
  const { value: refundable } = await send('create_trigger', triggerArgs(deadline), keys.seller);
  await waitPast(deadline); const beforeRefund = await balance(seller);
  await send('refund_trigger', { trigger_id: refundable }, keys.relayer);
  assert.equal(await balance(seller), beforeRefund + amount); assert.equal(await balance(id), initialReserve);
  check('Trigger expired escrow refunds funder without funder submission');
  const { value: noShow } = await send('create_fade', { ...fadeArgs(0n), duration_ledgers: 4, handoff_window: 3 }, keys.seller);
  await send('claim', { fade_id: noShow, claimant: recipient }, keys.recipient);
  const claim = await read('get_fade', { fade_id: noShow }, relayer); await waitPast(claim.claimed_at + claim.handoff_window);
  const beforeNoShow = await balance(seller); await send('refund', { fade_id: noShow }, keys.relayer);
  assert.equal(await balance(seller), beforeNoShow + amount); assert.equal(await balance(id), initialReserve);
  check('Fade claimed but unconfirmed handoff refunds pot after deadline');
  const { value: mandateId } = await send('create_mandate', { owner: recipient, agent_pubkey: keys.agent.rawPublicKey(), max_per_tx: amount, daily_cap: amount, valid_until: await latest() + 80 }, keys.recipient);
  const { value: envoyFade } = await send('create_fade', fadeArgs(-1_000_000n), keys.seller);
  const agentSig = credential(keys.agent, 'envoy', u64(mandateId), u64(envoyFade), u64(ts));
  await send('envoy_claim', { mandate_id: mandateId, fade_id: envoyFade, ts, agent_sig: agentSig }, keys.relayer);
  assert.equal((await read('get_fade', { fade_id: envoyFade }, relayer)).claimant, recipient);
  assert.equal((await read('get_mandate', { mandate_id: mandateId }, relayer)).claims_used, 1);
  const handoffSig = credential(keys.venue, 'handoff', u64(envoyFade), address(recipient), u64(ts));
  await send('confirm_handoff', { fade_id: envoyFade, ts, sig: handoffSig }, keys.relayer);
  await send('revoke_mandate', { owner: recipient, mandate_id: mandateId }, keys.recipient);
  const { value: afterRevoke } = await send('create_fade', fadeArgs(0n), keys.seller);
  const revokedSig = credential(keys.agent, 'envoy', u64(mandateId), u64(afterRevoke), u64(ts));
  await rejected('Revoked Envoy grant rejected on an otherwise open listing', 'envoy_claim', { mandate_id: mandateId, fade_id: afterRevoke, ts, agent_sig: revokedSig }, relayer, /Error\(Contract,\s*#11\)/);
  assert.equal((await read('get_fade', { fade_id: afterRevoke }, relayer)).state, 0);
  assert.equal((await read('get_mandate', { mandate_id: mandateId }, relayer)).claims_used, 1);
  await send('claim', { fade_id: afterRevoke, claimant: recipient }, keys.recipient);
  await send('confirm_handoff', { fade_id: afterRevoke, ts, sig: credential(keys.venue, 'handoff', u64(afterRevoke), address(recipient), u64(ts)) }, keys.relayer);
  assert.equal(await balance(id), initialReserve);
  check('Envoy agent claims only for grant owner and revocation blocks further use');
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = error.message; process.exitCode = 1; console.error(error.message); }
finally { report.finished = new Date().toISOString(); save(); console.log(`Testnet integration ${report.status}; evidence ${path.join(output, 'report.json')}`); }
