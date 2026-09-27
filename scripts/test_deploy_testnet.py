#!/usr/bin/env python3
"""Deployment control-flow tests. Every CLI is a local stub; no network or real keys."""
import json
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('deploy_testnet.sh')
RPC = 'https://soroban-testnet.stellar.org'
PASSPHRASE = 'Test SDF Network ; September 2015'
CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM'
ADDRESS = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
ACTIVE_V3_HASH = '1e6643028d6b397b3a762d4b5312eaf20f2744407686c78122d27c5a4dd8d378'
RENAMED_V3_HASH = 'bce9e56ef654d4fb694d7b813337f90024fc8361982dce490024032c65499fc8'
FIXTURE_WASM = bytes([0, 97, 115, 109, 1, 0, 0, 0])

STUB = '''#!/usr/bin/env python3
import json, os, pathlib, sys
args = sys.argv[1:]
name = pathlib.Path(sys.argv[0]).name
if args[:1] == ['--no-cache']: args = args[1:]
with open(os.environ['STUB_LOG'], 'a') as log:
    log.write(json.dumps([name, *args]) + '\\n')
if name == 'cargo':
    if args == ['--version']: print('cargo 1.96.1')
    elif args[:1] in [['test'], ['build']]: pass
    else: sys.exit(91)
elif name == 'rustup':
    if args == ['target', 'list', '--installed']: print('wasm32v1-none')
    else: sys.exit(92)
elif args == ['--version']:
    print('stellar 28.0.0')
elif args[:2] == ['keys', 'address']:
    if os.environ.get('STUB_MISSING_ALIAS') == '1' and not pathlib.Path(os.environ['STUB_KEY']).exists(): sys.exit(1)
    print('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF')
elif args[:2] == ['keys', 'generate']:
    pathlib.Path(os.environ['STUB_KEY']).touch()
elif args[:2] == ['keys', 'fund']:
    pass
elif args[:2] == ['contract', 'build']:
    path = pathlib.Path(os.environ['STUB_WASM'])
    path.parent.mkdir(parents=True, exist_ok=True)
    body = bytes([0, 97, 115, 109, 1, 0, 0, 0])
    if os.environ.get('STUB_CANDIDATE_V4') == '1':
        # Valid empty custom section marks different, unreviewed compiled bytes.
        body += bytes([0, 1, 0])
    path.write_bytes(body)
elif args[:2] == ['contract', 'deploy']:
    print('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM')
elif args[:2] == ['contract', 'fetch']:
    if os.environ.get('STUB_FETCH_FAIL') == '1': sys.exit(94)
    target = pathlib.Path(args[args.index('--out-file') + 1])
    target.write_bytes(b'wrong-code' if os.environ.get('STUB_FETCH_WRONG') == '1' else pathlib.Path(os.environ['STUB_WASM']).read_bytes())
elif args[:2] == ['contract', 'invoke']:
    print(os.environ.get('STUB_PROTOCOL_VERSION', '3'))
else:
    sys.exit(93)
'''


class DeployHelperTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.script = root / 'scripts/deploy_testnet.sh'
        self.script.parent.mkdir()
        shutil.copy2(SCRIPT, self.script)
        # Test only a disposable copy. Production reviewed hashes have no env
        # override; use a public minimal WASM fixture for the local stub builder.
        copied = self.script.read_text()
        copied = copied.replace(ACTIVE_V3_HASH, hashlib.sha256(FIXTURE_WASM).hexdigest())
        self.script.write_text(copied)
        contract_dir = root / 'contracts/agyion'
        contract_dir.mkdir(parents=True)
        (contract_dir / 'Cargo.toml').write_text('[package]\nname="agyion"\n')
        (contract_dir / 'Cargo.lock').write_text('# fixture\n')
        self.wasm = contract_dir / 'target/wasm32v1-none/release/agyion.wasm'
        self.wasm.parent.mkdir(parents=True)
        self.wasm.write_bytes(b'\0asm\x01\0\0\0')
        self.bin = root / 'bin'
        self.bin.mkdir()
        for name in ['stellar-stub', 'cargo', 'rustup']:
            path = self.bin / name
            path.write_text(STUB)
            path.chmod(0o755)
        self.log = root / 'calls.jsonl'
        self.env = {key: val for key, val in os.environ.items() if not key.startswith('STELLAR_')}
        for key in ['NETWORK', 'DRY_RUN', 'DEPLOYER_ALIAS', 'CARGO_TARGET_DIR']:
            self.env.pop(key, None)
        self.env.update(PATH=f'{self.bin}:{self.env["PATH"]}',
                        STELLAR_BIN=str(self.bin / 'stellar-stub'),
                        STUB_LOG=str(self.log), STUB_KEY=str(root / 'key-created'),
                        STUB_WASM=str(self.wasm))

    def run_script(self, **env):
        result = subprocess.run(['bash', str(self.script)], env={**self.env, **env}, capture_output=True, text=True, timeout=20)
        calls = [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []
        return result, calls

    def test_default_is_read_only_and_prints_v3_plan(self):
        result, calls = self.run_script(STUB_MISSING_ALIAS='1')
        self.assertEqual(result.returncode, 0, result.stderr)
        forbidden = [('keys', 'generate'), ('keys', 'fund'), ('contract', 'build'), ('contract', 'deploy'), ('contract', 'invoke')]
        self.assertFalse(any(tuple(call[1:3]) in forbidden for call in calls), calls)
        self.assertFalse(any(call[0] == 'cargo' and call[1:2] == ['test'] for call in calls), calls)
        self.assertIn('NEXT_PUBLIC_AGYION_CONTRACT_ID=', result.stdout)
        self.assertIn('DRY_RUN=0', result.stdout)

    def test_rejects_mainnet_before_any_cli_call(self):
        result, calls = self.run_script(NETWORK='mainnet')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls, [])

    def test_rejects_network_environment_override(self):
        result, calls = self.run_script(STELLAR_NETWORK='mainnet')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls, [])

    def test_rejects_unknown_dry_run_value(self):
        result, calls = self.run_script(DRY_RUN='false')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls, [])

    def test_missing_custom_alias_is_never_created(self):
        result, calls = self.run_script(DRY_RUN='0', DEPLOYER_ALIAS='existing-operator', STUB_MISSING_ALIAS='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(call[1:3] in [['keys', 'generate'], ['keys', 'fund']] for call in calls), calls)

    def test_unreviewed_candidate_never_reaches_identity_changes_or_deployment(self):
        result, calls = self.run_script(DRY_RUN='0', STUB_CANDIDATE_V4='1', STUB_MISSING_ALIAS='1')
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertTrue(any(call[1:3] == ['contract', 'build'] for call in calls), calls)
        forbidden = [['keys', 'generate'], ['keys', 'fund'], ['contract', 'deploy'], ['contract', 'install'], ['contract', 'upload'], ['contract', 'invoke']]
        self.assertFalse(any(call[1:3] in forbidden for call in calls), calls)
        self.assertNotIn('NEXT_PUBLIC_AGYION_CONTRACT_ID=', result.stdout)
        self.assertNotIn('NEXT_PUBLIC_AGYION_WASM_HASH=', result.stdout)
        self.assertIn('separate reviewed release', result.stderr)

    def test_candidate_hash_cannot_be_authorized_through_environment(self):
        candidate_hash = hashlib.sha256(FIXTURE_WASM + bytes([0, 1, 0])).hexdigest()
        result, calls = self.run_script(DRY_RUN='0', STUB_CANDIDATE_V4='1',
                                       EXPECTED_WASM_HASH=candidate_hash,
                                       LEGACY_V3_WASM_HASH=candidate_hash,
                                       NEXT_PUBLIC_AGYION_WASM_HASH=candidate_hash)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(call[1:3] == ['contract', 'deploy'] for call in calls), calls)

    def test_production_allowlist_is_exact_reviewed_v3_releases(self):
        releases = json.loads((SCRIPT.parent.parent / 'deployments/public-testnet.json').read_text())
        reviewed = {entry['wasmHash'] for entry in [releases['active'], *releases['inactive']]
                    if entry['protocolVersion'] == 3}
        self.assertEqual(reviewed, {ACTIVE_V3_HASH, RENAMED_V3_HASH})
        self.assertEqual(set(re.findall(r'\b[0-9a-f]{64}\b', SCRIPT.read_text())), reviewed)

    def test_explicit_execution_uses_exact_wasm_pinned_network_and_readback(self):
        result, calls = self.run_script(DRY_RUN='0', DEPLOYER_ALIAS='existing-operator')
        self.assertEqual(result.returncode, 0, result.stderr)
        deploy = next(call for call in calls if call[1:3] == ['contract', 'deploy'])
        self.assertEqual(deploy[deploy.index('--wasm') + 1], str(self.wasm))
        invoke = next((call for call in calls if call[1:3] == ['contract', 'invoke']), None)
        self.assertIsNotNone(invoke, 'protocol_version readback is required')
        self.assertEqual(invoke[-2:], ['--', 'protocol_version'])
        self.assertEqual(invoke[invoke.index('--send') + 1], 'no')
        for call in [deploy, invoke]:
            self.assertEqual(call[call.index('--rpc-url') + 1], RPC)
            self.assertEqual(call[call.index('--network-passphrase') + 1], PASSPHRASE)
        self.assertFalse(any(call[1:3] in [['keys', 'generate'], ['keys', 'fund']] for call in calls), calls)
        self.assertIn(f'NEXT_PUBLIC_AGYION_CONTRACT_ID={CONTRACT}', result.stdout)
        self.assertIn('NEXT_PUBLIC_AGYION_MODE=soroban', result.stdout)
        self.assertFalse(any('issuer' in value or 'change-trust' in value or 'payment' in value for call in calls for value in call))

    def test_new_identity_is_dedicated_testnet_alias_only(self):
        result, calls = self.run_script(DRY_RUN='0', STUB_MISSING_ALIAS='1')
        self.assertEqual(result.returncode, 0, result.stderr)
        generate = next(call for call in calls if call[1:3] == ['keys', 'generate'])
        fund = next(call for call in calls if call[1:3] == ['keys', 'fund'])
        self.assertEqual(generate[3], 'agyion-testnet-deployer')
        self.assertEqual(fund[3], 'agyion-testnet-deployer')
        self.assertEqual(fund[fund.index('--rpc-url') + 1], RPC)
        self.assertNotIn('--overwrite', generate)
        self.assertNotIn('--as-secret', generate)

    def test_failed_protocol_readback_does_not_print_success_config(self):
        result, _ = self.run_script(DRY_RUN='0', STUB_PROTOCOL_VERSION='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn(f'NEXT_PUBLIC_AGYION_CONTRACT_ID={CONTRACT}', result.stdout)
        self.assertIn(CONTRACT, result.stdout + result.stderr)

    def test_published_pin_requires_identical_fetched_wasm(self):
        result, calls = self.run_script(DRY_RUN='0')
        self.assertEqual(result.returncode, 0, result.stderr)
        deploy = next(call for call in calls if call[1:3] == ['contract', 'deploy'])
        self.assertIn('--optimize=false', deploy, 'Deployment must preserve the tested bytes.')
        fetch = next((call for call in calls if call[1:3] == ['contract', 'fetch']), None)
        self.assertIsNotNone(fetch, 'The actual deployed code must be fetched, not just its version.')
        self.assertEqual(fetch[fetch.index('--id') + 1], CONTRACT)
        self.assertEqual(fetch[fetch.index('--rpc-url') + 1], RPC)
        import hashlib
        digest = hashlib.sha256(self.wasm.read_bytes()).hexdigest()
        self.assertIn(f'NEXT_PUBLIC_AGYION_WASM_HASH={digest}', result.stdout)

    def test_mismatched_deployed_code_never_emits_ready_configuration(self):
        result, _ = self.run_script(DRY_RUN='0', STUB_FETCH_WRONG='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn(f'NEXT_PUBLIC_AGYION_CONTRACT_ID={CONTRACT}', result.stdout)
        self.assertNotIn('NEXT_PUBLIC_AGYION_WASM_HASH=', result.stdout)

    def test_failed_code_readback_never_emits_ready_configuration(self):
        result, _ = self.run_script(DRY_RUN='0', STUB_FETCH_FAIL='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn(f'NEXT_PUBLIC_AGYION_CONTRACT_ID={CONTRACT}', result.stdout)
        self.assertNotIn('NEXT_PUBLIC_AGYION_WASM_HASH=', result.stdout)


if __name__ == '__main__':
    unittest.main(verbosity=2)
