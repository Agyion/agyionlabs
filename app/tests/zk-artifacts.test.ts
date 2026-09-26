import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decToBe32, encodeG1, encodeG2, encodeProof, encodePublicInputs, encodeVk, loadZkArtifacts } from '../lib/zk';
import type { SnarkjsProof, SnarkjsVk } from '../lib/zk';

const proof = JSON.parse(readFileSync(new URL('../public/zk/proof.json', import.meta.url), 'utf8'));
const vk = JSON.parse(readFileSync(new URL('../public/zk/vk.json', import.meta.url), 'utf8'));
const publicSignals = JSON.parse(readFileSync(new URL('../public/zk/public.json', import.meta.url), 'utf8'));
const scalarOrder = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const baseOrder = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
afterEach(() => vi.unstubAllGlobals());

describe('canonical standalone preimage artifact encoding', () => {
  it('preserves the committed verification key encoding pinned by the contract', () => {
    const encoded = encodeVk(vk);
    const bytes = Buffer.concat([encoded.alphaG1, encoded.betaG2, encoded.gammaG2, encoded.deltaG2, ...encoded.ic]);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('3966012757c54284dcf07c3b2d02a9c2c2a136d04e470b8bda75f4d3e84a905c');
    expect(encodeProof(proof)).toHaveLength(256);
    expect(encodePublicInputs(publicSignals)[0]).toHaveLength(32);
  });

  it.each(['-1', '+1', '01', ' 1', '1 ', '0x01', '1e3', '', '1'.repeat(100)])('rejects a noncanonical scalar decimal', value => {
    expect(() => decToBe32(value)).toThrow();
  });

  it('distinguishes the scalar field from the coordinate field without modular reduction', () => {
    expect(decToBe32((scalarOrder - 1n).toString()).toString('hex')).toBe((scalarOrder - 1n).toString(16).padStart(64, '0'));
    expect(() => encodePublicInputs([scalarOrder.toString()])).toThrow();
    expect(() => decToBe32((1n << 255n).toString())).toThrow();
    // This exercises coordinate encoding only; curve membership is the host's job.
    expect(encodeG1([scalarOrder.toString(), '2', '1']).subarray(0, 32).toString('hex')).toBe(scalarOrder.toString(16).padStart(64, '0'));
    expect(() => encodeG1([baseOrder.toString(), '2', '1'])).toThrow();
  });

  it.each([['1', '2'], ['1', '2', '2'], ['1', '2', '1', '0']].map(point => ({ point })))('never silently discards a non-affine or malformed G1 coordinate', ({ point }) => {
    expect(() => encodeG1(point as [string, string, string])).toThrow();
  });

  it.each([
    [['1', '2'], ['3', '4']],
    [['1', '2'], ['3', '4'], ['2', '0']],
    [['1', '2'], ['3', '4'], ['1', '1']],
    [['1', '2', '3'], ['3', '4'], ['1', '0']],
  ].map(point => ({ point })))('never silently discards a non-affine or malformed G2 coordinate', ({ point }) => {
    expect(() => encodeG2(point as SnarkjsProof['pi_b'])).toThrow();
  });

  it('rejects other proof protocols and curves instead of reinterpreting them', () => {
    expect(() => encodeProof({ ...proof, protocol: 'plonk' })).toThrow();
    expect(() => encodeProof({ ...proof, curve: 'bls12381' })).toThrow();
  });

  it('requires exactly the one public input of the preimage circuit', () => {
    expect(() => encodePublicInputs([])).toThrow();
    expect(() => encodePublicInputs(['1', '2'])).toThrow();
    expect(() => encodeVk({ ...vk, nPublic: 2 } as SnarkjsVk)).toThrow();
    expect(() => encodeVk({ ...vk, IC: [vk.IC[0]] } as SnarkjsVk)).toThrow();
  });
});

describe('artifact response validation', () => {
  const mockArtifacts = (overrides: Record<string, unknown> = {}, status = 200) => {
    const artifacts: Record<string, unknown> = { 'vk.json': vk, 'proof.json': proof, 'public.json': publicSignals, ...overrides };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(artifacts[url.split('/').at(-1)!]), { status, headers: { 'Content-Type': 'application/json' } })));
  };

  it('accepts the committed artifacts after validating their encoding', async () => {
    mockArtifacts();
    await expect(loadZkArtifacts()).resolves.toEqual({ vk, proof, publicSignals });
  });

  it('rejects an unsuccessful HTTP response even when it contains valid-looking JSON', async () => {
    mockArtifacts({}, 404);
    await expect(loadZkArtifacts()).rejects.toThrow();
  });

  it.each([
    { 'proof.json': null },
    { 'proof.json': { ...proof, pi_a: ['1', '2', '0'] } },
    { 'vk.json': { ...vk, nPublic: 0 } },
    { 'vk.json': { ...vk, protocol: 'plonk' } },
    { 'public.json': { value: '1' } },
    { 'public.json': [scalarOrder.toString()] },
  ])('rejects malformed artifact responses before returning them', async overrides => {
    mockArtifacts(overrides);
    await expect(loadZkArtifacts()).rejects.toThrow();
  });
});
