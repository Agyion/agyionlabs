"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { humanizeError } from "../../lib/errors";
import { IS_MOCK } from "../../lib/config";
import { ErrorNote, Field, TextInput } from "../ui";

export function WalletPrerequisite({ address }: { address: string | null }) {
  if (IS_MOCK || address) return null;
  return <p className="instrument-wallet-note">Connect a wallet to submit.</p>;
}

/** Reads can fail before a promise is created (missing signer or invalid ID). */
export function RecordLoader<T>({ name, load, onLoaded }: {
  name: string;
  load: (id: bigint) => Promise<T | null>;
  onLoaded: (record: T) => void;
}) {
  const [id, setId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callbacks = useRef({ load, onLoaded });
  callbacks.current = { load, onLoaded };
  const request = useRef(0);
  const loadedReference = useRef<string | null>(null);
  const submit = async (input = id) => {
    const token = ++request.current;
    setError(null);
    setBusy(true);
    try {
      const value = input.trim();
      if (value.length > 20 || !/^\d+$/.test(value) || BigInt(value) > 0xffff_ffff_ffff_ffffn)
        throw new Error(`Enter a valid ${name.toLowerCase()} ID.`);
      const record = await callbacks.current.load(BigInt(value));
      if (token !== request.current) return;
      if (!record) throw new Error(`${name} #${value} was not found.`);
      callbacks.current.onLoaded(record);
    } catch (e) {
      if (token === request.current) { loadedReference.current = null; setError(humanizeError(e)); }
    } finally {
      if (token === request.current) setBusy(false);
    }
  };

  const cancelRead = useCallback(() => { request.current++; loadedReference.current = null; }, []);
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    const tab = name.toLowerCase() === "mandate" ? "envoy" : name.toLowerCase();
    const open = (target: { tab?: string; id?: string }) => {
      const value = target.id;
      if (target.tab !== tab || !value || value.length > 20 || !/^\d+$/.test(value) || BigInt(value) > 0xffff_ffff_ffff_ffffn || loadedReference.current === value) return;
      loadedReference.current = value;
      setId(value);
      void submitRef.current(value);
    };
    const listener = (event: Event) => open((event as CustomEvent).detail ?? {});
    const query = new URLSearchParams(window.location.search);
    open({ tab: query.get("tab") ?? undefined, id: query.get("ref") ?? undefined });
    window.addEventListener("agyion:open-record", listener);
    return () => { cancelRead(); window.removeEventListener("agyion:open-record", listener); };
  }, [name, cancelRead]);

  return <form className="mb-6 space-y-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
    <div className="instrument-inline-control">
      <Field label={`Load ${name.toLowerCase()} by id`}>
        <TextInput value={id} onChange={(event) => setId(event.target.value)} inputMode="numeric" placeholder="Record ID" />
      </Field>
      <button className="btn border px-5 py-2.5 text-ink disabled:opacity-40" type="submit" disabled={busy}>
        {busy ? "Loading…" : "Load"}
      </button>
    </div>
    {error && <ErrorNote>{error}</ErrorNote>}
  </form>;
}
