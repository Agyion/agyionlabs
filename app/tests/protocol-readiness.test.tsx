// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SorobanAgyionClient } from '../app/lib/hakClient';
import { useProtocolReadiness } from '../app/lib/useProtocolReadiness';
import type { AgyionClient } from '../app/lib/hakClient';
afterEach(cleanup);
function client(result:()=>Promise<any>){const c=new SorobanAgyionClient({rpcUrl:'https://example.com',contractId:'C'+'A'.repeat(55),networkPassphrase:'test'});(c as any).bindings=async()=>({protocol_version:result});return c;}
it('distinguishes an actual version mismatch from an unavailable RPC',async()=>{
 expect(await client(async()=>({result:2})).protocolReadiness()).toBe('ready');
 expect(await client(async()=>({result:1})).protocolReadiness()).toBe('incompatible');
 expect(await client(async()=>{throw new Error('offline')}).protocolReadiness()).toBe('unavailable');
});
it('starts checking, permits retry and ignores a late result for a replaced client',async()=>{
 let resolve!:(v:any)=>void;
 const slow={protocolReadiness:()=>new Promise(r=>{resolve=r})} as AgyionClient;
 const check=vi.fn().mockResolvedValueOnce('unavailable').mockResolvedValue('ready');
 const next={protocolReadiness:check} as unknown as AgyionClient;
 const {result,rerender}=renderHook(({client})=>useProtocolReadiness(client),{initialProps:{client:slow}});
 expect(result.current.status).toBe('checking');rerender({client:next});await act(async()=>{});expect(result.current.status).toBe('unavailable');
 await act(async()=>{resolve('incompatible')});expect(result.current.status).toBe('unavailable');
 await act(async()=>{result.current.retry()});expect(result.current.status).toBe('ready');
});
it('classifies the observed missing protocol_version function diagnostic as incompatible',async()=>{
 const diagnostic='Transaction simulation failed: HostError: Error(WasmVm, MissingValue)\nDiagnostic Event: ["trying to invoke non-existent contract function", protocol_version]';
 expect(await client(async()=>{throw new Error(diagnostic)}).protocolReadiness()).toBe('incompatible');
});
it.each([
 'Transaction simulation failed: HostError: Error(WasmVm, MissingValue)',
 'Transaction simulation failed: HostError: Error(WasmVm, MissingValue)\nDiagnostic Event: ["trying to invoke non-existent contract function", get_fade] while checking protocol_version',
 'protocol_version: contract not found',
 'protocol_version: RPC timeout',
 'Failed to fetch',
 'HostError: Error(Storage, MissingValue)',
])('keeps unrelated or incomplete diagnostics unavailable: %s',async(message)=>{
 expect(await client(async()=>{throw new Error(message)}).protocolReadiness()).toBe('unavailable');
});
