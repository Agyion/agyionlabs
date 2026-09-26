export class PrivacyValidationError extends Error {
  constructor(code, path) {
    super(`${code} at ${path}`);
    this.name = 'PrivacyValidationError';
    this.code = code;
  }
}

export function fail(code, path) { throw new PrivacyValidationError(code, path); }

// Snapshot own data properties before reading values; never invoke accessors.
export function record(value, keys, path) {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('OBJECT_REQUIRED', path);
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || actual.some((key) => typeof key !== 'string' || !keys.includes(key))) fail('EXACT_FIELDS_REQUIRED', path);
  const result = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) fail('DATA_PROPERTY_REQUIRED', path);
    result[key] = descriptor.value;
  }
  return result;
}

export function list(value, max, path) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max) fail('BOUNDED_ARRAY_REQUIRED', path);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1) fail('DENSE_ARRAY_REQUIRED', path);
  return Array.from({ length: value.length }, (_, index) => {
    const item = Object.getOwnPropertyDescriptor(value, String(index));
    if (!item || !('value' in item) || !item.enumerable) fail('DATA_PROPERTY_REQUIRED', path);
    return item.value;
  });
}

export function uint(value, bits, path, min = 0n) {
  const maxDigits = Math.ceil(bits * Math.LOG10E * Math.LN2);
  if (typeof value !== 'string' || value.length > maxDigits || !/^(0|[1-9][0-9]*)$/.test(value)) fail('CANONICAL_UINT_REQUIRED', path);
  const n = BigInt(value);
  if (n < min || n >= (1n << BigInt(bits))) fail('UINT_OUT_OF_RANGE', path);
  return value;
}

export function hex(value, bytes, path, nonzero = false) {
  if (typeof value !== 'string' || value.length !== bytes * 2 || !/^[0-9a-f]+$/.test(value)) fail('CANONICAL_HEX_REQUIRED', path);
  if (nonzero && /^0+$/.test(value)) fail('NONZERO_REQUIRED', path);
  return value;
}

const FR_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export function field(value, path, nonzero = false) {
  hex(value, 32, path, nonzero);
  if (BigInt(`0x${value}`) >= FR_MODULUS) fail('NONCANONICAL_FIELD', path);
  return value;
}

export function domain(value, path) {
  const v = record(value, ['networkId', 'contractId'], path);
  return { networkId: hex(v.networkId, 32, path, true), contractId: hex(v.contractId, 32, path, true) };
}

export function interval(value, now, maxWindow, path) {
  const v = record(value, ['from', 'until'], path);
  const from = uint(v.from, 32, path); const until = uint(v.until, 32, path);
  if (BigInt(from) > BigInt(until) || BigInt(until) - BigInt(from) > maxWindow) fail('INVALID_LEDGER_INTERVAL', path);
  if (BigInt(now) < BigInt(from) || BigInt(now) > BigInt(until)) fail('NOT_CURRENT', path);
  return { from, until };
}

export function equal(actual, expected, path) {
  if (actual !== expected) fail('BINDING_MISMATCH', path);
}

export function bindDomain(actual, expected) {
  equal(actual.networkId, expected.networkId, 'domain.networkId');
  equal(actual.contractId, expected.contractId, 'domain.contractId');
}

export function freeze(value) {
  for (const item of Object.values(value)) if (item && typeof item === 'object') freeze(item);
  return Object.freeze(value);
}
