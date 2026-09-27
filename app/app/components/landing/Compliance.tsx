"use client";

/**
 * Compliance — two-column asymmetric (§4.5): plain-language paragraphs left,
 * a ledger-style mono table of visible vs. sealed right. Quiet, no badges.
 */

import { motion, useReducedMotion } from "framer-motion";
import { Eyebrow } from "../ui";

const ROWS: [string, string, string][] = [
  ["Rule parameters", "visible", "amounts, deadlines, caps, curve"],
  ["State transitions", "visible", "lock → claim → execute / return"],
  ["Signatures", "visible", "ed25519 proofs, verifiable by anyone"],
  ["Wallet addresses", "visible", "public transfers can be linked to people"],
  ["Pod v3 claim key", "local", "public key and signature bound to the recipient on the network"],
  ["Agent scope", "visible", "mandate limits are public by design"],
];

export default function Compliance() {
  const reduced = useReducedMotion();
  return (
    <section id="compliance" className="mx-auto max-w-[1200px] px-6 py-28 md:py-40">
      <div className="grid grid-cols-1 gap-14 md:grid-cols-12">
        <div className="md:col-span-5">
          <Eyebrow>Compliance &amp; privacy</Eyebrow>
          <h2 className="display mt-4 text-[36px] leading-[1.1] text-ink md:text-[56px]">
            Auditable where it matters, sealed where it counts
          </h2>
          <div className="mt-8 space-y-5 text-[17px] leading-[1.65] text-muted">
            <p>
              Every rule is a public parameter. Amounts, deadlines, decay curves,
              spending caps: anyone can read them, anyone can audit that the
              contract did exactly what it said. That is the point of putting
              conditions on the network.
            </p>
            <p>
              Addresses and transfer amounts are public. A wallet address can
              be linked to its owner; the current instruments do not provide
              anonymous or encrypted balances.
            </p>
            <p>
              Protocol v3 signs Pod claims locally and submits a signature bound
              to the recipient. The saved bearer key remains private. A separate ZK
              system with threshold disclosure is under development.
            </p>
          </div>
        </div>

        <div className="md:col-span-7">
          <motion.div
            className="overflow-hidden rounded-xl border bg-cream"
            style={{ borderColor: "var(--hairline)" }}
            initial={reduced ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: [1, 0, 0.3, 0.93] }}
          >
            <div className="border-b px-6 py-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted" style={{ borderColor: "var(--hairline)" }}>
              What the chain sees
            </div>
            <table className="w-full font-mono text-[13px]">
              <tbody>
                {ROWS.map(([what, state, note], i) => (
                  <motion.tr
                    key={what}
                    className="ledger-row"
                    initial={reduced ? false : { opacity: 0, x: -8 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 0.45, delay: 0.15 + i * 0.07, ease: [1, 0, 0.3, 0.93] }}
                  >
                    <td className="px-6 py-3.5 text-ink">{what}</td>
                    <td
                      className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-[0.1em]"
                      style={{ color: state === "visible" ? "#35C77F" : "var(--accent)" }}
                    >
                      {state}
                    </td>
                    <td className="px-6 py-3.5 text-muted">{note}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
