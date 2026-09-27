import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('invalid or empty QA selections fail before launching a browser or writing a success report', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'agyion-qa-selection-'));
  try {
    const cases = [
      ['scripts/verify-product-pages.mjs', { QA_ROUTES: ',,' }, /Invalid QA_ROUTES/],
      ['scripts/verify-instrument-journeys.mjs', { JOURNEY_CASES: 'unknown', JOURNEY_SCOPE: 'matrix' }, /unknown or empty case/],
      ['scripts/verify-instrument-journeys.mjs', { JOURNEY_CASES: 'landing-pod', JOURNEY_SCOPE: 'matrix' }, /selects no cases/],
    ];
    for (const [script, selection, message] of cases) {
      const output = path.join(temp, path.basename(script));
      const result = spawnSync(process.execPath, [script], {
        cwd: new URL('../../', import.meta.url),
        env: { ...process.env, ...selection, QA_OUTPUT_DIR: output, JOURNEY_OUTPUT: output },
        encoding: 'utf8', timeout: 10000,
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      assert.match(result.stderr, message);
      assert.equal(existsSync(output), false);
    }
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
