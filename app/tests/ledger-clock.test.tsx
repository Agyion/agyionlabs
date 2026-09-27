// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useLedger } from '../app/lib/useLedger';
import type { AgyionClient } from '../app/lib/agyionClient';
afterEach(()=>{cleanup();vi.useRealTimers()});
it('never invents ledgers between polls and clears stale data after RPC failure',async()=>{
 vi.useFakeTimers();const currentLedger=vi.fn().mockResolvedValueOnce(123).mockRejectedValue(new Error('offline'));
 const client={currentLedger} as unknown as AgyionClient;
 const {result}=renderHook(()=>useLedger(client,5000));await act(async()=>{});expect(result.current).toBe(123);
 await act(async()=>{await vi.advanceTimersByTimeAsync(4000)});expect(result.current).toBe(123);
 await act(async()=>{await vi.advanceTimersByTimeAsync(1000)});expect(result.current).toBeNull();
});
it('does not retain the old client ledger across a switch',async()=>{
 const first={currentLedger:async()=>123} as AgyionClient;
 const next={currentLedger:()=>new Promise<number>(()=>{})} as AgyionClient;
 const {result,rerender}=renderHook(({client})=>useLedger(client),{initialProps:{client:first}});await act(async()=>{});expect(result.current).toBe(123);rerender({client:next});expect(result.current).toBeNull();
});

it('keeps verified display height while marking writes stale, then recovers',async()=>{
 const {useLedgerStatus}=await import('../app/lib/useLedger');
 vi.useFakeTimers();const currentLedger=vi.fn().mockResolvedValueOnce(123).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(124);
 const client={currentLedger} as unknown as AgyionClient;
 const {result}=renderHook(()=>useLedgerStatus(client,5000));await act(async()=>{});
 expect(result.current).toMatchObject({ledger:123,fresh:true,status:'fresh'});
 await act(async()=>{await vi.advanceTimersByTimeAsync(5000)});expect(result.current).toMatchObject({ledger:123,fresh:false,status:'stale'});
 await act(async()=>{result.current.refresh()});expect(result.current).toMatchObject({ledger:124,fresh:true,status:'fresh'});
});

it('stops hidden polling and visibility refresh, retains height, then verifies on return',async()=>{
 const {createElement}=await import('react');
 const {InstrumentActivity}=await import('../app/lib/instrumentActivity');
 const {useLedgerStatus}=await import('../app/lib/useLedger');
 vi.useFakeTimers();let active=true;let finish!:(ledger:number)=>void;
 const currentLedger=vi.fn().mockResolvedValueOnce(123).mockImplementation(()=>new Promise<number>(resolve=>{finish=resolve}));
 const client={currentLedger} as unknown as AgyionClient;
 const {result,rerender}=renderHook(()=>useLedgerStatus(client,5000),{wrapper:({children})=>createElement(InstrumentActivity.Provider,{value:active},children)});
 await act(async()=>{});expect(result.current).toMatchObject({ledger:123,fresh:true});
 active=false;rerender();expect(result.current).toMatchObject({ledger:123,fresh:false,status:'stale'});
 await act(async()=>{document.dispatchEvent(new Event('visibilitychange'));result.current.refresh();await vi.advanceTimersByTimeAsync(15000)});
 expect(currentLedger).toHaveBeenCalledTimes(1);expect(result.current.ledger).toBe(123);
 active=true;rerender();expect(currentLedger).toHaveBeenCalledTimes(2);expect(result.current).toMatchObject({ledger:123,fresh:false});
 await act(async()=>{finish(128)});expect(result.current).toMatchObject({ledger:128,fresh:true,status:'fresh'});
});

it('does not accept a poll result after its instrument becomes inactive',async()=>{
 const {createElement}=await import('react');const {InstrumentActivity}=await import('../app/lib/instrumentActivity');const {useLedgerStatus}=await import('../app/lib/useLedger');
 let active=true;let finish!:(ledger:number)=>void;
 const client={currentLedger:()=>new Promise<number>(resolve=>{finish=resolve})} as unknown as AgyionClient;
 const {result,rerender}=renderHook(()=>useLedgerStatus(client),{wrapper:({children})=>createElement(InstrumentActivity.Provider,{value:active},children)});
 active=false;rerender();await act(async()=>{finish(999)});expect(result.current).toMatchObject({ledger:null,fresh:false});
});
