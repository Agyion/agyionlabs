import type { Config } from "tailwindcss";

/**
 * Agyion design tokens — mirror the landing (Fluid Studio) palette exactly:
 * canvas #000, surface #121512, ink #fff, accent/glow #1fd48c,
 * muted #8a8a8a, faint #666, depth zones abyss #04100b / deep #0e2c22.
 */
const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Landing depth tokens (landing/src/config.ts theme)
        paper: "#000000", // canvas — pure black base
        cream: "#121512", // surface — lifted dark panel
        ink: "#FFFFFF", // primary text
        muted: "#8A8A8A", // secondary text
        faint: "#666666", // tertiary text / disabled
        accent: "#1FD48C", // signal green — CTAs, live price, locked state
        sand: "#26302A", // decorative lifelines inside visualizations
        hairline: "rgba(255,255,255,0.14)", // table rows, card borders (1px)
        // Depth zones ("scroll = descent")
        abyss: "#04100B", // footers, empty states, accent wells
        deep: "#0E2C22",
        twilight: "#2F6B53",
        drift: "#BDD2C4",
        // Semantic lifecycle colors
        ember: "#F2A65A", // below zero / expired / rejected / mock (warm alarm)
        olive: "#35C77F", // executed / claimed — success
        returned: "#8A8A8A", // returned / expired
        // Deeper zone (abyss surfaces)
        night: {
          bg: "#04100B",
          surface: "#0E2C22",
          ink: "#FFFFFF",
          muted: "#8A8A8A",
          accent: "#1FD48C",
          line: "rgba(255,255,255,0.14)",
          hairline: "rgba(255,255,255,0.14)",
        },
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "Menlo", "monospace"],
      },
      transitionTimingFunction: {
        // House curve: fast start, slow settle (design_brief §3.3)
        house: "cubic-bezier(1, 0, 0.3, 0.93)",
      },
    },
  },
  plugins: [],
};
export default config;
