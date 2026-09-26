"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { createOrbitalScene } from "../../../../shared/space-scene";
import { ARRIVAL_REVEAL_MS, readFlightHandoff } from "../../../../shared/flight-handoff";
import type { ArrivalPose } from "../../../../shared/flight-handoff";

type SceneHandle = ReturnType<typeof createOrbitalScene>;
const removeFlightBridge = () => document.getElementById("agyion-flight-bridge")?.remove();
// Begin chunk discovery when the client module loads, before hydration effects.
// The landing flight can already have warmed these exact immutable assets.
const sceneModule = typeof window === "undefined" ? null : import("../../../../shared/space-scene");
// The effect handles a failed import; an early rejection must not be unhandled.
void sceneModule?.catch(() => {});

/** Losing the 3D view never changes the selected instrument or a form. */
export default function OrbitalBackdrop({ selected, reduced, onSelect, onArrival, exploreRequest, selectionRequest = 0, panelOpen }: {
  selected: string;
  reduced: boolean;
  onSelect: (id: string) => void;
  onArrival: (arriving: boolean) => void;
  exploreRequest: number;
  selectionRequest?: number;
  panelOpen: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<SceneHandle | null>(null);
  const selectedRef = useRef(selected);
  const panelOpenRef = useRef(panelOpen);
  const exploreRequestRef = useRef(exploreRequest);
  const onSelectRef = useRef(onSelect);
  const onArrivalRef = useRef(onArrival);
  const visibleRef = useRef(true);
  const arrivalRead = useRef(false);
  const arrivalRef = useRef(false);
  const settledRef = useRef(false);
  const arrivalPoseRef = useRef<ArrivalPose>();
  const arrivalImageRef = useRef<string>();
  const softwareGraphicsHintRef = useRef<boolean>();
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [arrivalPoster, setArrivalPoster] = useState<string | null>(null);
  selectedRef.current = selected;
  panelOpenRef.current = panelOpen;
  exploreRequestRef.current = exploreRequest;
  onSelectRef.current = onSelect;
  onArrivalRef.current = onArrival;

  useEffect(() => {
    let cancelled = false;
    let loadingTimeout = 0;
    let previewed: string | null = null;
    setReady(false);
    setUnavailable(false);
    if (!arrivalRead.current) {
      arrivalRead.current = true;
      try {
        const flight = readFlightHandoff(window.sessionStorage);
        settledRef.current = flight.arrival && flight.settled === true && !reduced;
        arrivalRef.current = flight.arrival && !settledRef.current && !reduced;
        arrivalPoseRef.current = flight.pose;
        arrivalImageRef.current = reduced ? undefined : flight.image;
        softwareGraphicsHintRef.current = flight.softwareGraphics;
        setArrivalPoster(arrivalImageRef.current ?? null);
      } catch {
        // Private storage and a stale marker must not block the console.
      }
    }
    if ((arrivalRef.current || settledRef.current) && !reduced) onArrivalRef.current(true);
    if (!arrivalImageRef.current || reduced) removeFlightBridge();
    const failed = () => {
      if (cancelled) return;
      window.clearTimeout(loadingTimeout);
      removeFlightBridge();
      setArrivalPoster(null);
      setUnavailable(true);
      setReady(false);
      settledRef.current = false;
      onArrivalRef.current(false);
    };
    // A stalled module import or renderer must not keep the document covered.
    loadingTimeout = window.setTimeout(failed, 8000);
    const onRecord = (event: Event) => {
      const detail = (event as CustomEvent<{ status?: string }>).detail;
      if (detail && detail.status !== "rejected") scene.current?.emitTransfer();
    };
    window.addEventListener("agyion:record", onRecord);
    const onPreview = (event: Event) => {
      const id = (event as CustomEvent<{ id?: unknown }>).detail?.id;
      previewed = typeof id === "string" ? id : null;
      scene.current?.previewInstrument(previewed);
    };
    window.addEventListener("agyion:instrument-preview", onPreview);
    const observer = new IntersectionObserver(([entry]) => {
      visibleRef.current = entry.isIntersecting;
      scene.current?.setPaused(!entry.isIntersecting);
    }, { rootMargin: "80px" });
    if (host.current) observer.observe(host.current);
    performance.mark("agyion:scene-effect");
    (sceneModule ?? import("../../../../shared/space-scene")).then(({ createOrbitalScene }) => {
      if (cancelled || !host.current) return;
      performance.mark("agyion:scene-module-ready");
      try {
        scene.current = createOrbitalScene(host.current, {
          mode: "station", reducedMotion: reduced, interactive: true, arrival: arrivalRef.current, arrivalPose: arrivalPoseRef.current,
          softwareGraphicsHint: softwareGraphicsHintRef.current,
          arrivalRevealMs: arrivalImageRef.current ? ARRIVAL_REVEAL_MS : 0, framePanel: false,
          onSelect: (id) => onSelectRef.current(id),
          onReady: () => {
            if (cancelled) return;
            performance.mark("agyion:scene-first-frame");
            window.clearTimeout(loadingTimeout);
            setReady(true);
            setUnavailable(false);
            if (arrivalRef.current && !reduced) {
              onArrivalRef.current(true);
            } else if (reduced) {
              arrivalRef.current = false;
              settledRef.current = false;
              arrivalPoseRef.current = undefined;
              arrivalImageRef.current = undefined;
            }
          },
          onArrivalComplete: () => {
            if (!cancelled) {
              arrivalRef.current = false;
              settledRef.current = false;
              arrivalPoseRef.current = undefined;
              arrivalImageRef.current = undefined;
              setArrivalPoster(null);
              removeFlightBridge();
              onArrivalRef.current(false);
            }
          },
          onError: failed,
        });
        scene.current.setSelected(selectedRef.current);
        // The selected form can project over the shared endpoint immediately.
        // Its first mount must not start a second camera journey under the cover.
        if (settledRef.current) scene.current.setPanelOpen(panelOpenRef.current, { focus: false });
        else scene.current.setPanelOpen(panelOpenRef.current);
        if (previewed !== null) scene.current.previewInstrument(previewed);
        if (exploreRequestRef.current > 0 && !panelOpenRef.current) scene.current.explore();
        scene.current.setPaused(!visibleRef.current);
      } catch {
        failed();
      }
    }).catch(failed);
    return () => {
      cancelled = true;
      window.clearTimeout(loadingTimeout);
      removeFlightBridge();
      onArrivalRef.current(false);
      window.removeEventListener("agyion:record", onRecord);
      window.removeEventListener("agyion:instrument-preview", onPreview);
      observer.disconnect();
      scene.current?.dispose();
      scene.current = null;
    };
  }, [reduced]);

  useLayoutEffect(() => {
    if (!ready) return;
    // Keep the document cover until React has committed both renderer readiness
    // and the parent's arriving class, then release before painting. Waiting for
    // a passive effect would keep the frozen cover over the ready, live scene.
    removeFlightBridge();
    if (settledRef.current) {
      settledRef.current = false;
      arrivalPoseRef.current = undefined;
      arrivalImageRef.current = undefined;
      onArrivalRef.current(false);
    }
    if (!arrivalPoster) return;
    if (reduced) { setArrivalPoster(null); return; }
    const timer = window.setTimeout(() => setArrivalPoster(null), ARRIVAL_REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [ready, arrivalPoster, reduced]);

  useEffect(() => { scene.current?.setSelected(selected); }, [selected, selectionRequest]);
  useEffect(() => { scene.current?.setPanelOpen(panelOpen); }, [panelOpen]);
  useEffect(() => {
    if (exploreRequest > 0) scene.current?.explore();
  }, [exploreRequest]);

  return (
    <>
      <div className={`orbital-backdrop ${ready ? "is-ready" : ""} ${arrivalPoster ? "has-arrival-poster" : ""}`}>
        <svg className="orbital-fallback" viewBox="0 0 1440 550" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <radialGradient id="corona"><stop offset=".43" stopColor="#080a0e"/><stop offset=".45" stopColor="#ffe8bb"/><stop offset=".47" stopColor="#bd8654"/><stop offset=".6" stopColor="#452e22" stopOpacity=".35"/><stop offset="1" stopColor="#07090d" stopOpacity="0"/></radialGradient>
          </defs>
          <circle cx="1000" cy="220" r="270" fill="url(#corona)"/>
          <ellipse cx="1000" cy="225" rx="410" ry="25" fill="none" stroke="#e8b77b" strokeWidth="3" opacity=".65" transform="rotate(-9 1000 225)"/>
          <g transform="translate(580 320) rotate(-25)" fill="#171d25" stroke="#7e838b" strokeWidth="2">
            <circle r="88" fill="none" strokeWidth="9"/><circle r="17"/>
            {[0, 90, 180, 270].map((angle) => <path key={angle} d="M0 16V85" transform={`rotate(${angle})`}/>)}
            {Array.from({ length: 12 }, (_, i) => <rect key={i} x="-13" y="-103" width="26" height="33" rx="2" transform={`rotate(${i * 30})`}/>)}
          </g>
        </svg>
        <div className="orbital-canvas" ref={host} />
        {arrivalPoster && (
          // This is an already encoded local canvas frame; image optimization would delay the handoff.
          // eslint-disable-next-line @next/next/no-img-element
          <img className="orbital-arrival-poster" src={arrivalPoster} alt="" aria-hidden="true" draggable={false} onError={() => { setArrivalPoster(null); removeFlightBridge(); }} />
        )}
      </div>
      {unavailable && <span className="scene-fallback-note" role="status">3D view unavailable. Use the instrument tabs to continue.</span>}
    </>
  );
}
