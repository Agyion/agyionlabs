import { SKIP_FLIGHT_STORAGE_KEY } from './flight-preference';

// Finish the whole journey on the existing renderer before crossing documents.
export const LAUNCH_DURATION_MS = 9800;
export const ARRIVAL_DURATION_MS = 6200;
export const ARRIVAL_REVEAL_MS = 450;
export const FLIGHT_MAX_AGE_MS = 30000;
const MAX_FRAME_LENGTH = 2 * 1024 * 1024;

export interface ArrivalPose {
  elapsed: number;
  /** Independent gas phase lets the app flow faster without a handoff jump. */
  flowTime?: number;
  ringFocus: number;
  yaw: number;
  pitch: number;
  zoom: number;
}

export function validArrivalPose(value: unknown): value is ArrivalPose {
  if (!value || typeof value !== 'object') return false;
  const pose = value as ArrivalPose;
  return [pose.elapsed, pose.ringFocus, pose.yaw, pose.pitch, pose.zoom]
    .every(number => typeof number === 'number' && Number.isFinite(number))
    && pose.elapsed >= 0 && pose.elapsed <= 1e7
    && (pose.flowTime === undefined || (Number.isFinite(pose.flowTime) && pose.flowTime >= 0 && pose.flowTime <= 2e7))
    && Math.abs(pose.ringFocus) <= Math.PI && Math.abs(pose.yaw) <= Math.PI
    && Math.abs(pose.pitch) <= 1.13
    && pose.zoom >= Math.log(7.5 / 19) && pose.zoom <= Math.log(42 / 19);
}

export function clearFlightHandoff(storage: Storage) {
  try { storage.removeItem('agyion:arrival'); storage.removeItem('agyion:flight-frame'); } catch { /* Storage is optional. */ }
}

/** Commit the marker last, so a failed image write never revives an older frame. */
export function writeFlightHandoff(storage: Storage, pose: ArrivalPose, data?: string, now = Date.now(), options: { settled?: boolean; softwareGraphics?: boolean } = {}) {
  clearFlightHandoff(storage);
  const id = `${now}-${Math.random().toString(36).slice(2)}`;
  const metadata = { at: now, id, pose, ...(options.softwareGraphics === true ? { softwareGraphics: true } : {}) };
  const frame = { ...metadata, ...(data && data.length < MAX_FRAME_LENGTH ? { data } : {}) };
  try {
    try { storage.setItem('agyion:flight-frame', JSON.stringify(frame)); }
    catch { storage.setItem('agyion:flight-frame', JSON.stringify(metadata)); }
    storage.setItem('agyion:arrival', JSON.stringify({ at: now, id, ...(options.settled ? { settled: true } : {}) }));
  } catch { clearFlightHandoff(storage); }
}

/** Consume a launch once; an orphan frame must never cover a normal app visit. */
export function readFlightHandoff(storage: Storage, now = Date.now()): { arrival: boolean; settled?: boolean; pose?: ArrivalPose; image?: string; softwareGraphics?: true } {
  let marker: string | null = null, frame: string | null = null;
  try { marker = storage.getItem('agyion:arrival'); frame = storage.getItem('agyion:flight-frame'); } catch { /* Storage is optional. */ }
  clearFlightHandoff(storage);
  try {
    const launch = marker ? JSON.parse(marker) : null;
    const age = launch && typeof launch.at === 'number' ? now - launch.at : Infinity;
    if (!(age >= 0 && age < FLIGHT_MAX_AGE_MS)) return { arrival: false };
    // A missing optional image/pose must not restart a completed journey.
    const state = { arrival: true, ...(launch.settled === true ? { settled: true } : {}) };
    if (!frame || frame.length > MAX_FRAME_LENGTH) return state;
    const saved = JSON.parse(frame);
    const paired = launch.id ? saved.id === launch.id : !saved.id && Math.abs(saved.at - launch.at) <= 1000;
    if (!paired || typeof saved.at !== 'number' || now - saved.at < 0 || now - saved.at >= FLIGHT_MAX_AGE_MS) return state;
    const image = typeof saved.data === 'string' && /^data:image\/(?:webp|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(saved.data) ? saved.data : undefined;
    const pose = validArrivalPose(saved.pose) ? saved.pose : undefined;
    // Renderer hints belong only to a fresh identified journey with a valid pose;
    // legacy markers and arbitrary truthy storage values cannot lower GPU quality.
    const softwareGraphics = pose && typeof launch.id === 'string' && launch.id.length > 0 && saved.softwareGraphics === true;
    return { ...state, pose, image, ...(softwareGraphics ? { softwareGraphics: true as const } : {}) };
  } catch { return { arrival: false }; }
}

// Runs in the head: start decoding the validated same-tab frame before the body
// can paint. A one-shot observer places it only in its hydration-owned body root.
// The component takes over once hydrated; eight seconds is a fail-open limit.
export const FLIGHT_BRIDGE_SCRIPT = String.raw`(()=>{try{
if(!/^\/app\/?$/.test(location.pathname))return;
let skip=false;try{skip=localStorage.getItem('${SKIP_FLIGHT_STORAGE_KEY}')==='1'}catch{}
if(skip){try{sessionStorage.removeItem('agyion:arrival');sessionStorage.removeItem('agyion:flight-frame')}catch{}return}
if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
const m=JSON.parse(sessionStorage.getItem('agyion:arrival')||'null');
const raw=sessionStorage.getItem('agyion:flight-frame');
const now=Date.now();
if(!m||typeof m.at!=='number'||now-m.at<0||now-m.at>=30000||!raw||raw.length>2097152)return;
const f=JSON.parse(raw);
if(!f||typeof f.at!=='number'||now-f.at<0||now-f.at>=30000||(m.id?f.id!==m.id:f.id||Math.abs(f.at-m.at)>1000)||typeof f.data!=='string'||!/^data:image\/(?:webp|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(f.data))return;
const image=document.createElement('img');image.id='agyion-flight-bridge';image.decoding='sync';image.fetchPriority='high';image.src=f.data;image.alt='';image.setAttribute('aria-hidden','true');image.draggable=false;
image.style.cssText='position:fixed;inset:0;width:100%;height:100%;object-fit:cover;background:#07090d;z-index:2147483000;pointer-events:none';
let observer,closed=false;
const remove=()=>{closed=true;observer?.disconnect();image.remove()};
const mount=()=>{if(closed)return;const root=document.getElementById('agyion-flight-bridge-root');if(!root)return;root.appendChild(image);observer?.disconnect()};
image.onerror=remove;setTimeout(remove,8000);
if(document.getElementById('agyion-flight-bridge-root'))mount();else{observer=new MutationObserver(mount);observer.observe(document.documentElement,{childList:true,subtree:true})}
}catch{}})();`;
