'use client';

import {useEffect, useId, useRef, useState} from 'react';
import type {Map as LeafletMap, Marker, TileLayer} from 'leaflet';
import PickupLocation from './PickupLocation';
import {pickupArea} from '../../lib/market/places';

export type MarketMapListing = {id: string; title: string; shopName: string; latE6: number; lonE6: number};
export type MarketMapArea = [west: number, south: number, east: number, north: number];
export type MarketMapProps = {
  listings: readonly MarketMapListing[];
  selectedId?: string;
  onSelect(id: string): void;
  onArea(area: MarketMapArea): void;
  /** Set false when the surrounding panel is hidden without being unmounted. */
  active?: boolean;
};
type Session = {map: LeafletMap; update(): void; bounds(): MarketMapArea | null};
const SCALE = 1_000_000;
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function searchArea(map: LeafletMap): MarketMapArea | null {
  const b = map.getBounds();
  const values = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  if (!values.every(Number.isFinite)) return null;
  const [west,south,east,north] = values;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) return null;
  const area: MarketMapArea = [Math.floor(west*SCALE),Math.floor(south*SCALE),Math.ceil(east*SCALE),Math.ceil(north*SCALE)];
  return area[2]-area[0] <= 5*SCALE && area[3]-area[1] <= 5*SCALE ? area : null;
}

function mappable(listing: MarketMapListing): boolean {
  return Number.isSafeInteger(listing.latE6) && Number.isSafeInteger(listing.lonE6)
    && Math.abs(listing.latE6) <= 85_051_128 && Math.abs(listing.lonE6) <= 180*SCALE;
}

