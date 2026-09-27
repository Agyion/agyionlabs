"use client";

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Buffer } from 'buffer';
import { Asset, Networks, StrKey } from '@stellar/stellar-sdk';
import { usePrivateWorkspace } from './PrivateWorkspaceProvider';
import PrivateVault from './PrivateVault';
import PrivateTriggerAttester from './PrivateTriggerAttester';
import { usePrivateVault } from '../../lib/privateVault';
import { CONFIG } from '../../lib/config';
import { formatMinor, shortAddress, shortHex } from '../../lib/format';
import { newPrivateGrantId, privateAmount, privateAttestation, privateDeadline, privateDestination, readPrivateFile } from '../../lib/privateWorkspaceInputs';
import type { PrivateCommand, PrivateNoteAction, PrivateNoteSummary, PreparedPrivateOperation } from '../../lib/private/protocol-types';
import manifest from '../../lib/private/release.json';
import { Field, TextInput } from '../ui';

type Instrument = 'pod' | 'trigger' | 'envoy';
const native = Asset.native().contractId(Networks.TESTNET);
const assets = manifest.config.assets.map(contract => ({ contract, id: StrKey.decodeContract(contract).toString('hex'), label: contract === native ? 'XLM' : contract === CONFIG.assetContractId ? CONFIG.assetCode : shortAddress(contract) }));
const assetLabel = (id: string) => assets.find(asset => asset.id === id)?.label ?? shortHex(id);
const title = (kind: Instrument) => kind === 'pod' ? 'Pod' : kind === 'trigger' ? 'Trigger' : 'Envoy';
const actionTitle = (action: string) => ({ deposit: 'Add private funds', transfer: 'Private payment', withdraw: 'Public withdrawal', consolidate: 'Consolidate private notes', 'pod-create': 'Lock a Pod', 'pod-claim': 'Claim a Pod', 'trigger-create': 'Create a Trigger', 'trigger-claim': 'Claim a Trigger', 'trigger-refund': 'Refund a Trigger', 'envoy-grant': 'Delegate private notes', 'envoy-claim': 'Agent claim', 'envoy-reclaim': 'Owner reclaim', 'envoy-revoke': 'Revoke private delegation' }[action] ?? 'Private operation');
function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; document.body.append(link);
  try { link.click(); } finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

export default function PrivateInstrumentPanel({ kind, address, legacy, publicRecordRequested = false, active = true }: {
  kind: Instrument; address: string | null; legacy: ReactNode; publicRecordRequested?: boolean; active?: boolean;
}) {
  const workspace = usePrivateWorkspace();
  const [publicOpen, setPublicOpen] = useState(publicRecordRequested);
  useEffect(() => { if (publicRecordRequested) setPublicOpen(true); }, [publicRecordRequested]);
  return <div className={`instrument-panel private-instrument panel-${kind}`} data-private-instrument={kind}>
    <header className="private-introduction"><h3>{title(kind)} · Private</h3><p>Experimental testnet. One operator holds the development trustee keys. Deposits, withdrawals and fee payers remain public.</p></header>
    {workspace.loading && <p role="status">Verifying the private workspace…</p>}
    {workspace.error && <p role="alert">{workspace.error}</p>}
    {workspace.vault && <PrivateReadyPanel kind={kind} address={address} active={active} />}
    <details className="instrument-technical private-public-records" open={publicOpen} onToggle={event => setPublicOpen(event.currentTarget.open)}>
      <summary>{kind === 'envoy' ? 'Fade agent' : 'Existing public positions'}</summary>
      <p>{kind === 'envoy' ? 'Authorize, run or revoke an agent for public Fade offers. This is separate from private note delegation.' : 'These positions use the public contract. Their amounts and addresses are public.'}</p>
      {publicOpen && legacy}
    </details>
  </div>;
}

