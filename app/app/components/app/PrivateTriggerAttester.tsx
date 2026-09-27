"use client";

import { useEffect, useRef, useState } from 'react';
import type { PrivateTriggerAttester as AttesterHandle } from '../../../../privacy/src/credentials.mjs';
import { usePrivateWorkspace } from './PrivateWorkspaceProvider';
import { usePrivateVault } from '../../lib/privateVault';
import { readPrivateFile } from '../../lib/privateWorkspaceInputs';
import { Field, TextInput } from '../ui';

const load = () => import('../../../../privacy/src/credentials.mjs');
function save(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link);
  try { link.click(); } finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
/** The reviewer key is independent of the spending vault. Only its public
 * point and signed receipt leave this control; secret scalar export is absent. */
export default function PrivateTriggerAttester({ active }: { active: boolean }) {
  const { scope, protocol, snapshot, vault } = usePrivateWorkspace();
  const { state: vaultState } = usePrivateVault();
  const handle = useRef<AttesterHandle | null>(null);
  const apiRef = useRef<Awaited<ReturnType<typeof load>> | null>(null);
  const generation = useRef(0);
  const [point, setPoint] = useState<readonly [string, string] | null>(null);
  const [checked, setChecked] = useState(false);
  const [password, setPassword] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [noteId, setNoteId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const clearFields = () => { setPassword(''); setFile(null); if (input.current) input.current.value = ''; };
  const lock = () => {
    generation.current++; const prior = handle.current; handle.current = null;
    if (prior) apiRef.current?.forgetTriggerAttester(prior);
    busyRef.current = false; setBusy(false); setPoint(null); setChecked(false); setNoteId(''); clearFields();
  };
  useEffect(() => {
    if (!active || vaultState.status === 'locked') lock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, vaultState.status]);
  useEffect(() => {
    // Both old and new vaults may be ready. Identity changes must still forget
    // the prior independent reviewer key and invalidate pending decryptions.
    lock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault, scope]);
  useEffect(() => () => {
    generation.current++; const prior = handle.current; handle.current = null;
    if (prior) apiRef.current?.forgetTriggerAttester(prior);
  }, []);
  const run = async (work: (api: Awaited<ReturnType<typeof load>>, guard: () => void) => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null);
    const token = generation.current;
    const guard = () => { if (token !== generation.current) throw new Error('Attester locked.'); };
    try { const api = await load(); guard(); apiRef.current = api; await work(api, guard); guard(); }
    catch { if (token === generation.current) setError('The local attester operation failed. Check the saved key, credential and selected position.'); }
    finally { if (token === generation.current) { busyRef.current = false; setBusy(false); } }
  };
  const disabled = busy || vaultState.status !== 'ready' || !scope;
  return <details className="instrument-technical private-attester"><summary>Review a Trigger condition</summary>
    <p>The reviewer signs only after checking the real condition. Import the received reviewer credential above. Keep this separate encrypted reviewer key.</p>
    {!point && <button type="button" className="btn btn-secondary px-4 py-2" disabled={disabled} onClick={() => void run(async (api, guard) => {
      if (!scope || handle.current) throw new Error('A scoped new key is required.');
      const created = api.createTriggerAttester(scope); guard(); handle.current = created; setPoint(created.publicPoint); setChecked(false);
    })}>Create reviewer key</button>}
    <Field label="Reviewer key password"><TextInput type="password" autoComplete="off" maxLength={1024} value={password} disabled={disabled} onChange={event => setPassword(event.target.value)} /></Field>
    {point && <button type="button" className="btn btn-secondary px-4 py-2" disabled={disabled || password.length < 12} onClick={() => { const secret = password; setPassword(''); void run(async (api, guard) => { const encrypted = await api.backupTriggerAttester(handle.current!, secret); guard(); save(encrypted, 'agyion-trigger-reviewer-encrypted.json'); }); }}>Download encrypted reviewer key</button>}
    <Field label="Saved encrypted reviewer key"><input ref={input} type="file" accept="application/json,.json" disabled={disabled} onChange={event => setFile(event.target.files?.[0] ?? null)} /></Field>
    <button type="button" className="btn btn-secondary px-4 py-2" disabled={disabled || !file || password.length < 12} onClick={() => {
      if (!file || !scope) return; const selected = file, secret = password; clearFields(); setChecked(false);
      void run(async (api, guard) => {
        const packet = await readPrivateFile(selected); guard();
        if (handle.current) { await api.checkTriggerAttesterBackup(handle.current, packet, secret); guard(); setChecked(true); }
        else {
          let restored: AttesterHandle | null = await api.restoreTriggerAttester(packet, secret, scope);
          try { guard(); await api.checkTriggerAttesterBackup(restored, packet, secret); guard(); handle.current = restored; setPoint(restored.publicPoint); setChecked(true); restored = null; }
          finally { if (restored) api.forgetTriggerAttester(restored); }
        }
      });
    }}>{point ? 'Check saved reviewer key' : 'Restore reviewer key'}</button>
    {point && <><p>{checked ? 'Saved reviewer key checked' : 'Save and check this key before signing.'}</p><Field label="Reviewer public point"><TextInput value={JSON.stringify(point)} readOnly /></Field><button type="button" className="btn btn-secondary px-4 py-2" disabled={!checked || disabled} onClick={() => { const current = handle.current; if (current) save({ version: '1', kind: 'TriggerAttesterPublicKey', scope: current.scope, publicPoint: current.publicPoint }, 'agyion-trigger-reviewer-public.json'); }}>Download reviewer public key</button></>}
    <Field label="Trigger to attest"><select className="field-input" value={noteId} disabled={disabled} onChange={event => setNoteId(event.target.value)}><option value="">Choose a received Trigger</option>{snapshot.notes.filter(note => note.kind === 'trigger').map(note => <option value={note.id} key={note.id}>{note.id.slice(0, 12)}…</option>)}</select></Field>
    <button type="button" className="btn btn-primary px-5 py-3" disabled={disabled || !checked || !noteId || !protocol} onClick={() => void run(async (_api, guard) => {
      const receipt = await protocol!.signAttestation(handle.current!, noteId); guard(); save(receipt, 'agyion-trigger-attestation.json');
    })}>Sign the condition and download receipt</button>
    {point && <button type="button" className="btn btn-secondary px-4 py-2" onClick={lock}>Lock reviewer key</button>}
    {error && <p role="alert">{error}</p>}
  </details>;
}
