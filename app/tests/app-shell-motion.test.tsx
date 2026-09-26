// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';

const route = vi.hoisted(() => ({ search: '', push: vi.fn(), address: null as string | null }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: route.push }), useSearchParams: () => new URLSearchParams(route.search) }));
vi.mock('../app/lib/useWallet', () => ({ useWallet: () => ({ address: route.address }) }));
vi.mock('../app/lib/config', () => ({ IS_MOCK: true }));
vi.mock('../app/lib/client', () => ({ getClient: () => null }));
vi.mock('../app/components/app/ProtocolStatus', () => ({ default: () => null }));
vi.mock('../app/components/app/TransactionActivity', () => ({ default: () => null }));
vi.mock('../app/components/app/WalletBar', () => ({ default: () => null }));
vi.mock('../app/components/app/FadePanel', () => ({ default: () => <input aria-label="Draft amount" defaultValue="100" /> }));
vi.mock('../app/components/app/PodPanel', () => ({ default: () => null }));
vi.mock('../app/components/app/TriggerPanel', () => ({ default: () => null }));
vi.mock('../app/components/app/EnvoyPanel', () => ({ default: () => null }));
vi.mock('../app/components/app/RampPanel', () => ({ default: () => null }));
vi.mock('../app/components/app/LedgerPanel', () => ({ default: () => null }));
vi.mock('../app/components/app/OrbitalBackdrop', () => ({ default: ({ reduced, panelOpen, exploreRequest, onSelect }: { reduced: boolean; panelOpen: boolean; exploreRequest: number; onSelect: (id: string) => void }) => <div data-testid="backdrop" data-reduced={reduced} data-open={panelOpen} data-explore={exploreRequest}><button onClick={() => onSelect('pod')}>Select Pod module</button></div> }));

import AppShell from '../app/components/app/AppShell';

let reduced = true;
const listeners = new Set<() => void>();
let root: Root | undefined;
beforeEach(() => {
  reduced = true;
  route.search = '';
  route.address = null;
  route.push.mockReset();
  listeners.clear();
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({
    get matches() { return reduced; },
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
    addListener: (listener: () => void) => listeners.add(listener),
    removeListener: (listener: () => void) => listeners.delete(listener),
  }) });
});
afterEach(() => {
  if (root) act(() => root?.unmount());
  root = undefined;
  cleanup();
  document.body.replaceChildren();
});
function setReduced(value: boolean) {
  act(() => { reduced = value; listeners.forEach((listener) => listener()); });
}

