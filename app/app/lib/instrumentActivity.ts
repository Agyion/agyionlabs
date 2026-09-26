"use client";
import { createContext, useContext } from "react";
/** Retained drafts can stay mounted without running a hidden instrument's work. */
export const InstrumentActivity = createContext(true);
export function useInstrumentActivity(): boolean { return useContext(InstrumentActivity); }
