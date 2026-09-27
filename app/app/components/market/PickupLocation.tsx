'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {loadPlaceIndex,pickupArea,searchPlaces,type PickupArea,type PickupPlace} from '../../lib/market/places';

export default function PickupLocation({active,onChoose}:{active:boolean;onChoose(area:PickupArea,label:string):void}){
 const [query,setQuery]=useState(''),[busy,setBusy]=useState<'location'|'city'|null>(null),[message,setMessage]=useState<string|null>(null),[results,setResults]=useState<readonly PickupPlace[]>([]);
 const live=useRef({active,onChoose});live.current={active,onChoose};
 const generation=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|null>(null),request=useRef<AbortController|null>(null),index=useRef<readonly PickupPlace[]|null>(null),running=useRef(false);
 const id=useId();
 function cancel(){generation.current++;request.current?.abort();request.current=null;if(timer.current)clearTimeout(timer.current);timer.current=null;running.current=false;}
 useEffect(()=>{if(!active){cancel();setBusy(null);setResults([]);setMessage(null);}return cancel;},[active]);
 function locate(){
  if(!live.current.active||running.current)return;cancel();setResults([]);setMessage(null);
  if(!navigator.geolocation){setMessage('Location is unavailable. Choose a city instead.');return;}
  const ticket=generation.current;running.current=true;setBusy('location');
  const current=()=>live.current.active&&generation.current===ticket;
  const fail=(text:string)=>{if(!current())return;cancel();setBusy(null);setMessage(text);};
  timer.current=setTimeout(()=>fail('Location took too long. Choose a city or try again.'),11000);
  try{navigator.geolocation.getCurrentPosition(position=>{
   if(!current())return;
   try{
    if(!Number.isFinite(position.coords.accuracy)||position.coords.accuracy<0||position.coords.accuracy>10000)throw Error();
    const area=pickupArea(position.coords.latitude,position.coords.longitude);cancel();setBusy(null);live.current.onChoose(area,'Near you');
   }catch{fail('A reliable location is unavailable. Choose a city instead.');}
  },error=>fail(error.code===1?'Location access is off. Choose a city instead.':'Location is unavailable. Choose a city or try again.'),{enableHighAccuracy:false,maximumAge:60000,timeout:10000});}
  catch{fail('Location is unavailable. Choose a city instead.');}
 }
 async function search(){
  if(!live.current.active||running.current||query.trim().length<2||query.length>120)return;
  cancel();const ticket=generation.current,control=new AbortController();request.current=control;running.current=true;setBusy('city');setMessage(null);setResults([]);
  try{
   const places=index.current??await loadPlaceIndex({signal:control.signal});
   if(!live.current.active||ticket!==generation.current)return;index.current=places;
   const matches=searchPlaces(places,query);setResults(matches);if(!matches.length)setMessage('No matching city. Try another spelling or a nearby larger town.');
  }catch{if(live.current.active&&ticket===generation.current)setMessage('City search could not load. Try again or use your location.');}
  finally{if(ticket===generation.current){running.current=false;request.current=null;setBusy(null);}}
 }
 return <div className="pickup-location">
  <button type="button" className="pickup-location__nearby" disabled={!active||busy!==null} onClick={locate}>
   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>{busy==='location'?'Finding you…':'Search near me'}
  </button>
  <form className="pickup-location__form" onSubmit={event=>{event.preventDefault();void search();}}>
   <label htmlFor={id}>City or town</label>
   <div className="pickup-location__input"><input id={id} type="search" placeholder="e.g. Istanbul, London" autoComplete="off" maxLength={120} value={query} disabled={!active} onChange={event=>{cancel();setBusy(null);setMessage(null);setResults([]);setQuery(event.target.value);}}/><button type="submit" disabled={!active||busy!==null||query.trim().length<2}>{busy==='city'?'Searching…':'Find city'}</button></div>
  </form>
  {active&&message&&<p role="status" className="pickup-location__message">{message}</p>}
  {active&&results.length>0&&<ul className="pickup-location__results" aria-label="Matching cities">{results.map(place=><li key={place.id}><button type="button" onClick={()=>{if(!live.current.active)return;cancel();setResults([]);setMessage(null);setBusy(null);live.current.onChoose(pickupArea(place.latE6/1e6,place.lonE6/1e6),place.name);}}><strong>{place.name}</strong><span>{[place.region,place.country].filter(Boolean).join(', ')}</span></button></li>)}</ul>}
  <p className="pickup-location__privacy">Location is optional. City search stays in your browser. <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a></p>
 </div>;
}
