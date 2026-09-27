import {Networks,hash} from '@stellar/stellar-sdk';
import {Buffer} from 'buffer';
import {MARKET_RELEASE_PINS} from './pins.ts';
import {address,exact,hex32,requireValue,TESTNET_NETWORK_ID} from '../shared/codec.ts';
export interface MarketRelease {
 readonly schema:'agyion-public-fade-market-v1';readonly releaseId:string;readonly networkId:string;
 readonly networkPassphrase:typeof Networks.TESTNET;readonly contract:string;readonly wasmHash:string;
 readonly rpcUrl:string;readonly catalogUrl:string;readonly assets:readonly string[];
}
const branded=new WeakSet<object>();let cached:MarketRelease|undefined;
export function getMarketRelease():MarketRelease {
 if(cached)return cached;
 const v=exact(MARKET_RELEASE_PINS,['schema','network','contract','wasmHash','rpcUrl','catalogUrl','assets']);
 requireValue(v.schema==='agyion-public-fade-market-v1'&&v.network==='testnet','MARKET_TESTNET_RELEASE_REQUIRED');
 const contract=address(v.contract,true),wasmHash=hex32(v.wasmHash);requireValue(wasmHash!=='00'.repeat(32),'MARKET_RELEASE_UNAVAILABLE');
 // RPC provider and catalog origin are immutable reviewed build inputs, not caller options.
 requireValue(v.rpcUrl==='https://soroban-testnet.stellar.org','MARKET_RPC_PIN_REQUIRED');
 requireValue(typeof v.catalogUrl==='string','MARKET_CATALOG_PIN_REQUIRED');const url=new URL(v.catalogUrl);
 requireValue(url.protocol==='https:'&&url.origin===v.catalogUrl&&!url.username&&!url.password,'MARKET_CATALOG_PIN_REQUIRED');
 requireValue(Array.isArray(v.assets)&&v.assets.length>0&&v.assets.length<=4,'MARKET_ASSET_PIN_REQUIRED');
 const assets=Object.freeze(v.assets.map(a=>address(a,true)));requireValue(new Set(assets).size===assets.length,'MARKET_ASSET_PIN_REQUIRED');
 const pinned={schema:'agyion-public-fade-market-v1' as const,networkId:TESTNET_NETWORK_ID,networkPassphrase:Networks.TESTNET as typeof Networks.TESTNET,contract,wasmHash,rpcUrl:v.rpcUrl,catalogUrl:url.origin,assets};
 const release:MarketRelease=Object.freeze({...pinned,releaseId:hash(Buffer.from(JSON.stringify(pinned))).toString('hex')});branded.add(release);cached=release;return release;
}
export function assertMarketRelease(value:unknown):asserts value is MarketRelease {
 requireValue(value!==null&&typeof value==='object'&&branded.has(value),'PINNED_MARKET_RELEASE_REQUIRED');
}
