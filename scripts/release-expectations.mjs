/** Pure validation of an explicitly selected public release verification target. */
export function releaseExpectations(env = {}) {
  const url = new URL(env.PUBLIC_BASE_URL || 'https://agyionlabs.dev');
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('PUBLIC_BASE_URL must be an HTTP(S) origin without credentials, path, query or fragment.');
  }
  const readiness = env.EXPECTED_PROTOCOL_READINESS || 'blocked';
  if (!['blocked', 'ready', 'incompatible', 'unavailable'].includes(readiness)) throw new Error('Invalid EXPECTED_PROTOCOL_READINESS.');
  const contractId = env.EXPECTED_HAK_CONTRACT_ID;
  const wasmHash = env.EXPECTED_HAK_WASM_HASH;
  if (readiness === 'ready' || contractId !== undefined || wasmHash !== undefined) {
    if (typeof contractId !== 'string' || !/^C[A-Z2-7]{55}$/.test(contractId) ||
        typeof wasmHash !== 'string' || !/^[a-f0-9]{64}$/.test(wasmHash)) {
      throw new Error('Pinned verification requires EXPECTED_HAK_CONTRACT_ID and EXPECTED_HAK_WASM_HASH; both are mandatory for ready.');
    }
  }
  return { base: url.origin, readiness, contractId, wasmHash };
}

export function readinessPattern(expected) {
  if (expected === 'blocked') return /^(?:incompatible|unavailable)$/;
  if (!['ready', 'incompatible', 'unavailable'].includes(expected)) throw new Error('Invalid expected readiness.');
  return new RegExp(`^${expected}$`);
}

export function assertPublishedKernelBundle(bundles, expected) {
  if (!expected.contractId) return null;
  const matching = bundles.filter(({ body }) => body.includes(expected.contractId) && body.includes(expected.wasmHash));
  if (matching.length === 0) throw new Error('Verified public application JavaScript does not contain the expected contract and WASM pins together.');
  return { contractId: expected.contractId, wasmHash: expected.wasmHash, matchedScripts: matching.map(({ route }) => route) };
}
