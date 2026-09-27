import {expect,it,vi} from 'vitest';
import {pickupArea,parsePlaceIndex,searchPlaces,loadPlaceIndex} from '../app/lib/market/places';

const packet={version:1,cities:[[745044,'İstanbul','Istanbul','TR',41013640,28955050,'istanbul|constantinople'],[5128581,'New York City','New York','US',40714270,-74005970,'new york city|nyc'],[2643743,'London','England','GB',51508530,-125740,'london|londres']]};
it('keeps pickup searches local, finite and within the catalog geographic bounds',()=>{
 for(const [lat,lon] of [[41,29],[0,180],[0,-180],[85.051128,179.99],[-85.051128,-179.99]]){
  const [w,s,e,n]=pickupArea(lat,lon);expect([w,s,e,n].every(Number.isSafeInteger)).toBe(true);expect(w).toBeLessThan(e);expect(s).toBeLessThan(n);
  expect(w).toBeGreaterThanOrEqual(-180e6);expect(e).toBeLessThanOrEqual(180e6);expect(s).toBeGreaterThanOrEqual(-85051128);expect(n).toBeLessThanOrEqual(85051128);expect(e-w).toBeLessThanOrEqual(5e6);expect(n-s).toBeLessThanOrEqual(5e6);
 }
 for(const pair of [[NaN,29],[90,29],[41,181],[41,Infinity]])expect(()=>pickupArea(...pair as [number,number])).toThrow();
});
it('finds native and alternative city names without confusing region-only matches',()=>{
 const index=parsePlaceIndex(packet);expect(searchPlaces(index,'İSTANBUL')[0].name).toBe('İstanbul');expect(searchPlaces(index,'constantinople, tr')[0].id).toBe(745044);
 expect(searchPlaces(index,'londres')[0].country).toBe('GB');expect(searchPlaces(index,'New York, US')[0].name).toBe('New York City');
 expect(searchPlaces(index,'')).toEqual([]);expect(searchPlaces(index,'a'.repeat(121))).toEqual([]);expect(searchPlaces(index,'<script>')).toEqual([]);
});
it('rejects malformed, duplicate and out-of-range place data rather than creating unsafe destinations',()=>{
 for(const row of [[1,'Bad','','US',NaN,0,'bad'],[1,'Bad','','US',91000000,0,'bad'],[1,'Bad','','US',0,181000000,'bad'],[1,'Bad','','javascript:',0,0,'bad'],[1,'Bad','','US',0,0,'bad','extra']])expect(()=>parsePlaceIndex({version:1,cities:[row]})).toThrow('PLACE_INDEX_INVALID');
 expect(()=>parsePlaceIndex({version:1,cities:[packet.cities[0],packet.cities[0]]})).toThrow();expect(()=>parsePlaceIndex({...packet,version:2})).toThrow();
});
it('fetches only the same-origin packaged index and cancels oversized or redirected replies',async()=>{
 const fetcher=vi.fn(async()=>new Response(JSON.stringify(packet)));const abort=new AbortController();
 expect((await loadPlaceIndex({fetch:fetcher,signal:abort.signal})).length).toBe(3);
 expect(fetcher).toHaveBeenCalledWith('/places/cities-20260927.json',expect.objectContaining({credentials:'omit',redirect:'error',signal:expect.any(AbortSignal)}));
 await expect(loadPlaceIndex({fetch:async()=>new Response('[]',{headers:{'content-length':'12000001'}})})).rejects.toThrow('PLACE_INDEX_INVALID');
 await expect(loadPlaceIndex({fetch:async()=>new Response('<html>bad</html>')})).rejects.toThrow('PLACE_INDEX_INVALID');
 abort.abort();await expect(loadPlaceIndex({fetch:fetcher,signal:abort.signal})).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(1);
});
