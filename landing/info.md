# fluid-studio — site guide (info.md)

This is the **English version** of a dark, immersive creative-studio website template. The same site also exists in Chinese, right next door in the `cn/fluid-studio` directory — use that one when a Chinese-language site is needed.

**The language the site presents should follow the language of the user's query.** If the user writes in English, serve this English version as-is. If the user writes in Chinese, prefer the sibling Chinese version (or translate this copy accordingly) — never mix the two by accident.

## Ask the user first (ask_user tool)

Before changing or shipping anything, ask the user these questions with the ask_user tool:

1. **(Required) Do you want to turn this site into a full-stack application?** That means persistent data storage. As shipped, the template is front-end only: the contact form stores nothing after submission, and the blog is built-in sample data served through a mock API. If the user needs real persistence — saved form submissions, articles, messages — a server and a database have to be added, turning it into a full-stack app.
2. **Should the brand information be replaced?** Studio name, taglines, email, social links, footer copyright — all placeholder content that can be swapped for the user's real details.
3. **Default content or new content?** The work cases, lab experiments, and blog articles are a coherent sample set. The user can supply their own projects and posts, or replace only part of it.
4. **Any visual adjustments?** The default is a black canvas + teal accent (`#2fb3a4`) + a five-band "surface to abyss" depth-zone palette. The accent color and the depth bands can be re-tuned to the user's taste.
5. **Which pages are needed?** Home / About / Work / Lab / Blog / Contact can all be trimmed as required.

If the user gives no answers at all, just load the default site files as they are — do not improvise changes.

Optional: You can use image and video generation tools if it suits user's query.

## What this site is

A complete site for a creative studio (digital design × motion systems):

- **Home**: entry loader, giant-word hero with a fluid gradient canvas, scrolling marquee, 3D cube, manifesto-style long-scroll statement, capabilities, horizontal gallery;
- **About**: pixel marquee, showreel, year counter, team roster, awards;
- **Work / WorkDetail**: project grid and case-study pages (prev/next navigation);
- **Lab**: categorized experiment scatterboard + video lightbox;
- **Blog / BlogPost**: article list with skeleton and error states (mock API);
- **Contact**: underline form + service/budget tags + math captcha;
- **404**: pixel face + an embedded runner mini-game.

File layout (everything lives in this directory):

```
index.html                  # entry HTML
package.json / vite.config.ts / tsconfig*.json / eslint.config.js
README.md                   # commands and architecture notes
public/fonts/               # self-hosted fonts + OFL licenses
src/
  main.tsx / App.tsx        # bootstrap, routes, CSS variables from config
  config.ts                 # ★ the ONLY content entry point: brand, copy,
                            #   projects, palette
  types.ts                  # content schema (TS types double as docs)
  components/               # NavPill, Cursor, Noise, Loader, ScrollProgress,
                            # DepthGauge, LedgerHero, WordMarquee, DiveBand, Footer
  pages/                    # Home / About / Work / WorkDetail / Lab / Blog /
                            # BlogPost / Contact / NotFound
  lib/                      # smoothScroll (Lenis+GSAP), fluid (fbm canvas),
                            # scramble, reveal, motion, captcha, api (mock blog),
                            # dino, validateConfig
  styles/                   # base.css (design tokens) + one css per page
tests/                      # vitest unit tests + tests/e2e/matrix.mjs browser matrix
dist/                       # pre-built static output
```

**Possible uses**: a creative agency or studio site, a personal or team portfolio, a design-team site with a blog, an event or exhibition landing page, and so on. If the user only wants to look at the site, load it as-is. If the user has specific needs (different industry, new brand, fewer pages, real data), change the text and media content — almost all of it lives in `src/config.ts`, and media is referenced as `/media/...` URLs served from `public/`. The engine (components, styles, motion) does not need to change.

## Technical notes (quick tour — read the code for details)

- **Vite + React 19 + strict TypeScript + react-router**; Lenis smooth scrolling with GSAP ScrollTrigger driving the scroll choreography.
- **Config-driven**: `src/config.ts` is the single content entry point; `src/types.ts` defines the full content schema; `src/lib/validateConfig.ts` runs visible pre-render checks (duplicate ids, cardinalities, hex formats, ...). Run `npm test` after editing the config.
- **"scroll = descent" depth zones**: five band backgrounds in `config.theme.depthZones`; `App.tsx` derives per-zone ink/line/accent/muted colors into `--dz*` CSS variables; sections opt in via `zone zone-zN` classes; without the key everything falls back to the uniform dark canvas.
- **Signature interactions**: the NavPill morphs between a pill and a fullscreen menu (dock and ledger variants); custom Cursor (magnetic, with a pixel trail); film-grain Noise layer; a right-edge DepthGauge replaces the classic progress bar; an fbm fluid gradient canvas behind the hero (`src/lib/fluid.ts`); text scramble-in reveals.
- **Degradation paths**: on coarse pointers, mobile, or reduced-motion, the cursor, noise, Lenis and marquee motion switch off automatically, and canvases render a single static frame.
- **Tests**: `npm test` (vitest: config validation, captcha, runner, fluid samplers); `BASE_URL=http://localhost:4173 npm run test:e2e` runs the browser behavior matrix (playwright-core, all expectations derived from the config, so it can be re-run after customization). (`playwright-core` is not installed in this package, so the e2e matrix skips and exits 0; run `npm i -D playwright-core` for a real browser pass.)

For any implementation detail, read the matching file — the engine/content boundary is clean and the comments point the way.
