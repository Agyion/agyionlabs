import {afterEach,expect,it,vi} from 'vitest';
import {StrKey} from '@stellar/stellar-sdk';
const pins={schema:'agyion-public-fade-market-v1',network:'testnet',contract:StrKey.encodeContract(Buffer.alloc(32,9)),wasmHash:'ab'.repeat(32),rpcUrl:'https://soroban-testnet.stellar.org',catalogUrl:'https://market.test',assets:[StrKey.encodeContract(Buffer.alloc(32,10))]};
afterEach(()=>{vi.resetModules();vi.doUnmock('../client/pins.ts');});
it('unconfigured build pins fail closed; copied or invented release objects cannot authorize clients',async()=>{
 vi.doMock('../client/pins.ts',()=>({MARKET_RELEASE_PINS:{...pins,contract:'',wasmHash:'',catalogUrl:'',assets:[]}}));const {getMarketRelease,assertMarketRelease}=await import('../client/release.ts');expect(()=>getMarketRelease()).toThrow();expect(()=>assertMarketRelease({...pins})).toThrow('PINNED_MARKET_RELEASE_REQUIRED');
});
it('accepts only the actual module-scoped release and immutable testnet build pins',async()=>{
 vi.doMock('../client/pins.ts',()=>({MARKET_RELEASE_PINS:pins}));const {getMarketRelease,assertMarketRelease}=await import('../client/release.ts');
 const release=getMarketRelease();expect(getMarketRelease()).toBe(release);expect(()=>assertMarketRelease(release)).not.toThrow();expect(()=>assertMarketRelease({...release})).toThrow();expect(Object.isFrozen(release.assets)).toBe(true);
});
it('rejects build pin errors before any network request',async()=>{
 for(const delta of [{network:'mainnet'},{rpcUrl:'https://attacker.test'},{catalogUrl:'https://market.test/path'},{wasmHash:''},{assets:[]},{contract:pins.assets[0]+'x'}]){
  vi.resetModules();vi.doMock('../client/pins.ts',()=>({MARKET_RELEASE_PINS:{...pins,...delta}}));const {getMarketRelease}=await import('../client/release.ts');expect(()=>getMarketRelease()).toThrow();
 }
});