function PrivateReadyPanel({ kind, address, active }: { kind: Instrument; address: string | null; active: boolean }) {
  const { protocol, snapshot, scope, feeLimit, setFeeLimit, reviewId, setReviewId } = usePrivateWorkspace();
  const { state: vaultState, controller: vault } = usePrivateVault();
  const [action, setAction] = useState<string>(`${kind}-create` === 'envoy-create' ? 'envoy-grant' : `${kind}-create`);
  const [asset, setAsset] = useState(assets.find(value => value.contract === CONFIG.assetContractId)?.id ?? assets[0].id);
  const [amount, setAmount] = useState('1');
  const [minutes, setMinutes] = useState('5');
  const [destination, setDestination] = useState('');
  const [recipient, setRecipient] = useState<unknown>(null);
  const [agent, setAgent] = useState<unknown>(null);
  const [reviewer, setReviewer] = useState<unknown>(null);
  const [condition, setCondition] = useState('');
  const [attester, setAttester] = useState('');
  const [maxClaim, setMaxClaim] = useState('1');
  const [claims, setClaims] = useState('1');
  const [grantId, setGrantId] = useState('');
  const [revokeGrant, setRevokeGrant] = useState('');
  const [vaultOpen, setVaultOpen] = useState(true);
  const [feeDraft, setFeeDraft] = useState(feeLimit);
  const [prepared, setPrepared] = useState<PreparedPrivateOperation | null>(null);
  const [terms, setTerms] = useState<readonly string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [checkedCredentials, setCheckedCredentials] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const generation = useRef(0);
  const busyRef = useRef(false);
  const blocked = busy || snapshot.phase !== null || vaultState.busy !== null;
  const ready = !!protocol && !!address && vaultState.status === 'ready' && snapshot.status === 'ready';
  const grants = vaultState.grants.filter(grant => grant.kind === kind);

  useEffect(() => {
    generation.current++; busyRef.current = false; setBusy(false); setPrepared(null); setGrantId(''); setSubmitted(false); setError(null); setNotice(null);
    return () => { generation.current++; };
  }, [protocol, vault]);
  useEffect(() => {
    if (vaultState.status === 'locked') setGrantId('');
    if (vaultState.status !== 'ready') {
      if (prepared && ['pod-create', 'trigger-create', 'envoy-grant'].includes(prepared.summary.action)) setGrantId('');
      setPrepared(null); setSubmitted(false);
    }
  }, [vaultState.status, prepared]);
  useEffect(() => { if (prepared && prepared.id !== reviewId) { if (['pod-create', 'trigger-create', 'envoy-grant'].includes(prepared.summary.action)) setGrantId(''); setPrepared(null); setSubmitted(false); } }, [prepared, reviewId]);
  useEffect(() => { if (!active) { setError(null); } }, [active]);
  const invalidate = () => {
    // Once a prepared note/credential can be shared, its viewing key must not
    // be recycled into another creation with changed recipients or terms.
    if (prepared && ['pod-create', 'trigger-create', 'envoy-grant'].includes(prepared.summary.action)) setGrantId('');
    setPrepared(null); setSubmitted(false); setNotice(null);
  };
  const run = async (operation: (assertCurrent: () => void) => Promise<void>, fallback: string) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null);
    const token = generation.current;
    const assertCurrent = () => { if (token !== generation.current) throw new Error('Private UI session changed.'); };
    try { await operation(assertCurrent); }
    catch { if (token === generation.current) setError(fallback); }
    finally {
      // An operation may have been submitted before a lock, timeout or UI error.
      // Rediscover its durable hash even when local private keys are unavailable.
      try { await protocol?.refreshPending(); } catch { if (token === generation.current) setError('Recovery records could not be read. Do not repeat the operation.'); }
      if (token === generation.current) { busyRef.current = false; setBusy(false); }
    }
  };
  const createGrant = () => void run(async assertCurrent => {
    invalidate(); const id = newPrivateGrantId(); await vault.addGrant({ id, kind }); assertCurrent(); setGrantId(id); setVaultOpen(true);
  }, 'The new grant key could not be prepared. No funds were sent.');
  const showPrepared = async (command: PrivateCommand) => {
    if (!protocol || !ready) throw new Error('Private workspace is not ready.');
    const token = generation.current;
    setReviewId(null); setPrepared(null);
    const initial = await protocol.prepare(command);
    if (token !== generation.current) throw new Error('Private UI session changed.');
    const handle = initial.maxFeeStroops === privateAmount(feeLimit) ? initial : protocol.withFeeLimit(initial, privateAmount(feeLimit));
    const details: string[] = [];
    const recipient = command.recipient;
    if (recipient && typeof recipient === 'object') {
      const data = recipient as Record<string, unknown>;
      if (typeof data.spendingAuthHash === 'string') details.push(`Recipient private owner ${shortHex(data.spendingAuthHash)}`);
      if (typeof data.id === 'string') details.push(`Public destination ${data.kind === 'contract' ? StrKey.encodeContract(Buffer.from(data.id, 'hex')) : StrKey.encodeEd25519PublicKey(Buffer.from(data.id, 'hex'))}`);
    }
    if (command.action === 'pod-create') details.push(`Unlock ledger ${command.unlockLedger}. Only the recipient can claim. The sender cannot refund or reclaim this Pod.`);
    if (command.action === 'trigger-create') details.push(`Deadline ${command.deadline}. The recipient needs the attester signature; the funding owner can refund only after expiry.`);
    if (command.action === 'envoy-grant') details.push(`Expires at ledger ${command.expiresAt}. At most ${command.claims} claims, each no more than ${formatMinor(BigInt(command.maxPerClaim as string))} ${assetLabel(command.asset as string)}. Owner revocation and reclaim remain available.`);
    setTerms(details);
    setReviewId(handle.id); setPrepared(handle); setCheckedCredentials(new Set()); setSubmitted(false); setNotice(null);
  };
  const prepare = () => void run(async () => {
    if (!protocol) throw new Error('Private workspace unavailable.');
    if (action === 'consolidate') return showPrepared({ action, asset });
    const amountMinor = privateAmount(amount);
    if (action === 'deposit') return showPrepared({ action, asset, amount: amountMinor });
    if (action === 'withdraw') return showPrepared({ action, asset, amount: amountMinor, recipient: privateDestination(destination) });
    if (action === 'transfer') {
      if (!recipient) throw new Error('Recipient descriptor required.');
      return showPrepared({ action, asset, amount: amountMinor, recipient });
    }
    if (!grantId || !grants.some(grant => grant.id === grantId)) throw new Error('Prepare and back up a grant first.');
    const receiver = recipient ?? await protocol.receiveDescriptor();
    if (kind === 'pod') return showPrepared({ action: 'pod-create', asset, amount: amountMinor, recipient: receiver, unlockLedger: privateDeadline(snapshot.ledger, minutes), grantId });
    if (kind === 'trigger') return showPrepared({ action: 'trigger-create', asset, amount: amountMinor, recipient: receiver, deadline: privateDeadline(snapshot.ledger, minutes), condition: condition.trim(), attester: JSON.parse(attester), attesterRecipient: reviewer, grantId });
    if (!agent) throw new Error('Agent descriptor required.');
    return showPrepared({ action: 'envoy-grant', asset, amount: amountMinor, agent, recipient: receiver, validFrom: String(snapshot.ledger), expiresAt: privateDeadline(snapshot.ledger, minutes), maxPerClaim: privateAmount(maxClaim), claims: claims.trim(), grantId });
  }, 'The operation could not be prepared. Check its fields, current backup and verified balance. No wallet signature was requested.');
  const submit = () => void run(async assertCurrent => {
    if (!protocol || !prepared || submitted) return;
    setSubmitted(true);
    const outcome = await protocol.submit(prepared);
    assertCurrent();
    if (outcome.status === 'confirmed') {
      setNotice(`Confirmed transaction ${outcome.hash}.`); setPrepared(null); setGrantId('');
      if (vault.getSnapshot().status === 'ready') await protocol.refresh();
    } else setNotice(`Transaction ${outcome.hash}: ${outcome.status}. Check the recovery record before another attempt.`);
  }, 'The operation did not complete locally. Check pending transactions before trying again.');
  const refresh = () => void run(async () => {
    if (!protocol) throw new Error('Connect a wallet first.');
    await protocol.refresh();
  }, 'Verified private balances could not be recovered. No balance estimate is shown.');
  const descriptor = () => void run(async assertCurrent => {
    if (!protocol) throw new Error('Connect a wallet first.');
    const value = await protocol.receiveDescriptor();
    assertCurrent();
    downloadFile(new Blob([JSON.stringify(value)], { type: 'application/json' }), 'agyion-private-receive.json');
  }, 'The receive file could not be created.');
  const loadDescriptor = (set: (value: unknown) => void) => (file: File) => void run(async assertCurrent => {
    if (!scope) throw new Error('Verified private scope required.');
    const raw = await readPrivateFile(file);
    const { parseReceiveDescriptor } = await import('../../../../privacy/src/credentials.mjs');
    const parsed = parseReceiveDescriptor(raw, scope); assertCurrent(); set(parsed); invalidate();
  }, 'The receive file does not match this private deployment.');

  return <>
    <details className="private-vault-disclosure workbench-surface" open={vaultOpen} onToggle={event => setVaultOpen(event.currentTarget.open)}>
      <summary>Key recovery · {vaultState.status === 'ready' ? 'Backup checked' : vaultState.status === 'locked' ? 'Locked' : 'Backup required'}</summary>
      <PrivateVault />
    </details>
    {!address && <p>Connect your testnet wallet to use the private pool.</p>}
    <section className="private-account workbench-surface" aria-label="Verified private balances">
      <header><h4>Private balance</h4><button className="btn btn-secondary px-4 py-2" type="button" disabled={blocked || !protocol || vaultState.status !== 'ready'} onClick={refresh}>Refresh private balance</button></header>
      {snapshot.status === 'ready' ? <ul>{assets.map(value => <li key={value.id}><span>{value.label}</span><strong>{formatMinor(BigInt(snapshot.balances.find(balance => balance.asset === value.id)?.amount ?? '0'))}</strong></li>)}</ul> : <p>{vaultState.status === 'ready' ? 'Refresh to recover and verify your notes.' : 'Open and check your vault to recover private notes.'}</p>}
      {snapshot.error && <p role="alert">{snapshot.error}</p>}
      <div className="instrument-actions"><button type="button" className="btn btn-secondary px-4 py-2" onClick={descriptor} disabled={blocked || !ready}>Download public receive file</button></div>
      <CredentialImport resetKey={vault} locked={vaultState.status === 'locked'} disabled={blocked || !protocol || vaultState.status !== 'ready'} active={active} importFile={(file, password) => run(async assertCurrent => { await protocol!.importCredential(file, password); await protocol!.refresh(); assertCurrent(); setNotice('Credential opened locally. Keep its encrypted file and password for recovery.'); }, 'Credential import failed. Check its file, password and recipient vault.')} />
      {kind === 'trigger' && <PrivateTriggerAttester active={active} />}
    </section>
    <section className="private-operation workbench-surface" aria-label={`Private ${title(kind)} operation`}>
      <nav className="private-actions" aria-label="Private actions">
        {[[kind === 'envoy' ? 'envoy-grant' : `${kind}-create`, kind === 'pod' ? 'Save until later' : kind === 'trigger' ? 'Create escrow' : 'Authorize agent'], ['deposit', 'Add funds'], ['transfer', 'Send'], ['withdraw', 'Withdraw'], ['consolidate', 'Combine notes']].map(([value, label]) => <button type="button" key={value} aria-pressed={action === value} disabled={blocked} onClick={() => { setAction(value); invalidate(); }}>{label}</button>)}
      </nav>
      <div className="instrument-fields" onChange={invalidate}>
        <Field label="Asset"><select className="field-input" value={asset} disabled={blocked} onChange={event => setAsset(event.target.value)}>{assets.map(value => <option key={value.id} value={value.id}>{value.label}</option>)}</select></Field>
        {action !== 'consolidate' && <Field label="Amount"><TextInput value={amount} inputMode="decimal" disabled={blocked} onChange={event => setAmount(event.target.value)} /></Field>}
        {action === 'withdraw' && <Field label="Public destination"><TextInput value={destination} disabled={blocked} onChange={event => setDestination(event.target.value)} placeholder="Stellar G or C address" /></Field>}
        {!['deposit', 'withdraw', 'consolidate'].includes(action) && <DescriptorFile label={action === 'transfer' ? 'Recipient receive file' : 'Recipient receive file (optional, defaults to your vault)'} disabled={blocked} loaded={!!recipient} onFile={loadDescriptor(setRecipient)} />}
        {!['deposit', 'withdraw', 'transfer', 'consolidate'].includes(action) && <>
          <Field label={kind === 'pod' ? 'Unlock in minutes' : 'Expires in minutes'}><TextInput inputMode="decimal" value={minutes} disabled={blocked} onChange={event => setMinutes(event.target.value)} /></Field>
          <p>{grantId ? `New grant key ${shortHex(grantId)}. Its current complete backup must be checked.` : 'Prepare a new grant key for this operation. Previous viewing keys are never reused for another creation.'}</p>
          <button type="button" className="btn btn-secondary px-4 py-2" disabled={blocked || vaultState.status === 'locked'} onClick={createGrant}>Prepare a new {title(kind)} key</button>
          {kind === 'trigger' && <><Field label="Condition identifier"><TextInput value={condition} inputMode="numeric" disabled={blocked} onChange={event => setCondition(event.target.value)} /></Field><Field label="Attester public point"><TextInput value={attester} disabled={blocked} onChange={event => setAttester(event.target.value)} placeholder={'["x","y"]'} /></Field><DescriptorFile label="Attester receive file" disabled={blocked} loaded={!!reviewer} onFile={loadDescriptor(setReviewer)} /></>}
          {kind === 'envoy' && <><DescriptorFile label="Agent receive file" disabled={blocked} loaded={!!agent} onFile={loadDescriptor(setAgent)} /><Field label="Maximum per claim"><TextInput value={maxClaim} inputMode="decimal" disabled={blocked} onChange={event => setMaxClaim(event.target.value)} /></Field><Field label="Number of claims"><TextInput value={claims} inputMode="numeric" disabled={blocked} onChange={event => setClaims(event.target.value)} /></Field></>}
        </>}
      </div>
      {kind === 'pod' && action === 'pod-create' && <p>Only the recipient can claim after unlock. The sender has no refund or reclaim path.</p>}
      {action === 'deposit' && <p>The public wallet and deposit amount remain visible on Stellar.</p>}
      {action === 'withdraw' && <p>The withdrawal amount and destination become public.</p>}
      <details className="instrument-technical"><summary>Network fee limit</summary><Field label="Maximum network fee (XLM)"><TextInput inputMode="decimal" value={feeDraft} disabled={blocked} onChange={event => setFeeDraft(event.target.value)} /></Field><button className="btn btn-secondary px-4 py-2" type="button" disabled={blocked} onClick={() => { try { const cap = privateAmount(feeDraft); if (prepared && protocol) { const revised = protocol.withFeeLimit(prepared, cap); setReviewId(revised.id); setPrepared(revised); setSubmitted(false); } setFeeLimit(feeDraft); setError(null); } catch { setError('The fee limit could not be changed. Check any pending transaction first.'); } }}>Apply fee limit</button><p>The exact simulated fee is shown before opening your wallet. Your limit is never raised automatically.</p>{snapshot.feeQuote && <p role="status">Quoted maximum fee {formatMinor(BigInt(snapshot.feeQuote.feeStroops), 7)} XLM. Limit {formatMinor(BigInt(snapshot.feeQuote.maxFeeStroops), 7)} XLM.</p>}</details>
      <button type="button" className="btn btn-primary px-5 py-3" disabled={blocked || !ready || prepared !== null} onClick={prepare}>Prepare private operation</button>
    </section>
    {prepared && <section className="private-review workbench-surface" aria-label="Review private operation"><h4>Review before signing</h4><dl><div><dt>Action</dt><dd>{actionTitle(prepared.summary.action)}</dd></div><div><dt>Amount</dt><dd>{formatMinor(BigInt(prepared.summary.amount))} {assetLabel(prepared.summary.asset)}</dd></div><div><dt>Public fee payer</dt><dd>{shortAddress(prepared.publicFeePayer)}</dd></div><div><dt>Maximum network fee</dt><dd>{formatMinor(BigInt(prepared.maxFeeStroops), 7)} XLM</dd></div></dl>{terms.map(term => <p key={term}>{term}</p>)}
      {prepared.credentials.map(credential => <CredentialExport key={credential.id} credential={credential} active={active} disabled={blocked || submitted} download={password => protocol!.exportCredential(prepared, credential.id, password)} check={(file, password) => protocol!.checkExportedCredential(prepared, credential.id, file, password)} onChecked={checked => setCheckedCredentials(values => { const next = new Set(values); if (checked) next.add(credential.id); else next.delete(credential.id); return next; })} />)}
      <button type="button" className="btn btn-primary px-5 py-3" disabled={blocked || submitted || !protocol || vaultState.status !== 'ready' || !prepared.credentials.every(credential => checkedCredentials.has(credential.id))} onClick={submit}>Confirm private operation</button><button type="button" className="btn btn-secondary px-4 py-2" disabled={blocked} onClick={invalidate}>Discard prepared operation</button>
    </section>}
    {kind === 'envoy' && grants.length > 0 && <section className="private-operation workbench-surface" aria-label="Revoke private delegation"><h4>Revoke a private delegation</h4><Field label="Owner grant to revoke"><select className="field-input" value={revokeGrant} disabled={blocked} onChange={event => setRevokeGrant(event.target.value)}><option value="">Choose your grant</option>{grants.map(grant => <option value={grant.id} key={grant.id}>{shortHex(grant.id)}</option>)}</select></Field><button type="button" className="btn btn-secondary px-4 py-2" disabled={blocked || !ready || prepared !== null || !revokeGrant} onClick={() => void run(() => showPrepared({ action: 'envoy-revoke', grantId: revokeGrant }), 'The owner revocation could not be prepared.')}>Prepare revocation</button></section>}
    <section className="private-notes workbench-surface" aria-label={`Private ${title(kind)} positions`}><h4>Your {title(kind)} positions</h4>{snapshot.notes.filter(note => note.kind === kind).map(note => <PrivateNote key={note.id} note={note} kind={kind} disabled={blocked || !ready || prepared !== null} prepare={command => run(() => showPrepared(command), 'The position could not be prepared. Check ownership, its time limits and any required credential.')} />)}{snapshot.status === 'ready' && !snapshot.notes.some(note => note.kind === kind) && <p>No recoverable {title(kind)} positions.</p>}</section>
    <section className="private-pending" aria-label="Private transaction recovery"><h4>Pending transactions</h4>{snapshot.pending.length === 0 ? <p>No pending transaction recorded on this device.</p> : snapshot.pending.map(attempt => <div className="instrument-record" key={attempt.hash}><p>{attempt.operation} · {shortHex(attempt.hash)}</p><button type="button" className="btn btn-secondary px-4 py-2" disabled={blocked || !protocol} onClick={() => void run(async assertCurrent => { const result = await protocol!.reconcile(attempt.hash); assertCurrent(); setNotice(`Transaction ${result.hash}: ${result.status}.`); if (result.status === 'confirmed' && vault.getSnapshot().status === 'ready') await protocol!.refresh(); }, 'Transaction status is still unavailable. Do not submit a replacement.')}>Check transaction status</button></div>)}</section>
    {snapshot.phase && <p role="status">{snapshot.phase === 'recovering' ? 'Recovering verified notes…' : snapshot.phase === 'proving' ? 'Generating proof locally…' : snapshot.phase === 'confirming-fee' ? 'Waiting for fee confirmation…' : 'Waiting for the wallet…'}</p>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </>;
}