describe('AppShell motion and instrument interaction', () => {
  it('hydrates without a motion button and applies the operating system preference', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    container.innerHTML = renderToString(<AppShell />);
    expect(container.textContent).not.toContain('Pause motion');
    expect(container.textContent).not.toContain('Motion reduced');
    const recoverableErrors: unknown[] = [];
    await act(async () => {
      root = hydrateRoot(container, <AppShell />, { onRecoverableError: (error) => recoverableErrors.push(error) });
    });
    expect(recoverableErrors).toEqual([]);
    expect(screen.queryByRole('button', { name: /motion/i })).toBeNull();
    expect(screen.getByTestId('backdrop').getAttribute('data-reduced')).toBe('true');
  });

  it('reacts to motion preference changes without exposing an extra control', () => {
    reduced = false;
    const view = render(<AppShell />);
    setReduced(true);
    expect(screen.getByTestId('backdrop').getAttribute('data-reduced')).toBe('true');
    setReduced(false);
    expect(screen.getByTestId('backdrop').getAttribute('data-reduced')).toBe('false');
    expect(screen.queryByRole('button', { name: /motion/i })).toBeNull();
    view.unmount();
    expect(listeners.size).toBe(0);
  });

  it('opens the current instrument and preserves its draft when returning to space', () => {
    render(<AppShell />);
    expect(screen.getByTestId('backdrop').getAttribute('data-open')).toBe('false');
    fireEvent.click(screen.getByRole('tab', { name: /Fade/ }));
    const amount = screen.getByRole('textbox', { name: 'Draft amount' }) as HTMLInputElement;
    fireEvent.change(amount, { target: { value: '450' } });
    expect(screen.getByTestId('backdrop').getAttribute('data-open')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Close instrument' }));
    expect(screen.getByTestId('backdrop').getAttribute('data-open')).toBe('false');
    fireEvent.click(screen.getByRole('tab', { name: /Fade/ }));
    expect((screen.getByRole('textbox', { name: 'Draft amount' }) as HTMLInputElement).value).toBe('450');
  });

  it('retains an unfinished draft across instrument switches, but clears it on account change', () => {
    route.search = 'tab=fade';
    const view = render(<AppShell />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Draft amount' }), { target: { value: '450' } });
    route.search = 'tab=pod';
    view.rerender(<AppShell />);
    expect(screen.queryByRole('textbox', { name: 'Draft amount' })).toBeNull();
    route.search = 'tab=fade';
    view.rerender(<AppShell />);
    expect((screen.getByRole('textbox', { name: 'Draft amount' }) as HTMLInputElement).value).toBe('450');
    route.address = 'first-wallet';
    view.rerender(<AppShell />);
    expect((screen.getByRole('textbox', { name: 'Draft amount' }) as HTMLInputElement).value).toBe('450');
    route.address = 'second-wallet';
    view.rerender(<AppShell />);
    expect((screen.getByRole('textbox', { name: 'Draft amount' }) as HTMLInputElement).value).toBe('100');
  });

  it('opens help in place and Escape closes help before the instrument', () => {
    route.search = 'tab=fade';
    render(<AppShell />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Draft amount' }), { target: { value: '450' } });
    fireEvent.click(screen.getByRole('button', { name: 'About Fade' }));
    expect(screen.getByRole('region', { name: 'How Fade works' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'How Fade works' })).toBeNull();
    expect(screen.getByTestId('backdrop').getAttribute('data-open')).toBe('true');
    expect((screen.getByRole('textbox', { name: 'Draft amount' }) as HTMLInputElement).value).toBe('450');
  });

  it('opens direct instrument links and returns focus to their dock on Escape', () => {
    route.search = 'tab=pod';
    render(<AppShell />);
    expect(screen.getByRole('tabpanel').id).toBe('panel-pod');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('backdrop').getAttribute('data-open')).toBe('false');
    expect(document.activeElement?.id).toBe('tab-pod');
  });

  it('routes picked 3D modules to the same instrument and connects Instruments to explore', () => {
    render(<AppShell />);
    fireEvent.click(screen.getByRole('button', { name: 'Select Pod module' }));
    expect(route.push).toHaveBeenCalledWith('/app/?tab=pod', { scroll: false });
    expect(screen.getByTestId('backdrop').getAttribute('data-open')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /Instruments/ }));
    expect(screen.getByTestId('backdrop').getAttribute('data-open')).toBe('false');
    expect(screen.getByTestId('backdrop').getAttribute('data-explore')).toBe('1');
  });

  it('previews a focused dock bay without navigating or opening its form', () => {
    const previews: Array<string | null> = [];
    const observe = (event: Event) => previews.push((event as CustomEvent<{ id: string | null }>).detail.id);
    window.addEventListener('agyion:instrument-preview', observe);
    try {
      render(<AppShell />);
      const pod = screen.getByRole('tab', { name: /Pod/ });
      fireEvent.focus(pod);
      expect(previews).toEqual(['pod']);
      expect(route.push).not.toHaveBeenCalled();
      expect(screen.getByTestId('backdrop').getAttribute('data-open')).toBe('false');
      expect(screen.getByRole('tab', { name: /Fade/ }).getAttribute('aria-selected')).toBe('true');
      fireEvent.blur(pod);
      expect(previews).toEqual(['pod', null]);
    } finally {
      window.removeEventListener('agyion:instrument-preview', observe);
    }
  });
});
