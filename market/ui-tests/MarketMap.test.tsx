import React from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import MarketMap from '../../app/app/components/market/MarketMap';

const listing = {id: 'offer-a', title: '<img src=x onerror=alert(1)>', shopName: 'A & B', latE6: 41012345, lonE6: 28987654};
function deferred<T>() {let resolve!: (value: T) => void, reject!: (reason: Error) => void; const promise = new Promise<T>((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject};}
function leafletDouble() {
  let area = [28,40,29,41], host: HTMLElement;
  const events = new Map<string, Set<()=>void>>();
  const map = {on: vi.fn((names:string, fn:()=>void) => {for(const name of names.split(' ')) {if(!events.has(name))events.set(name,new Set());events.get(name)!.add(fn);}return map;}), off: vi.fn(), remove: vi.fn(), invalidateSize: vi.fn(), setView: vi.fn(), fitBounds: vi.fn(), getBounds: () => ({getWest:()=>area[0],getSouth:()=>area[1],getEast:()=>area[2],getNorth:()=>area[3]})};
  const layer = {addTo: vi.fn().mockReturnThis(),on: vi.fn().mockReturnThis(),off: vi.fn().mockReturnThis()};
  const markers: {element:HTMLElement;off:ReturnType<typeof vi.fn>;remove:ReturnType<typeof vi.fn>;fire:()=>void}[] = [];
  const api = {then:undefined,map:vi.fn((node:HTMLElement)=>{host=node;return map;}),tileLayer:vi.fn(()=>layer),divIcon:vi.fn(x=>x),marker:vi.fn((_point,options)=>{
    const element=document.createElement('div');element.append(options.icon.html);let onClick=()=>{};
    const marker={element,off:vi.fn(),remove:vi.fn(()=>element.remove()),fire:()=>onClick(),on:vi.fn((_name,fn)=>{onClick=fn;return marker;}),addTo:vi.fn(()=>{host.append(element);return marker;}),getElement:()=>element,setZIndexOffset:vi.fn()};markers.push(marker);return marker;
  })};
  return {api,map,layer,markers,setArea(next:number[]) {area=next;for(const fn of events.get('moveend')||[])fn();}};
}
let observers: {disconnect:ReturnType<typeof vi.fn>;observe:ReturnType<typeof vi.fn>}[];
beforeEach(()=>{vi.resetModules();observers=[];vi.stubGlobal('ResizeObserver',class {disconnect=vi.fn();observe=vi.fn();constructor(){observers.push(this);}});});
afterEach(async()=>{cleanup();await vi.dynamicImportSettled();vi.unstubAllGlobals();vi.doUnmock('leaflet');});

describe('explicit public market map',()=>{
  it('does not import a map until consent, uses safe labels and searches only on explicit click',async()=>{
    const d=leafletDouble(),load=vi.fn(()=>d.api);vi.doMock('leaflet',load);const onSelect=vi.fn(),onArea=vi.fn();
    render(<MarketMap listings={[listing]} onSelect={onSelect} onArea={onArea}/>);
    expect(load).not.toHaveBeenCalled();expect(screen.getByText(/OpenStreetMap receives your IP address/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Show map'}));await waitFor(()=>expect(d.api.map).toHaveBeenCalledTimes(1));
    expect(d.api.tileLayer).toHaveBeenCalledWith('https://tile.openstreetmap.org/{z}/{x}/{y}.png',expect.objectContaining({referrerPolicy:'strict-origin-when-cross-origin',keepBuffer:0,updateWhenIdle:true,updateWhenZooming:false,noWrap:true}));
    expect(screen.getByRole('link',{name:'OpenStreetMap contributors'}).getAttribute('href')).toBe('https://www.openstreetmap.org/copyright');
    expect(d.markers[0].element.querySelector('img')).toBeNull();expect(d.markers[0].element.textContent).toContain(listing.title);
    act(()=>d.markers[0].fire());expect(onSelect).toHaveBeenCalledWith('offer-a');expect(onArea).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Search this area'}));expect(onArea).toHaveBeenCalledExactlyOnceWith([28000000,40000000,29000000,41000000]);
  });
  it('rejects oversized, invalid and wrapped bounds without changing the query behind the user',async()=>{
    const d=leafletDouble();vi.doMock('leaflet',()=>d.api);const onArea=vi.fn();render(<MarketMap listings={[listing]} onSelect={()=>{}} onArea={onArea}/>);
    fireEvent.click(screen.getByRole('button',{name:'Show map'}));await waitFor(()=>expect(d.api.map).toHaveBeenCalled());
    expect(d.map.setView).not.toHaveBeenCalledWith([0,0],2);expect(d.api.marker).toHaveBeenCalled();
    for(const bounds of [[0,0,5.000001,1],[0,0,1,5.000001],[179,0,181,1],[0,0,NaN,1],[1,0,0,1]]){
      act(()=>d.setArea(bounds));expect(screen.getByRole('button',{name:'Search this area'}).hasAttribute('disabled')).toBe(true);
      fireEvent.click(screen.getByRole('button',{name:'Search this area'}));
    }
    expect(screen.getByText('Zoom closer to search this area')).toBeTruthy();expect(onArea).not.toHaveBeenCalled();
    act(()=>d.setArea([1.1234567,2.1234567,3.1234561,4.1234561]));fireEvent.click(screen.getByRole('button',{name:'Search this area'}));
    expect(onArea).toHaveBeenCalledWith([1123456,2123456,3123457,4123457]);
  });
  it('does not create a map when a delayed import finishes after close or unmount',async()=>{
    const d=leafletDouble(),gate=deferred<typeof d.api>(),load=vi.fn(()=>gate.promise);vi.doMock('leaflet',load);
    const view=render(<MarketMap listings={[listing]} onSelect={()=>{}} onArea={()=>{}}/>);
    fireEvent.click(screen.getByRole('button',{name:'Show map'}));await waitFor(()=>expect(load).toHaveBeenCalled());fireEvent.click(screen.getByRole('button',{name:'Hide map'}));
    await act(async()=>{gate.resolve(d.api);await vi.dynamicImportSettled();});expect(d.api.map).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Show map'}));await waitFor(()=>expect(d.api.map).toHaveBeenCalledTimes(1));
    view.unmount();expect(d.map.off).toHaveBeenCalled();expect(d.map.remove).toHaveBeenCalledTimes(1);expect(observers.every(x=>x.disconnect.mock.calls.length===1)).toBe(true);expect(d.markers[0].off).toHaveBeenCalled();
  });
  it('uses latest listings and callbacks while loading and closes on inactive panels',async()=>{
    const d=leafletDouble(),gate=deferred<typeof d.api>();vi.doMock('leaflet',()=>gate.promise);const old=vi.fn(),current=vi.fn();
    const view=render(<MarketMap listings={[listing]} onSelect={old} onArea={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'Show map'}));
    const next={...listing,id:'offer-b',title:'Fresh bread'};view.rerender(<MarketMap listings={[next]} selectedId="offer-b" onSelect={current} onArea={()=>{}}/>);
    await act(async()=>{gate.resolve(d.api);await gate.promise;});await waitFor(()=>expect(d.markers.length).toBe(1));
    expect(d.markers[0].element.textContent).toContain('Fresh bread');expect(d.markers[0].element.getAttribute('aria-pressed')).toBe('true');
    act(()=>d.markers[0].fire());expect(old).not.toHaveBeenCalled();expect(current).toHaveBeenCalledWith('offer-b');
    view.rerender(<MarketMap active={false} listings={[next]} onSelect={current} onArea={()=>{}}/>);expect(d.map.remove).toHaveBeenCalledTimes(1);
    view.rerender(<MarketMap listings={[next]} onSelect={current} onArea={()=>{}}/>);expect(screen.getByRole('button',{name:'Show map'})).toBeTruthy();expect(d.api.map).toHaveBeenCalledTimes(1);
  });
  it('does not publish initialization errors or fetch tiles after an inactive delayed import',async()=>{
    const d=leafletDouble(),gate=deferred<typeof d.api>();vi.doMock('leaflet',()=>gate.promise);
    const view=render(<MarketMap listings={[listing]} onSelect={()=>{}} onArea={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'Show map'}));
    view.rerender(<MarketMap active={false} listings={[]} onSelect={()=>{}} onArea={()=>{}}/>);
    await act(async()=>{gate.reject(new Error('internal detail'));try{await gate.promise;}catch{}});expect(d.api.map).not.toHaveBeenCalled();expect(screen.queryByText(/internal detail/)).toBeNull();
  });
  it('cleans a partially initialized map exactly once and keeps errors generic',async()=>{
    const d=leafletDouble();d.api.tileLayer.mockImplementation(()=>{throw new Error('provider internals');});vi.doMock('leaflet',()=>d.api);
    const view=render(<MarketMap listings={[listing]} onSelect={()=>{}} onArea={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'Show map'}));
    await screen.findByText('Map unavailable. You can still use the listing list.');expect(screen.queryByText(/provider internals/)).toBeNull();
    expect(d.map.remove).toHaveBeenCalledTimes(1);view.unmount();expect(d.map.remove).toHaveBeenCalledTimes(1);
  });
  it('discards a pending import after unmount and does not initialize a tile layer',async()=>{
    const d=leafletDouble(),gate=deferred<typeof d.api>(),load=vi.fn(()=>gate.promise);vi.doMock('leaflet',load);
    const view=render(<MarketMap listings={[listing]} onSelect={()=>{}} onArea={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'Show map'}));
    await waitFor(()=>expect(load).toHaveBeenCalled());view.unmount();await act(async()=>{gate.resolve(d.api);await vi.dynamicImportSettled();});
    expect(d.api.map).not.toHaveBeenCalled();expect(d.api.tileLayer).not.toHaveBeenCalled();
  });
  it('ignores non-mappable coordinates and preserves the camera when selection changes',async()=>{
    const d=leafletDouble();vi.doMock('leaflet',()=>d.api);const listings=[listing,{...listing,id:'bad',latE6:NaN},{...listing,id:'pole',latE6:90000000}];
    const view=render(<MarketMap listings={listings} onSelect={()=>{}} onArea={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'Show map'}));
    await waitFor(()=>expect(d.markers.length).toBe(1));expect(d.map.fitBounds).toHaveBeenCalledTimes(1);
    view.rerender(<MarketMap listings={listings} selectedId={listing.id} onSelect={()=>{}} onArea={()=>{}}/>);
    expect(d.map.fitBounds).toHaveBeenCalledTimes(1);expect(d.markers.at(-1)!.element.getAttribute('aria-pressed')).toBe('true');
  });
});

