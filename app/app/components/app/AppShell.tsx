/* eslint-disable @next/next/no-html-link-for-pages -- The root belongs to the separate Vite landing; a full document navigation is required. */
"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWallet } from "../../lib/useWallet";
import { IS_MOCK } from "../../lib/config";
import WalletBar from "./WalletBar";
import FadePanel from "./FadePanel";
import PodPanel from "./PodPanel";
import TriggerPanel from "./TriggerPanel";
import EnvoyPanel from "./EnvoyPanel";
import LedgerPanel from "./LedgerPanel";
import RampPanel from "./RampPanel";
import { InstrumentActivity } from "../../lib/instrumentActivity";
import { getClient } from "../../lib/client";
import { useProtocolReadiness } from "../../lib/useProtocolReadiness";
import { TransactionAvailability } from "../ui";
import ProtocolStatus from "./ProtocolStatus";
import TransactionActivity from "./TransactionActivity";
import OrbitalBackdrop from "./OrbitalBackdrop";

const TABS = [
  { id: "fade", label: "Fade", note: "Falling prices" },
  { id: "pod", label: "Pod", note: "Timed savings" },
  { id: "trigger", label: "Trigger", note: "Payment approvals" },
  { id: "envoy", label: "Envoy", note: "Delegated claims" },
  { id: "ramp", label: "Ramp", note: "Test transfers" },
  { id: "ledger", label: "Ledger", note: "Receipts" },
] as const;
const HELP = {
  fade: ["Set a falling price", "Claim at the current price", "Settle with venue proof"],
  pod: ["Save a secret and lock funds", "Reach the unlock ledger", "Sign locally for your recipient wallet"],
  trigger: ["Fund the escrow", "Attester signs its proof", "Submit proof, or refund after expiry"],
  envoy: ["Authorize one agent", "Up to 50 claims at price ≤ 0", "Payments go to the mandate owner"],
  ramp: ["Authenticate your test wallet", "Register a test deposit or withdrawal", "Follow the anchor’s transaction status"],
  ledger: ["Review this device’s activity", "Recheck uncertain transactions", "Open the matching record"],
} as const;
type TabId = (typeof TABS)[number]["id"];
const validTab = (id: string | null): TabId => TABS.find((t) => t.id === id)?.id ?? "fade";
const previewInstrument = (id: TabId | null) => {
  window.dispatchEvent(new CustomEvent("agyion:instrument-preview", { detail: { id } }));
};

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const motionServerSnapshot = () => false;
const motionSnapshot = () => window.matchMedia(MOTION_QUERY).matches;
const subscribeMotion = (onChange: () => void) => {
  const preference = window.matchMedia(MOTION_QUERY);
  preference.addEventListener("change", onChange);
  return () => preference.removeEventListener("change", onChange);
};

