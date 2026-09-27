/* eslint-disable @next/next/no-html-link-for-pages -- The root belongs to the separate Vite landing; a full document navigation is required. */
"use client";

/**
 * Nav: top bar + floating CTA pill (§3.3: hidden until ~100vh, slides down)
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowLink } from "../ui";

export default function Nav() {
  const [past, setPast] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    const on = () => setPast(window.scrollY > window.innerHeight);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <>
      <header
        className="fixed inset-x-0 top-0 z-40 border-b backdrop-blur-sm"
        style={{ borderColor: "var(--hairline)", background: "rgba(14,16,15,0.82)" }}
      >
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-5">
          <a href="/" className="font-serif text-[22px] text-ink">
            Agyion
          </a>
          <nav className="hidden items-center gap-7 text-[14px] font-medium text-ink md:flex">
            {[
              ["How it works", "#how"],
              ["Templates", "#templates"],
              ["Why Stellar", "#stellar"],
              ["Compliance", "#compliance"],
            ].map(([label, href]) => (
              <a key={href} href={href} className="dup-hover">
                <span className="dup-a">{label}</span>
                <span className="dup-b" aria-hidden>
                  {label}
                </span>
              </a>
            ))}
          </nav>
          <ArrowLink href="/app">Open the app</ArrowLink>
        </div>
      </header>

      {/* floating CTA pill */}
      <AnimatePresence>
        {past && (
          <motion.a
            href="/app"
            className="fixed left-1/2 z-40 rounded-full px-6 py-3 text-[14px] font-semibold"
            style={{ background: "var(--accent)", color: "#0E100F", x: "-50%" }}
            initial={{ top: -100, opacity: 0 }}
            animate={{ top: 76, opacity: 1 }}
            exit={{ top: -100, opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.5, ease: [1, 0, 0.3, 0.93] }}
          >
            Open the app →
          </motion.a>
        )}
      </AnimatePresence>
    </>
  );
}
