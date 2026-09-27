"use client";

/**
 * CtaFooter: serif headline + single terracotta arrow-link, then a footer
 * with the one slow auto-scrolling strip of template illustrations
 * (pause on hover) and a colophon (§4.6).
 */

import { motion, useReducedMotion } from "framer-motion";
import { ArrowLink, Eyebrow, Icon, MediaSlot } from "../ui";

const STRIP = [
  { media: "fade.png", alt: "Fade", icon: "fade" as const },
  { media: "pod.png", alt: "Pod", icon: "pod" as const },
  { media: "trigger.png", alt: "Trigger", icon: "trigger" as const },
  { media: "envoy.png", alt: "Envoy", icon: "envoy" as const },
];

export default function CtaFooter() {
  const reduced = useReducedMotion();
  return (
    <>
      <section className="mx-auto max-w-[1200px] px-6 py-28 text-center md:py-40">
        <Eyebrow>Begin</Eyebrow>
        <motion.h2
          className="display mx-auto mt-4 max-w-[16ch] text-[40px] leading-[1.08] text-ink md:text-[64px]"
          initial={reduced ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: [1, 0, 0.3, 0.93] }}
        >
          Give your money a condition.
        </motion.h2>
        <div className="mt-10 text-[17px]">
          <ArrowLink href="/app">Open the app</ArrowLink>
        </div>
      </section>

      <footer className="border-t" style={{ borderColor: "var(--hairline)" }}>
        {/* the single allowed marquee: slow, pauses on hover */}
        <div className="overflow-hidden py-8" aria-hidden>
          <div className={`flex w-max gap-8 ${reduced ? "" : "strip"}`}>
            {[...STRIP, ...STRIP, ...STRIP, ...STRIP].map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <MediaSlot name={s.media} alt={s.alt} className="h-16 w-24 rounded-lg" />
                <span className="flex items-center gap-2 text-[13px] font-medium text-muted">
                  <Icon kind={s.icon} size={16} color="var(--muted)" />
                  {s.alt}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-4 px-6 pb-10 pt-4 md:flex-row md:items-center">
          <div className="font-serif text-[18px] text-ink">Agyion</div>
          <p className="max-w-[52ch] text-[12px] leading-relaxed text-muted">
            Colophon: DM Serif Display, Inter, IBM Plex Mono. Terracotta, sand,
            cream, charcoal brown. Built on Stellar testnet with Soroban; TRY
            is a demo token, not legal tender. Mock mode stores nothing but your
            browser.
          </p>
          <div className="font-mono text-[12px] text-muted">lock · wait · prove · execute or return</div>
        </div>
      </footer>
    </>
  );
}