export default function AppShell() {
  const wallet = useWallet();
  // getClient caches by wallet-session version, including signer replacement.
  const client = (() => { try { return getClient(); } catch { return null; } })();
  const readiness = useProtocolReadiness(client);
  const params = useSearchParams();
  const router = useRouter();
  // A stable first snapshot keeps server markup and hydration in agreement.
  const reduced = useSyncExternalStore(subscribeMotion, motionSnapshot, motionServerSnapshot);
  const queryTab = params.get("tab");
  const tab = validTab(queryTab);
  const [deck, setDeck] = useState({ owner: wallet.address, epoch: 0, visited: [tab] as TabId[] });
  // A first connection keeps an unsigned draft. Changing or disconnecting an
  // established wallet discards its in-memory secrets and instrument state.
  if (deck.owner !== wallet.address) {
    setDeck({ owner: wallet.address, epoch: deck.epoch + (deck.owner !== null ? 1 : 0),
      visited: deck.owner !== null ? [tab] : [...new Set([...deck.visited, tab])] });
  } else if (!deck.visited.includes(tab)) {
    setDeck({ ...deck, visited: [...deck.visited, tab] });
  }
  const [helpOpen, setHelpOpen] = useState(false);
  const helpButton = useRef<HTMLButtonElement>(null);
  const [arrival, setArrival] = useState(false);
  const [panelOpen, setPanelOpen] = useState(() => queryTab !== null);
  const [selectionRequest, setSelectionRequest] = useState(0);
  const appRoot = useRef<HTMLElement>(null);
  const topbar = useRef<HTMLElement>(null);
  const workspace = useRef<HTMLElement | null>(null);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const consolePanel = useRef<HTMLElement>(null);
  const drawerScroll = useRef<HTMLDivElement>(null);

  const recordRef = params.get("ref");
  useEffect(() => { setPanelOpen(queryTab !== null); setHelpOpen(false); }, [queryTab]);
  useEffect(() => {
    if (recordRef && /^\d+$/.test(recordRef) && recordRef.length <= 20 && BigInt(recordRef) <= 0xffff_ffff_ffff_ffffn) {
      window.dispatchEvent(new CustomEvent("agyion:open-record", { detail: { tab, id: recordRef } }));
    }
  }, [tab, recordRef, deck.epoch]);
  useEffect(() => {
    if (drawerScroll.current) drawerScroll.current.scrollTop = 0;
    if (workspace.current) workspace.current.scrollTop = 0;
  }, [tab]);

  useEffect(() => {
    const header = topbar.current;
    const root = appRoot.current;
    if (!header || !root) return;
    const measure = () => {
      const height = Math.ceil(header.getBoundingClientRect().height);
      const value = `${height}px`;
      if (height > 0 && root.style.getPropertyValue("--station-top") !== value) {
        root.style.setProperty("--station-top", value);
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    // Only overlay positions use this value; the full-viewport scene never resizes.
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!panelOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (helpOpen) { setHelpOpen(false); helpButton.current?.focus(); return; }
      setPanelOpen(false);
      buttons.current[TABS.findIndex((instrument) => instrument.id === tab)]?.focus();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [panelOpen, tab, helpOpen]);

  const select = useCallback((id: string) => {
    if (!TABS.some((instrument) => instrument.id === id)) return;
    setPanelOpen(true);
    if (id === tab) setSelectionRequest((request) => request + 1);
    if (id !== tab) router.push(`/app/?tab=${id}`, { scroll: false });
  }, [router, tab]);
  const selected = TABS.find((t) => t.id === tab)!;
  const openConsole = () => {
    setPanelOpen(true);
    setSelectionRequest((request) => request + 1);
    window.requestAnimationFrame(() => consolePanel.current?.focus({ preventScroll: true }));
  };

  return (
    <main ref={appRoot} data-protocol-readiness={readiness.status} className={`station-app ${arrival && !reduced ? "station-arriving" : ""} ${panelOpen ? "is-panel-open" : ""}`}>
      <button className="station-skip" type="button" onClick={openConsole}>Skip to console</button>
      <header ref={topbar} className="station-topbar">
        <a href="/" className="station-brand" aria-label="Agyion labs home">
          <svg viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="16" cy="16" rx="14" ry="5" transform="rotate(-30 16 16)"/><circle cx="16" cy="16" r="8"/></svg>
          agyion<span>labs</span>
        </a>
        <WalletBar wallet={wallet} />
      </header>

      <section className="station-vista" id="orbit" aria-label="Orbital station">
        <OrbitalBackdrop selected={tab} reduced={reduced} onSelect={select} onArrival={setArrival} exploreRequest={0} selectionRequest={selectionRequest} panelOpen={panelOpen} />
        <div className="station-vista__heading" aria-hidden={panelOpen}>
          <p className="station-kicker">{IS_MOCK ? "Local simulation" : "Stellar testnet"}</p>
          <div className="station-instrument-title" key={tab}>
            <h1>{selected.label}</h1>
            <p className="station-intro">{selected.note}</p>
          </div>
          <button className="station-open-instrument" type="button" tabIndex={panelOpen ? -1 : 0} onClick={openConsole}>Open {selected.label} <span aria-hidden="true">↓</span></button>
        </div>
        <div className="station-scene-footer">
          <p className="station-orbit-help" id="orbit-controls"><span className="station-pointer-help">Drag to orbit · Scroll to approach</span><span className="station-touch-help">Drag to orbit · Pinch to approach</span></p>
          <nav className="station-dock" role="tablist" aria-label="Console instruments">
            {TABS.map((t, i) => (
              <button ref={(el) => { buttons.current[i] = el; }} key={t.id} type="button" role="tab"
                id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1} onClick={() => select(t.id)}
                onPointerEnter={(event) => { if (event.pointerType === "mouse") previewInstrument(t.id); }}
                onPointerLeave={() => previewInstrument(null)}
                onFocus={() => previewInstrument(t.id)} onBlur={() => previewInstrument(null)}
                onKeyDown={(event) => {
                  let next = i;
                  if (event.key === "ArrowRight") next = (i + 1) % TABS.length;
                  else if (event.key === "ArrowLeft") next = (i + TABS.length - 1) % TABS.length;
                  else if (event.key === "Home") next = 0;
                  else if (event.key === "End") next = TABS.length - 1;
                  else return;
                  event.preventDefault(); buttons.current[next]?.focus(); select(TABS[next].id);
                }}>
                <span className="station-dock__name">{t.label}</span>
              </button>
            ))}
          </nav>
        </div>

      <aside ref={(element) => { workspace.current = element; if (element) element.inert = !panelOpen; }} className="station-workspace" data-instrument={tab} aria-label={`${selected.label} instrument`} aria-hidden={!panelOpen}>
        <div className="station-workspace-header">
          <div className="station-workspace-title" key={tab}>
            <h2>{selected.label}</h2>
          </div>
          <div className="station-workspace-tools">
            <button ref={helpButton} type="button" aria-label={`About ${selected.label}`} aria-expanded={helpOpen} aria-controls="instrument-help" onClick={() => setHelpOpen(open => !open)}>Help <span aria-hidden="true">{helpOpen ? "−" : "+"}</span></button>
            <button type="button" onClick={() => { setPanelOpen(false); buttons.current[TABS.findIndex((instrument) => instrument.id === tab)]?.focus(); }} aria-label="Close instrument">
              <span>Return to orbit</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </div>
        </div>
        <div ref={drawerScroll} className="station-drawer-scroll">
        {tab !== "ramp" && tab !== "ledger" && <ProtocolStatus readiness={readiness} />}
        <TransactionActivity wallet={wallet} />
        {helpOpen && <section id="instrument-help" className="station-help" aria-label={`How ${selected.label} works`}>
          <ol>{HELP[tab].map((step, index) => <li key={step}><span>0{index + 1}</span>{step}</li>)}</ol>
          <p>{tab === "pod" ? "Keep the secret outside the app; never reuse it. Only its signature is submitted. Amounts and wallet addresses remain public." : tab === "ramp" ? "Test sandbox only. No real bank transfer or currency exchange." : tab === "ledger" ? "Local history is not proof of settlement. Check the network result." : "A transaction must be submitted and confirmed for funds to move."}</p>
        </section>}
        <TransactionAvailability.Provider value={readiness.status === "ready"}><div key={deck.epoch}>
          {TABS.map(instrument => <section ref={instrument.id === tab ? consolePanel : undefined} key={instrument.id} className="station-console" role="tabpanel" id={`panel-${instrument.id}`} aria-labelledby={`tab-${instrument.id}`} tabIndex={-1} hidden={instrument.id !== tab}>
            {deck.visited.includes(instrument.id) && <InstrumentActivity.Provider value={panelOpen && instrument.id === tab}>
              {instrument.id === "fade" && <FadePanel wallet={wallet} />}
              {instrument.id === "pod" && <PodPanel wallet={wallet} />}
              {instrument.id === "trigger" && <TriggerPanel wallet={wallet} />}
              {instrument.id === "envoy" && <EnvoyPanel wallet={wallet} active={panelOpen && tab === "envoy"} />}
              {instrument.id === "ramp" && <RampPanel wallet={wallet} />}
              {instrument.id === "ledger" && <LedgerPanel wallet={wallet} />}
            </InstrumentActivity.Provider>}
          </section>)}
        </div></TransactionAvailability.Provider>
        </div>
        <footer className="station-workspace-footer">
          <p><span className="station-network-dot" aria-hidden="true" />{IS_MOCK ? "Simulation · Test assets" : "Testnet · Test assets only"}</p>
          <a href="https://github.com/Agyion/agyionlabs" target="_blank" rel="noopener noreferrer">Source <span aria-hidden="true">↗</span></a>
        </footer>
      </aside>
      </section>
    </main>
  );
}