export default function MarketMap(props: MarketMapProps) {
  const {active = true} = props;
  const [open,setOpen] = useState(false);
  const [status,setStatus] = useState<'loading'|'ready'|'error'>('loading');
  const [area,setArea] = useState<MarketMapArea|null>(null);
  const [tileError,setTileError] = useState(false);
  const [view,setView] = useState<{area:MarketMapArea;label:string}|null>(null);
  const [editing,setEditing] = useState(true);
  const focus=useRef(view);focus.current=view;
  const hasView=view!==null;
  const container = useRef<HTMLDivElement>(null);
  const current = useRef(props);
  const session = useRef<Session|null>(null);
  const id = useId();

  useEffect(() => {current.current=props;});
  useEffect(() => {if(!active)setOpen(false);},[active]);
  useEffect(() => {session.current?.update();},[props.listings,props.selectedId]);
  useEffect(() => {
    if(!active||!open||view)return;
    const first=props.listings.find(mappable);
    if(first){setView({area:pickupArea(first.latE6/SCALE,first.lonE6/SCALE),label:first.shopName});setEditing(false);}
  },[active,open,view,props.listings]);
  useEffect(() => {
    if(!view||!session.current)return;
    const [w,s,e,n]=view.area;
    session.current.map.fitBounds([[s/SCALE,w/SCALE],[n/SCALE,e/SCALE]],{padding:[24,24],maxZoom:16,animate:false});
  },[view]);

  useEffect(() => {
    if(!active || !open || !hasView || !container.current)return;
    let cancelled=false;
    let map: LeafletMap|undefined, tiles: TileLayer|undefined, observer: ResizeObserver|undefined;
    let markers: Marker[]=[];
    let thisSession: Session|undefined;
    const host=container.current;
    const clearMarkers=()=>{for(const marker of markers){marker.off();marker.remove();}markers=[];};
    const cleanup=()=>{if(cancelled)return;cancelled=true;observer?.disconnect();tiles?.off();clearMarkers();map?.off();map?.remove();if(session.current===thisSession)session.current=null;};
    setStatus('loading');setArea(null);setTileError(false);
    void import('leaflet').then(L=>{
      if(cancelled)return;
      map=L.map(host,{scrollWheelZoom:false,attributionControl:false,minZoom:2,maxZoom:19,maxBounds:[[-85.051128,-180],[85.051128,180]],maxBoundsViscosity:1,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false});
      const liveMap=map;
      const [w,s,e,n]=focus.current!.area;
      liveMap.fitBounds([[s/SCALE,w/SCALE],[n/SCALE,e/SCALE]],{padding:[24,24],maxZoom:16,animate:false});
      const updateArea=()=>{if(!cancelled)setArea(searchArea(liveMap));};
      const update=()=>{
        if(cancelled)return;
        clearMarkers();
        const listings=current.current.listings.filter(mappable);
        for(const [index,listing] of listings.entries()){
          const pin=document.createElement('span');pin.className='market-map-pin';
          const number=document.createElement('span');number.textContent=String(index+1);number.setAttribute('aria-hidden','true');pin.append(number);
          const label=document.createElement('span');label.className='market-map-pin__label';label.textContent=`${listing.shopName}: ${listing.title}`;pin.append(label);
          const selected=listing.id===current.current.selectedId;
          if(selected)pin.classList.add('market-map-pin--selected');
          const marker=L.marker([listing.latE6/SCALE,listing.lonE6/SCALE],{keyboard:true,title:label.textContent,icon:L.divIcon({html:pin,className:'market-map-marker',iconSize:[36,36],iconAnchor:[18,18]})});
          marker.on('click',()=>{if(!cancelled)current.current.onSelect(listing.id);}).addTo(liveMap);
          const element=marker.getElement();
          element?.setAttribute('aria-label',label.textContent);element?.setAttribute('aria-pressed',String(selected));
          marker.setZIndexOffset(selected?1000:0);markers.push(marker);
        }
        // Results can disappear while refreshing. They never determine the
        // camera after the first local view has been chosen.
        updateArea();
      };
      thisSession={map:liveMap,update,bounds:()=>searchArea(liveMap)};session.current=thisSession;
      liveMap.on('moveend zoomend resize',updateArea);
      update();
      // Native image requests retain ordinary browser caching. No tile prefetch.
      tiles=L.tileLayer(TILE_URL,{maxZoom:19,noWrap:true,keepBuffer:0,updateWhenIdle:true,updateWhenZooming:false,detectRetina:false,referrerPolicy:'strict-origin-when-cross-origin'});
      tiles.on('tileerror',()=>{if(!cancelled)setTileError(true);}).addTo(liveMap);
      if(typeof ResizeObserver!=='undefined'){
        observer=new ResizeObserver(()=>{if(!cancelled)liveMap.invalidateSize({pan:false,animate:false});});observer.observe(host);
      }
      setStatus('ready');
    }).catch(()=>{if(cancelled)return;cleanup();setArea(null);setStatus('error');});
    return cleanup;
  },[active,open,hasView]);

  const visible=active && open;
  function search() {
    // Re-read at the click boundary; movement may precede its final event.
    const next=session.current?.bounds();
    if(visible && status==='ready' && next)current.current.onArea(next);
  }
  return <section className="market-map" aria-label="Pickup map">
    {editing||!view?<PickupLocation active={active} onChoose={(area,label)=>{setView({area,label});setEditing(false);setOpen(true);current.current.onArea(area);}}/>
      :<div className="market-map__place"><strong>{view.label}</strong><button type="button" disabled={!active} onClick={()=>setEditing(true)}>Change area</button></div>}
    <div className="market-map__toolbar">
      <button type="button" className="market-map__toggle" aria-expanded={visible} aria-controls={id} disabled={!active} onClick={()=>{const saved=session.current?.bounds();if(saved)setView({area:saved,label:view?.label??'Selected area'});setOpen(value=>!value);}}>{visible?'Hide map':'Show map'}</button>
      <p className="market-map__notice">OpenStreetMap receives your IP address and the area you view when the map opens.</p>
    </div>
    {visible && !view && <div id={id} className="market-map__empty"><h4>Start with your neighborhood</h4><p>Use your location or choose a city above.</p></div>}
    {visible && view && <div id={id} className="market-map__body">
      <div ref={container} className="market-map__canvas" aria-label="Pickup locations. Use arrow keys to move the map and plus or minus to zoom."/>
      <div className="market-map__attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a></div>
      {status==='loading' && <p className="market-map__status" role="status">Loading map…</p>}
      {status==='error' && <p className="market-map__status" role="status">Map unavailable. You can still use the listing list.</p>}
      {tileError && status==='ready' && <p className="market-map__status" role="status">Some map tiles could not load. You can still use the listing list.</p>}
      <div className="market-map__search">
        <button type="button" disabled={status!=='ready'||!area} onClick={search}>Search this area</button>
        {status==='ready' && !area && <span role="status">Zoom closer to search this area</span>}
      </div>
    </div>}
  </section>;
}