it('offers a local starting point without loading a world map when there are no listings',async()=>{
 const d=leafletDouble(),load=vi.fn(()=>d.api);vi.doMock('leaflet',load);
 render(<MarketMap listings={[]} onSelect={()=>{}} onArea={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Show map'}));await vi.dynamicImportSettled();
 expect(load).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Search near me'})).toBeTruthy();
 expect(screen.getByLabelText('City or town')).toBeTruthy();expect(d.map.setView).not.toHaveBeenCalled();
});
it('keeps the chosen neighborhood while a catalog refresh has no listings',async()=>{
 const d=leafletDouble();vi.doMock('leaflet',()=>d.api);
 const view=render(<MarketMap listings={[listing]} onSelect={()=>{}} onArea={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Show map'}));await waitFor(()=>expect(d.api.map).toHaveBeenCalledTimes(1));
 const fits=d.map.fitBounds.mock.calls.length;act(()=>d.setArea([28.9,40.9,29.1,41.1]));
 view.rerender(<MarketMap listings={[]} onSelect={()=>{}} onArea={()=>{}}/>);
 expect(d.map.setView).not.toHaveBeenCalledWith([0,0],2);expect(d.map.fitBounds).toHaveBeenCalledTimes(fits);
 expect(d.map.remove).not.toHaveBeenCalled();
});
it('gives the map room after choosing a location and exposes one explicit area-change action',async()=>{
 const d=leafletDouble();vi.doMock('leaflet',()=>d.api);const onArea=vi.fn();
 Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(yes:PositionCallback)=>yes({coords:{latitude:41,longitude:29,accuracy:50}} as GeolocationPosition)}});
 try{
  render(<MarketMap listings={[]} onSelect={()=>{}} onArea={onArea}/>);fireEvent.click(screen.getByRole('button',{name:'Search near me'}));
  await waitFor(()=>expect(d.api.map).toHaveBeenCalled());expect(onArea).toHaveBeenCalledOnce();expect(screen.queryByLabelText('City or town')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Change area'}));expect(screen.getByLabelText('City or town')).toBeTruthy();expect(onArea).toHaveBeenCalledOnce();
 }finally{Reflect.deleteProperty(navigator,'geolocation');}
});
