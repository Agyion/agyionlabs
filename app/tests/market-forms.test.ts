import { describe, it, expect } from 'vitest';
import { amount, units, coordinate, ledgerDuration, parsePickupCode } from '../app/lib/market/forms';
describe('market form boundaries', () => {
  it('preserves token precision and rejects scientific notation, coercion and overflow', () => {
    expect(amount('9007199254740993.1234567')).toBe(90071992547409931234567n);
    expect(units(amount('-0.0000001', true))).toBe('−0.0000001');
    for (const v of [' 1', '1e7', '1.00000001', '01', '1,2', 'NaN', '-1', '170141183460469231731687303715884105728']) expect(() => amount(v)).toThrow();
  });
  it('bounds map coordinates and reservation durations without float rounding', () => {
    expect(coordinate('-0.000001', true)).toBe(-1);
    expect(coordinate('180', false)).toBe(180000000);
    expect(() => coordinate('90.000001', true)).toThrow();
    expect(() => coordinate('2.0000001', false)).toThrow();
    expect(ledgerDuration('60', 720)).toBe(720);
    expect(ledgerDuration('0', 720, true)).toBe(0);
    for (const v of ['61', '0.5', '1e1', '-1', '0']) expect(() => ledgerDuration(v, 720)).toThrow();
  });
  it('rejects malformed and oversized pickup input before it reaches the wallet', () => {
    for (const v of ['null', '{}', '[]', '{"version":1}', 'x'.repeat(8193)]) expect(() => parsePickupCode(v, 'invalid')).toThrow();
  });
});

it('accepts a genuine bounded UTF-8 listing file and ignores overridden public accessors',async()=>{
 const {File,Blob}=await import('node:buffer');const {vi}=await import('vitest');vi.stubGlobal('File',File);vi.stubGlobal('Blob',Blob);
 const {readListingFile,NATIVE_MARKET_ASSET}=await import('../app/lib/market/forms');
 const metadata={title:'Bread',quantity:'One bag',allergens:'Wheat',storage:'Dry',shopId:'test',shopName:'Test bakery',address:'Test Street',latE6:1,lonE6:1,pickupStart:100,pickupEnd:200,timezone:'UTC',accessibility:'',imageHash:null};
 const draft={version:1,kind:'AgyionPublicListing',metadata,terms:{asset:NATIVE_MARKET_ASSET,pot:'1',start_price:'1',floor_price:'0',slope_num:'1',slope_den:'1',duration_ledgers:12,lease_ledgers:0,metadata_hash:'11'.repeat(32)}};
 try{
  const file=new File([JSON.stringify(draft)],'listing.json');const trap=vi.fn(()=>{throw new Error('overridden accessor must not run')});Object.defineProperty(file,'text',{value:trap});Object.defineProperty(file,'size',{get:trap});
  expect(await readListingFile(file as unknown as File)).toEqual(draft);expect(trap).not.toHaveBeenCalled();
  await expect(readListingFile({size:1,text:async()=>JSON.stringify(draft)} as File)).rejects.toThrow('Select a bounded listing file');
  await expect(readListingFile(new File([new Uint8Array(16385)],'large.json') as unknown as File)).rejects.toThrow();
  await expect(readListingFile(new File([Uint8Array.from([0xff,0xfe])],'invalid.json') as unknown as File)).rejects.toThrow('Listing file is invalid');
 }finally{vi.unstubAllGlobals();}
});
