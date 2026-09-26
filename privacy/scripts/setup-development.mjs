// Single-operator DEVELOPMENT setup only. Never substitute this for an
// independently contributed ceremony. Entropy is generated in-process and is
// neither supplied on a command line nor written to an artifact/log.
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { powersOfTau, curves } from 'snarkjs';
const actualCpus = os.cpus();
os.cpus = () => actualCpus.slice(0, 8); // Bound local worker pressure.
const directory = resolve(process.argv[2] || '../artifacts/privacy-v2/setup');
mkdirSync(directory, { recursive: true });
const raw = resolve(directory, 'development-0000.ptau');
const contributed = resolve(directory, 'development-0001.ptau');
const final = resolve(directory, 'development-final.ptau');
if ([raw, contributed, final].some(existsSync)) throw new Error('Refusing to overwrite setup artifacts');
const logger = { log: console.log, info: console.log, warn: console.warn, error: console.error, debug: () => {} };
const curve = await curves.getCurveFromName('bn128');
try {
  console.log('DEVELOPMENT ONLY: starting power18 phase1', new Date().toISOString());
  await powersOfTau.newAccumulator(curve, 18, raw, logger);
} finally { await curve.terminate(); }
await powersOfTau.contribute(raw, contributed, 'Agyion local development contribution', randomBytes(64).toString('hex'), logger);
if (!await powersOfTau.verify(contributed, logger)) throw new Error('Development phase1 verification failed');
console.log('Preparing phase2', new Date().toISOString());
await powersOfTau.preparePhase2(contributed, final, logger);
console.log('DEVELOPMENT setup prepared', final, new Date().toISOString());
await globalThis.curve_bn128?.terminate();
