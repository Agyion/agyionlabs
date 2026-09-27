"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { usePrivateVault } from '../../lib/privateVault';
import { readPrivateBackupRelease } from '../../lib/private/backup-release';

/** Shared local key recovery controls for the experimental private instruments.
 * Funding is separately gated by the coordinator and the controller's checked
 * capability; a displayed status never authorizes a transaction by itself.
 */
export default function PrivateVault({ allowCreate = true, releaseKey, selectRelease }: { allowCreate?: boolean; releaseKey?: string; selectRelease?(key: string): void }) {
  const { state, controller } = usePrivateVault();
  const [password, setPassword] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [otherPool, setOtherPool] = useState<{ key: string; label: string } | null>(null);
  const generation = useRef(0), currentController = useRef(controller);
  currentController.current = controller;
  const fileInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const busy = state.busy !== null || reading;
  const locked = state.status === 'locked';

  const clearFields = useCallback(() => {
    setPassword(''); setFile(null);
    if (fileInput.current) fileInput.current.value = '';
    if (passwordInput.current) passwordInput.current.value = '';
  }, []);
  useEffect(() => { clearFields(); setNotice(null); setOtherPool(null); setReading(false); return () => { generation.current++; }; }, [controller, clearFields]);
  useEffect(() => { if (locked) clearFields(); }, [locked, clearFields]);
  const chooseFile = async (selected: File | null) => {
    const token = ++generation.current, owner = controller;
    setFile(null); setPassword(''); if (passwordInput.current) passwordInput.current.value = '';
    setOtherPool(null); setNotice(null); setReading(false);
    if (!selected) { clearFields(); return; }
    if (!releaseKey) { setFile(selected); return; }
    setReading(true);
    try {
      const hint = await readPrivateBackupRelease(selected);
      if (token !== generation.current || currentController.current !== owner) return;
      if (hint.key === releaseKey) setFile(selected);
      else {
        clearFields();
        if (selectRelease) setOtherPool({ key: hint.key, label: hint.label });
        else setNotice('This backup belongs to a different private pool.');
      }
    } catch {
      if (token === generation.current && currentController.current === owner) { clearFields(); setNotice('This backup does not identify a supported private pool.'); }
    } finally {
      if (token === generation.current && currentController.current === owner) setReading(false);
    }
  };
  const selectedAction = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || busy) return;
    const selected = file, secret = password, token = generation.current, owner = controller;
    clearFields(); setNotice(null);
    try {
      if (locked) await controller.restore(selected, secret);
      else await controller.checkSavedBackup(selected, secret);
      if (token === generation.current && currentController.current === owner) setNotice('Saved backup opened and all current keys matched.');
    } catch { /* Controller publishes a safe error without file/password data. */ }
  };
  const download = async () => {
    if (busy) return;
    const secret = password, token = generation.current, owner = controller;
    setPassword('');
    if (passwordInput.current) passwordInput.current.value = '';
    setNotice(null);
    let url: string | undefined;
    try {
      const encrypted = await controller.downloadBackup(secret);
      if (token !== generation.current || currentController.current !== owner) return;
      url = URL.createObjectURL(encrypted.blob);
      const link = document.createElement('a');
      link.href = url; link.download = encrypted.filename;
      document.body.append(link);
      try { link.click(); } finally { link.remove(); }
      setNotice('Save the encrypted file, then select that saved file below to check it.');
    } catch {
      if (token === generation.current && currentController.current === owner) setNotice('The backup download did not complete. Try again before using private funds.');
    } finally {
      // Let the browser consume the download URL before releasing encrypted data.
      if (url) { const released = url; window.setTimeout(() => URL.revokeObjectURL(released), 1000); }
    }
  };

  return <section className="instrument-section" aria-label="Private key vault">
    <header>
      <h3>Private key vault</h3>
      <p>Experimental testnet. Keep the encrypted backup and its password outside this app.</p>
    </header>
    <p role="status">{busy ? 'Working locally…' : locked ? 'Vault locked' : state.status === 'ready' ? 'Current backup checked' : 'Save and check your backup before funding'}</p>
    {state.error && <p role="alert">{state.error}</p>}
    {notice && <p>{notice}</p>}
    {otherPool && <p>This backup identifies {otherPool.label}. <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => { const key = otherPool.key; generation.current++; clearFields(); setOtherPool(null); setNotice(null); try { selectRelease?.(key); } catch { setNotice('The private pool could not be selected.'); } }}>Switch to {otherPool.label}</button> Reselect the saved file after switching. Its encrypted contents still need to be verified.</p>}
    {locked && allowCreate && <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => {
      if (!allowCreate || busy) return; generation.current++; clearFields(); setOtherPool(null); setNotice(null); void controller.create().catch(() => {});
    }}>Create a private vault</button>}
    <form onSubmit={selectedAction}>
      <label className="instrument-field">
        <span className="field-label">Backup password</span>
        <input ref={passwordInput} className="field-input" type="password" value={password} onChange={event => setPassword(event.target.value)} minLength={12} maxLength={1024} autoComplete="off" spellCheck={false} disabled={busy} required />
      </label>
      {!locked && <button className="btn btn-secondary" type="button" disabled={busy || password.length < 12} onClick={() => { void download(); }}>Download encrypted backup</button>}
      <label className="instrument-field">
        <span className="field-label">{locked ? 'Saved vault backup' : 'Reselect your saved backup'}</span>
        <input ref={fileInput} type="file" accept="application/json,.json" disabled={busy} onChange={event => {
          void chooseFile(event.target.files?.[0] ?? null);
        }} required />
      </label>
      <button className="btn btn-primary" type="submit" disabled={busy || !file || password.length < 12}>{locked ? 'Restore saved vault' : 'Check saved backup'}</button>
    </form>
    {!locked && <p>{state.grants.length} private grants. Adding a grant requires a new complete backup.</p>}
    {(busy || !locked) && <button className="btn btn-secondary" type="button" onClick={() => { generation.current++; clearFields(); setReading(false); setOtherPool(null); setNotice(null); controller.lock(); }}>{locked ? 'Cancel and lock' : 'Lock and forget local keys'}</button>}
    {!locked && <p>Without the saved backup and password, lost keys cannot be recovered.</p>}
  </section>;
}
