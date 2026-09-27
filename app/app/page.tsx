"use client";

/**
 * Agyion landing v3: section plan per design_brief §4, but every clock is
 * the page's own: no scroll-linked animation anywhere. Entrance staggering,
 * endless loops, hover micro-interactions, time-triggered transitions.
 */

import Nav from "./components/landing/Nav";
import Hero from "./components/landing/Hero";
import HowItWorks from "./components/landing/HowItWorks";
import TemplateCards from "./components/landing/TemplateCards";
import WhyStellar from "./components/landing/WhyStellar";
import Compliance from "./components/landing/Compliance";
import CtaFooter from "./components/landing/CtaFooter";
import Lifeline from "./components/landing/Lifeline";
import Cursor from "./components/landing/Cursor";
import PageWipe from "./components/landing/PageWipe";

export default function Landing() {
  return (
    <main className="relative">
      <PageWipe />
      <Cursor />
      <Lifeline />
      <Nav />
      <Hero />
      <HowItWorks />
      <TemplateCards />
      <WhyStellar />
      <Compliance />
      <CtaFooter />
    </main>
  );
}
