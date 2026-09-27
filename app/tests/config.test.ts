import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('kernel mode configuration', () => {
  it.each([
    [undefined, 'mock', true],
    ['mock', 'mock', true],
    ['soroban', 'soroban', false],
  ] as const)('accepts %j as %s mode', async (configured, expected, isMock) => {
    vi.stubEnv('NEXT_PUBLIC_AGYION_MODE', configured);

    const { CONFIG, IS_MOCK } = await import('../app/lib/config');

    expect(CONFIG.mode).toBe(expected);
    expect(IS_MOCK).toBe(isMock);
  });

  it.each(['', ' ', '\t\n', 'MOCK', 'Soroban', ' mock', 'soroban ', 'unknown'])(
    'rejects invalid mode %j before it can select a chain client',
    async (configured) => {
      vi.stubEnv('NEXT_PUBLIC_AGYION_MODE', configured);

      await expect(import('../app/lib/config')).rejects.toThrow(
        /NEXT_PUBLIC_AGYION_MODE.*mock.*soroban/,
      );
    },
  );
});