function DescriptorFile({ label, loaded, disabled, onFile }: { label: string; loaded: boolean; disabled: boolean; onFile(file: File): void }) {
  return <Field label={label}><input type="file" accept="application/json,.json" disabled={disabled} onChange={event => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ''; }} />{loaded && <span>File selected</span>}</Field>;
}
function CredentialImport({ disabled, active, resetKey, locked, importFile }: { disabled: boolean; active: boolean; resetKey: object; locked: boolean; importFile(file: File, password: string): Promise<void> }) {
  const [file, setFile] = useState<File | null>(null), [password, setPassword] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { setFile(null); setPassword(''); if (input.current) input.current.value = ''; }, [active, resetKey, locked]);
  return <details className="instrument-technical"><summary>Open a received credential</summary><p>Keep this encrypted file separately from your vault backup.</p><Field label="Encrypted credential"><input ref={input} type="file" accept="application/json,.json" disabled={disabled} onChange={event => setFile(event.target.files?.[0] ?? null)} /></Field><Field label="Credential password"><TextInput type="password" autoComplete="off" maxLength={1024} value={password} disabled={disabled} onChange={event => setPassword(event.target.value)} /></Field><button type="button" className="btn btn-secondary px-4 py-2" disabled={disabled || !file || password.length < 12} onClick={() => { if (!file) return; const selected = file, secret = password; setFile(null); setPassword(''); if (input.current) input.current.value = ''; void importFile(selected, secret); }}>Open credential locally</button></details>;
}
function CredentialExport({ credential, active, disabled, download, check, onChecked }: {
  credential: PreparedPrivateOperation['credentials'][number]; active: boolean; disabled: boolean;
  download(password: string): Promise<{ blob: Blob; filename: string }>;
  check(file: File, password: string): Promise<void>;
  onChecked(checked: boolean): void;
}) {
  const [password, setPassword] = useState(''), [file, setFile] = useState<File | null>(null), [checked, setChecked] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!active) { setPassword(''); setFile(null); if (input.current) input.current.value = ''; } }, [active]);
  return <section className="private-credential-export"><h5>{credential.role} credential</h5><p>Recipient {shortHex(credential.recipient)}. Save the encrypted file and check it before sending funds.</p><Field label={`${credential.role} credential password`}><TextInput type="password" autoComplete="off" maxLength={1024} value={password} disabled={disabled || busy} onChange={event => setPassword(event.target.value)} /></Field><button type="button" className="btn btn-secondary px-4 py-2" disabled={disabled || busy || password.length < 12} onClick={() => { const secret = password; setPassword(''); setBusy(true); setError(null); void download(secret).then(value => { downloadFile(value.blob, value.filename); }).catch(() => setError('Encrypted credential download failed.')).finally(() => setBusy(false)); }}>Download encrypted credential</button><Field label={`Reselect saved ${credential.role} credential`}><input ref={input} type="file" accept="application/json,.json" disabled={disabled || busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setChecked(false); onChecked(false); }} /></Field><button type="button" className="btn btn-secondary px-4 py-2" disabled={disabled || busy || !file || password.length < 12} onClick={() => { if (!file) return; const selected = file, secret = password; setFile(null); setPassword(''); setChecked(false); onChecked(false); if (input.current) input.current.value = ''; setBusy(true); setError(null); void check(selected, secret).then(() => { setChecked(true); onChecked(true); }).catch(() => setError('Credential check failed. Reselect the correct saved file.')).finally(() => setBusy(false)); }}>Check saved credential</button>{checked && <p role="status">Saved credential checked</p>}{error && <p role="alert">{error}</p>}</section>;
}
function PrivateNote({ note, kind, disabled, prepare }: { note: PrivateNoteSummary; kind: Instrument; disabled: boolean; prepare(command: PrivateCommand): Promise<void> }) {
  const { scope } = usePrivateWorkspace();
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, [scope, note.id]);
  const [amount, setAmount] = useState('1'), [receipt, setReceipt] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const claim = `${kind}-claim` as PrivateNoteAction;
  const canClaim = note.supportedActions.includes(claim);
  const returnAction = kind === 'trigger' ? 'trigger-refund' : 'envoy-reclaim';
  const canReturn = kind !== 'pod' && note.supportedActions.includes(returnAction);
  const perform = (action: string) => {
    setError(null);
    try {
      const command = action === 'pod-claim' ? { action, noteId: note.id, grantId: note.grantId } : action === 'trigger-claim' ? { action, noteId: note.id, attestation: receipt } : action === 'envoy-claim' ? { action, noteId: note.id, amount: privateAmount(amount) } : { action, noteId: note.id };
      void prepare(command);
    } catch { setError('Check the position fields before preparing.'); }
  };
  return <article className="instrument-record private-note">
    <p><strong>{formatMinor(BigInt(note.amount))} {assetLabel(note.asset)}</strong> · {shortHex(note.id)}</p>
    <p>Unlock ledger {note.notBefore} · Deadline {note.deadline}</p>
    {kind === 'pod' && note.grantId && <p>Claim credential {shortHex(note.grantId)}</p>}
    {kind === 'trigger' && canClaim && <Field label="Signed attestation receipt"><input type="file" accept="application/json,.json" disabled={disabled} onChange={event => {
      const file = event.target.files?.[0];
      if (file && scope) {
        const token = ++request.current; setReceipt(null);
        void readPrivateFile(file).then(value => privateAttestation(value, note.id, scope)).then(value => { if (token === request.current) setReceipt(value); }).catch(() => { if (token === request.current) setError('The receipt does not match this Trigger and deployment.'); });
      }
      event.target.value = '';
    }} /></Field>}
    {kind === 'envoy' && canClaim && <Field label="Claim amount"><TextInput value={amount} inputMode="decimal" disabled={disabled} onChange={event => setAmount(event.target.value)} /></Field>}
    <div className="instrument-actions">
      {canClaim && <button type="button" className="btn btn-secondary px-4 py-2" disabled={disabled || kind === 'trigger' && !receipt} onClick={() => perform(claim)}>Prepare claim</button>}
      {canReturn && <button type="button" className="btn btn-secondary px-4 py-2" disabled={disabled} onClick={() => perform(returnAction)}>{kind === 'trigger' ? 'Prepare refund' : 'Prepare owner reclaim'}</button>}
    </div>
    {!canClaim && !canReturn && <p>View only or waiting for this position’s conditions. Refresh to check again.</p>}
    {error && <p role="alert">{error}</p>}
  </article>;
}
