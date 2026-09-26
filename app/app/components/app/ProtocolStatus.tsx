"use client";
import type { useProtocolReadiness } from "../../lib/useProtocolReadiness";
import { GhostButton } from "../ui";
/** The client repeats this check before every write; exploration stays available. */
export default function ProtocolStatus({ readiness }: { readiness: ReturnType<typeof useProtocolReadiness> }) {
  if (readiness.status === "ready") return null;
  const message = readiness.status === "checking" ? "Checking the network…"
    : readiness.status === "incompatible" ? "Contract v2 upgrade required. Transactions unavailable."
    : "Network unavailable. Transactions paused.";
  return <div id="protocol-availability" className="instrument-feedback protocol-status" role="status" data-readiness={readiness.status}>
    <p>{message}</p>
    {readiness.status !== "checking" && <GhostButton onClick={readiness.retry}>Check again</GhostButton>}
  </div>;
}
