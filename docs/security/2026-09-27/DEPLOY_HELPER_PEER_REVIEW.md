# Testnet deployment helper peer review, 27 September 2026

This local peer check read the complete deployment helper and its eleven-test
regression harness after the root reviewer's edits. It made no source changes,
created no identity and ran no deployment or live transaction.

| Source | Inclusive lines | SHA256 |
| --- | --- | --- |
| `scripts/deploy_testnet.sh` | 1–141 | `26d36c8d8b4724a495210ec5f4c9141225e55f83e2bdee6284fa9c0c17eb0615` |
| `scripts/test_deploy_testnet.py` | 1–182 | `4484fee80b2a33921d6df6c1838d41d17297bd77cc405e3f689dce110a809a02` |

No blocking defect was found in the inspected deployment/readback sequence:

* The default is a read-only plan. Execution validates the fixed Testnet network,
  dry-run setting and inherited network environment before issuing CLI commands.
* The dedicated Testnet identity is created only when needed. A missing custom
  alias is not silently replaced, and an existing alias is not overwritten.
* A locked native test run precedes the build and deployment. Deployment selects
  `--optimize=false` so the local artifact being hashed is the bytecode submitted.
* The helper fetches deployed code and requires its hash to match that local
  artifact, then requires protocol version 3 before emitting the actual contract
  address and expected WASM hash for application configuration. A failed fetch,
  mismatched hash or failed version readback cannot emit ready configuration.

Fresh `python3 scripts/test_deploy_testnet.py` passed all eleven tests. The tests
use a synthetic local CLI to cover successful ordering and refusal paths; they
do not demonstrate actual network inclusion. `bash -n scripts/deploy_testnet.sh`
also passed. Test output is retained at
`artifacts/security/2026-09-27-compatibility/private-pool/deployment-helper-peer-tests.log`.

The helper's built-in test is the default native suite, not the full exact-WASM
proof regression. Before an actual deployment, the release owner still needs the
final-source WASM suite, exact artifact provenance and application/configuration
checks from the broader review. This check does not select or repin a release,
claim that the currently published app is updated, or replace live post-deploy
readback.
