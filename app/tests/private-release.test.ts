import {afterEach,expect,it,vi} from 'vitest';
import {verifyPoolRelease} from '../../contracts/private-pool/client/release';
import {setup} from '../../contracts/private-pool/client/reader-fixture';
import {
 DEFAULT_PRIVATE_RELEASE_KEY,listPrivateReleaseOptions,resolvePrivateRelease,
 findPrivateReleaseForScope,assertPrivateReleaseSelection,getPrivatePoolRelease,
} from '../app/lib/private/release';

afterEach(()=>vi.unstubAllGlobals());
it('defaults to the guarded pool and preserves the original scope for recovery',async()=>{
 const options=listPrivateReleaseOptions();expect(options).toEqual([{key:'private-testnet-accounting',label:'Current private pool',policy:'funding',accounting:true},{key:'private-testnet-original',label:'Earlier pool recovery',policy:'recovery',accounting:false}]);
 expect(Object.isFrozen(options)).toBe(true);expect(Object.isFrozen(options[0])).toBe(true);
 const selected=await resolvePrivateRelease(DEFAULT_PRIVATE_RELEASE_KEY);
 expect(selected.release).toBe(await getPrivatePoolRelease());expect(selected).toBe(await resolvePrivateRelease(selected.key));
 expect(DEFAULT_PRIVATE_RELEASE_KEY).toBe('private-testnet-accounting');
 expect(selected.release.scope.profileId).toBe('c144c20b4b4d796759e44c8a7cf5c05180d9c63397dc58ff787578e0f0abf802');
 expect(selected.release.pool).toBe('CAI6HUPV6VLXRKJKSCANRM4YP7W6ZNLBUZFK4GEUG5O3OB4X43RBE2ZB');
 expect(selected.release.wasmHash).toBe('4ead5defa386974742071212701f3bcb327fd0a1bc6bf14df2f97f08b11b5018');
 const earlier=await resolvePrivateRelease('private-testnet-original');
 expect(earlier.policy).toBe('recovery');expect(earlier.accounting).toBe(false);
 expect(earlier.release.scope.profileId).toBe('1d99e28fc860cc080557a12b032dda5fd1218c26aad8c1a6b15e6e45bc4dbc22');
 expect(earlier.release.pool).toBe('CDSK32ISKXRW6PX3ZMCHLUP4URNQSYNNH2GZU7ZSZJFL4FSEFQM25YHT');
 expect(earlier.release.wasmHash).toBe('103f46d4eb97b021f2618e307970ce49993417901789e03760a4af512b7fee6e');
 expect(await findPrivateReleaseForScope(earlier.release.scope)).toBe(earlier);
 expect(await findPrivateReleaseForScope(selected.release.scope)).toBe(selected);
 expect(earlier.release.configXdr).not.toBe(selected.release.configXdr);
 expect(selected.assets).toEqual(['CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC','CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA']);
 expect(Object.isFrozen(selected)).toBe(true);expect(Object.isFrozen(selected.assets)).toBe(true);
 expect(()=>assertPrivateReleaseSelection(selected)).not.toThrow();
 for(const forged of [{...selected},Object.freeze({...selected}),options[0],selected.release,null])expect(()=>assertPrivateReleaseSelection(forged)).toThrow('KNOWN_PRIVATE_RELEASE_REQUIRED');
});
it('rejects unknown selectors without coercing them or fetching an arbitrary manifest',async()=>{
 const fetch=vi.fn(),toString=vi.fn(()=>DEFAULT_PRIVATE_RELEASE_KEY);vi.stubGlobal('fetch',fetch);
 for(const key of ['https://evil.invalid/release.json','__proto__','',null,undefined,4,{toString}])await expect(resolvePrivateRelease(key)).rejects.toThrow('UNKNOWN_PRIVATE_RELEASE');
 expect(toString).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
});
it('resolves only the exact four-field known scope, snapshotting it before awaiting',async()=>{
 const selected=await resolvePrivateRelease(DEFAULT_PRIVATE_RELEASE_KEY),scope={...structuredClone(selected.release.scope)},finding=findPrivateReleaseForScope(scope);
 scope.profileId='ab'.repeat(32);expect(await finding).toBe(selected);
 const candidates=[
  {...selected.release.scope,profileId:'ab'.repeat(32)},
  {...selected.release.scope,epoch:'2'},
  {...selected.release.scope,domain:{...selected.release.scope.domain,networkId:'ab'.repeat(32)}},
  {...selected.release.scope,domain:{...selected.release.scope.domain,contractId:'ab'.repeat(32)}},
 ];
 for(const candidate of candidates)await expect(findPrivateReleaseForScope(candidate)).rejects.toThrow('UNKNOWN_PRIVATE_RELEASE_SCOPE');
});
it('rejects malformed and accessor scopes without evaluating data getters or leaking thrown messages',async()=>{
 const selected=await resolvePrivateRelease(DEFAULT_PRIVATE_RELEASE_KEY),scope=selected.release.scope,getter=vi.fn(()=>scope.profileId);
 const hostile=new Proxy({}, {ownKeys(){throw Error('sensitive attacker payload')}});
 const accessor={...scope};Object.defineProperty(accessor,'profileId',{get:getter,enumerable:true});
 for(const value of [null,[],{...scope,extra:1},{...scope,epoch:'01'},{...scope,epoch:'4294967296'},{...scope,domain:{...scope.domain,rpc:'https://evil.invalid'}},{...scope,profileId:'00'.repeat(32)},accessor,hostile]){
  await expect(findPrivateReleaseForScope(value)).rejects.toThrow('INVALID_PRIVATE_RELEASE_SCOPE');
 }
 expect(getter).not.toHaveBeenCalled();
});
it('does not promote a locally valid self-signed roster into catalogue authority',async()=>{
 const fixture=await setup(),foreign=await verifyPoolRelease(fixture.manifest,fixture.dkg),fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 await expect(findPrivateReleaseForScope(foreign.scope)).rejects.toThrow('UNKNOWN_PRIVATE_RELEASE_SCOPE');
 expect(()=>assertPrivateReleaseSelection({key:DEFAULT_PRIVATE_RELEASE_KEY,label:'Original private pool',policy:'funding',accounting:false,assets:fixture.manifest.config.assets,release:foreign})).toThrow('KNOWN_PRIVATE_RELEASE_REQUIRED');
 expect(fetch).not.toHaveBeenCalled();
});

it('never combines an old deployment domain with the new committee profile',async()=>{
 const earlier=await resolvePrivateRelease('private-testnet-original'),current=await resolvePrivateRelease(DEFAULT_PRIVATE_RELEASE_KEY);
 for(const [a,b] of [[earlier,current],[current,earlier]]){
  await expect(findPrivateReleaseForScope({...a.release.scope,profileId:b.release.scope.profileId})).rejects.toThrow('UNKNOWN_PRIVATE_RELEASE_SCOPE');
  await expect(findPrivateReleaseForScope({...a.release.scope,domain:b.release.scope.domain})).rejects.toThrow('UNKNOWN_PRIVATE_RELEASE_SCOPE');
 }
});
