"use client";
import { useCallback, useEffect, useState } from "react";
import type { AgyionClient, ProtocolReadiness } from "./hakClient";
export function useProtocolReadiness(client: AgyionClient | null) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ client: AgyionClient; attempt: number; status: ProtocolReadiness } | null>(null);
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  useEffect(() => {
    if (!client) return;
    let live = true;
    const check = client.protocolReadiness ? client.protocolReadiness() : Promise.resolve<ProtocolReadiness>("ready");
    void check.then(status => { if (live) setState({ client, attempt, status }); }, () => { if (live) setState({ client, attempt, status: "unavailable" }); });
    return () => { live = false; };
  }, [client, attempt]);
  const status = !client ? "unavailable" : state?.client === client && state?.attempt === attempt ? state.status : "checking";
  return { status, retry };
}
