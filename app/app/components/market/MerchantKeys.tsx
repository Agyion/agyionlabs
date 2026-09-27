"use client";

import { useEffect, useRef, useState } from 'react';
import { createMerchantKey, exportMerchantKey, restoreMerchantKey, checkMerchantKeyBackup, merchantKeyBackupChecked, forgetMerchantKey, type MerchantKeyHandle } from '../../../../market/client/merchant-vault';
import { getMarketRelease } from '../../../../market/client/release';
import type { Merchant } from '../../../../market/client/spec';
import { publicDownload } from '../../lib/market/forms';
import { useMarketSession, marketError } from './MarketSession';

export default function MerchantKeys({ merchant, merchantKnown = true, active = true, onKey, onRegistered }: { merchant: Merchant | null; merchantKnown?: boolean; active?: boolean; onKey(key: MerchantKeyHandle | null): void; onRegistered(): Promise<void> }) {
  const { account, protocol, busy, execute } = useMarketSession();
  const [handle, setHandle] = useState<MerchantKeyHandle | null>(null);
  const handleRef = useRef<MerchantKeyHandle | null>(null);
  const [password, setPassword] = useState(''), [file, setFile] = useState<File | null>(null);
  const [restoreEpoch, setRestoreEpoch] = useState(String(merchant?.epoch ?? 1));
  const [working, setWorking] = useState(false), [checked, setChecked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  const operation = useRef(0), workingRef = useRef(false);
  const callback = useRef(onKey), observedEpoch = useRef(merchant?.epoch ?? 1); callback.current = onKey; observedEpoch.current = merchant?.epoch ?? 1;
  useEffect(() => {
    const workOperation = operation, keyHandle = handleRef, keyCallback = callback;
    workOperation.current++; workingRef.current = false;
    setHandle(null); setChecked(false); setPassword(''); setFile(null); setWorking(false); setNotice(null); setError(null);
    setRestoreEpoch(String(observedEpoch.current));
    return () => { workOperation.current++; if (keyHandle.current) forgetMerchantKey(keyHandle.current); keyHandle.current = null; keyCallback.current(null); };
    // Registration refreshes must preserve the checked key. Scope changes revoke it.
  }, [account, protocol, active]);
  useEffect(() => { if (!handle) setRestoreEpoch(String(merchant?.epoch ?? 1)); }, [merchant?.epoch, handle]);
  const replace = (next: MerchantKeyHandle | null) => {
    if (handleRef.current) forgetMerchantKey(handleRef.current);
    handleRef.current = next; setHandle(next); setChecked(false); onKey(next);
  };
  const run = async (task: (assertCurrent: () => void) => Promise<void>) => {
    if (workingRef.current || busy || !active || !account) return;
    const ticket = ++operation.current; workingRef.current = true; setWorking(true); setError(null); setNotice(null);
    const assertCurrent = () => { if (ticket !== operation.current) throw new Error('Merchant session changed.'); };
    try { assertCurrent(); await task(assertCurrent); } catch { if (ticket === operation.current) setError('The merchant key could not be checked. Verify the saved file, password and key epoch.'); }
    finally { if (ticket === operation.current) { workingRef.current = false; setWorking(false); } }
  };
  const scope = (epoch: number) => {
    const release = getMarketRelease(); if (!account || !Number.isInteger(epoch) || epoch < 1) throw new Error('Merchant scope required.');
    return { networkId: release.networkId, contract: release.contract, seller: account, keyEpoch: epoch };
  };
  const restore = () => run(async () => {
    if (!file) throw new Error('Choose a backup.');
    const ticket = operation.current, key = await restoreMerchantKey(file, password, scope(Number(restoreEpoch)));
    if (ticket !== operation.current) { forgetMerchantKey(key); return; }
    try { await checkMerchantKeyBackup(key, file, password); } catch (error) { forgetMerchantKey(key); throw error; }
    if (ticket !== operation.current) { forgetMerchantKey(key); return; }
    replace(key); setChecked(true); setPassword(''); onKey(key); setNotice('Saved merchant key checked.');
  });
  const registered = active && handle && handle.scope.seller === account && merchant && handle.scope.keyEpoch === merchant.epoch && handle.publicKey === merchant.public_key.toString('hex');
  const canRegister = active && merchantKnown && handle && handle.scope.seller === account && checked && merchantKeyBackupChecked(handle) && handle.scope.keyEpoch === (merchant?.epoch ?? 0) + 1;
  return <section className="market-key-vault" aria-label="Merchant signing key">
    <div className="market-section-heading"><div><h3>Merchant key</h3><p>{registered ? 'Registered key is ready' : !merchantKnown ? 'Checking merchant registration' : merchant ? `Registered epoch ${merchant.epoch}` : 'Register a key for your shop'}</p></div>
      {handle && <button type="button" className="btn btn-secondary" disabled={working || busy} onClick={() => { replace(null); setPassword(''); setFile(null); }}>Lock key</button>}</div>
    {!handle && <div className="market-actions"><button type="button" className="btn btn-secondary" disabled={!active || !merchantKnown || !account || working || busy} onClick={() => {
      if (!active || !merchantKnown || !account) return;
      try { replace(createMerchantKey(scope((merchant?.epoch ?? 0) + 1))); setNotice('Save and check the encrypted backup before registration.'); } catch (e) { setError(marketError(e)); }
    }}>{merchant ? 'Prepare key rotation' : 'Create merchant key'}</button></div>}
    {handle && <p className="market-caption">Key epoch {handle.scope.keyEpoch} · {handle.publicKey.slice(0, 12)}…{handle.publicKey.slice(-8)}{checked && merchantKeyBackupChecked(handle) ? ' · Backup checked' : ' · Backup required'}</p>}
    {(!handle || !checked) && <>
      <div className="market-form-grid"><label>Backup password<input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} disabled={!active || working} /></label>
        {!handle && <label>Backup key epoch<input inputMode="numeric" value={restoreEpoch} onChange={e => setRestoreEpoch(e.target.value)} disabled={!active || working} /></label>}
        <label className="market-form-wide">Saved encrypted backup<input type="file" accept=".json,application/json" disabled={!active || working} onChange={e => setFile(e.target.files?.[0] ?? null)} /></label></div>
      <div className="market-actions">
        {handle && <button type="button" className="btn btn-secondary" disabled={!active || working || password.length < 12} onClick={() => void run(async () => {
          const ticket = operation.current, packet = await exportMerchantKey(handle, password);
          if (ticket !== operation.current) return;
          publicDownload(`agyion-merchant-epoch-${handle.scope.keyEpoch}.json`, packet); setNotice('Select the saved file below to verify the backup.');
        })}>Save encrypted backup</button>}
        <button type="button" className="btn btn-primary" disabled={!active || !file || !password || working || busy} onClick={() => handle ? void run(async () => {
          const ticket = operation.current; await checkMerchantKeyBackup(handle, file!, password);
          if (ticket !== operation.current) return;
          setChecked(true); setPassword(''); onKey(handle); setNotice('Saved backup checked.');
        }) : void restore()}>{working ? 'Checking…' : handle ? 'Check saved file' : 'Restore saved key'}</button>
      </div><p className="market-caption">Use a password of at least 12 characters. This key signs listing and pickup authorizations.</p>
    </>}
    {canRegister && <><p className="market-caption">{merchant ? 'Keep earlier backups for already reserved pickups. Rotation changes the key for new authorizations.' : 'Registration binds this signing key to your connected wallet.'}</p><button type="button" className="btn btn-primary" disabled={busy || working} onClick={() => void run(async assertCurrent => {
      if (!merchantKnown || !merchantKeyBackupChecked(handle)) throw new Error('Merchant backup required.');
      assertCurrent();
      const result = await execute({ action: 'register_merchant', publicKey: handle.publicKey, expectedEpoch: (merchant?.epoch ?? 0) + 1 });
      assertCurrent();
      if (result?.status === 'confirmed') { await onRegistered(); assertCurrent(); setNotice('Merchant key registered on testnet.'); }
      else if (result) setNotice('Registration is not confirmed. Check Recovery.');
    })}>{merchant ? 'Confirm key rotation' : 'Register merchant key'}</button></>}
    {notice && <p role="status" className="market-notice">{notice}</p>}{error && <p role="alert" className="market-error">{error}</p>}
  </section>;
}
