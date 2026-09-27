// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prefix = '@StellarWalletsKit/';
const address = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

beforeEach(() => { localStorage.clear(); vi.resetModules(); });
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

describe('selected wallet cached public metadata boundary', () => {
  it.each(['{bad-json', 'null', '{}', '42', '[null]', '[{"publicKey":1}]', ' '.repeat(65537)].map((raw, index) => ({ raw, index })))(
    'recovers invalid cached path array case $index without touching application recovery data', async ({ raw }) => {
      localStorage.setItem(prefix + 'hardwareWalletPaths', raw);
      localStorage.setItem(prefix + 'wcSessionPaths', raw);
      localStorage.setItem('agyion.private-pool.public-attempts.v2', 'unrelated recovery sentinel');
      const state = await import('../vendor/stellar-wallets-kit/esm/state/values.js');
      expect(state.hardwareWalletPaths.value).toEqual([]);
      expect(state.wcSessionPaths.value).toEqual([]);
      expect(localStorage.getItem('agyion.private-pool.public-attempts.v2')).toBe('unrelated recovery sentinel');
    },
  );

  it('preserves well-formed cache entries and rejects malformed or excessive rows', async () => {
    const hardware = [{ publicKey: address, index: 0 }];
    const sessions = [{ publicKey: address, topic: 'public-session-topic' }];
    localStorage.setItem(prefix + 'hardwareWalletPaths', JSON.stringify(hardware));
    localStorage.setItem(prefix + 'wcSessionPaths', JSON.stringify(sessions));
    let state = await import('../vendor/stellar-wallets-kit/esm/state/values.js');
    expect(state.hardwareWalletPaths.value).toEqual(hardware);
    expect(state.wcSessionPaths.value).toEqual(sessions);
    for (const [key, rows] of [
      ['hardwareWalletPaths', [{ publicKey: address, index: -1 }]],
      ['hardwareWalletPaths', [{ publicKey: address, index: 2 ** 31 }]],
      ['wcSessionPaths', [{ publicKey: address, topic: '' }]],
      ['wcSessionPaths', [{ publicKey: address, topic: 'x'.repeat(257) }]],
      ['wcSessionPaths', Array.from({ length: 129 }, () => sessions[0])],
    ] as const) {
      localStorage.setItem(prefix + key, JSON.stringify(rows));
      vi.resetModules();
      state = await import('../vendor/stellar-wallets-kit/esm/state/values.js');
      expect(state[key].value).toEqual([]);
    }
  });

  it.each(['{}', 'null', '[null]', '[1]', ' '.repeat(16385)].map((raw, index) => ({ raw, index })))(
    'malformed provider ordering case $index does not prevent the chooser from opening', async ({ raw }) => {
      localStorage.setItem(prefix + 'usedWalletsIds', raw);
      const { StellarWalletsKit } = await import('@agyion/stellar-wallets-kit/sdk');
      const { Networks, ModuleType } = await import('@agyion/stellar-wallets-kit/types');
      const getAddress = vi.fn();
      StellarWalletsKit.init({ network: Networks.TESTNET, modules: [{
        productId: 'freighter', productName: 'Local test wallet', productIcon: '',
        productUrl: 'https://example.test', moduleType: ModuleType.HOT_WALLET,
        isAvailable: async () => true, getAddress,
        getNetwork: vi.fn(), signTransaction: vi.fn(), signAuthEntry: vi.fn(), signMessage: vi.fn(),
      }] });
      const result = StellarWalletsKit.authModal();
      const rejection = expect(result).rejects.toMatchObject({ message: 'The user closed the modal.' });
      await vi.waitFor(() => expect(document.querySelector('li')?.textContent).toContain('Local test wallet'));
      const buttons = document.querySelectorAll<HTMLButtonElement>('header button');
      buttons[buttons.length - 1].click();
      await rejection;
      expect(getAddress).not.toHaveBeenCalled();
      await StellarWalletsKit.disconnect();
    },
  );
});
