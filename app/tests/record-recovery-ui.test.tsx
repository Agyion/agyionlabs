// @vitest-environment jsdom
import React, { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RecordLoader } from '../app/components/app/panelControls';
import { FilledButton, GhostButton, TransactionAvailability } from '../app/components/ui';

afterEach(() => { cleanup(); window.history.replaceState({}, '', '/'); });

describe('Read-only record recovery', () => {
  it('loads a valid matching URL reference, including Strict Mode replay', async () => {
    window.history.replaceState({}, '', '/app/?tab=pod&ref=42');
    const loaded = vi.fn();
    render(<StrictMode><RecordLoader name="Pod" load={async id => ({ id })} onLoaded={loaded} /></StrictMode>);
    await waitFor(() => expect(loaded).toHaveBeenCalledWith({ id: 42n }));
    expect(screen.getByRole('textbox').getAttribute('value')).toBe('42');
  });

  it('ignores other instruments and invalid IDs, and discards outdated read responses', async () => {
    const resolves: Array<(record: { id: bigint }) => void> = [];
    const load = vi.fn((_id: bigint) => new Promise<{ id: bigint }>(resolve => resolves.push(resolve)));
    const loaded = vi.fn();
    const view = render(<RecordLoader name="Pod" load={load} onLoaded={loaded} />);
    const open = (tab: string, id: string) => act(() => { window.dispatchEvent(new CustomEvent('agyion:open-record', { detail: { tab, id } })); });
    open('fade', '1'); open('pod', '-1'); open('pod', '18446744073709551616');
    expect(load).not.toHaveBeenCalled();
    open('pod', '3'); open('pod', '4');
    await act(async () => { resolves[0]({ id: 3n }); resolves[1]({ id: 4n }); });
    expect(loaded.mock.calls).toEqual([[{ id: 4n }]]);
    open('pod', '5'); view.unmount();
    await act(async () => { resolves[2]({ id: 5n }); });
    expect(loaded).toHaveBeenCalledTimes(1);
  });
});

it('blocks marked transactions while keeping preparation and reads available', () => {
  const write = vi.fn(); const read = vi.fn();
  const view = render(<TransactionAvailability.Provider value={false}><FilledButton transaction onClick={write}>Submit</FilledButton><GhostButton onClick={read}>Prepare secret</GhostButton></TransactionAvailability.Provider>);
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
  fireEvent.click(screen.getByRole('button', { name: 'Prepare secret' }));
  expect(write).not.toHaveBeenCalled(); expect(read).toHaveBeenCalledOnce();
  view.rerender(<TransactionAvailability.Provider value><FilledButton transaction onClick={write}>Submit</FilledButton></TransactionAvailability.Provider>);
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
  expect(write).toHaveBeenCalledOnce();
});
