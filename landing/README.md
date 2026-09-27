# fluid-studio

> **Historical scaffold notes:** the current Agyion landing uses Home, six instrument/supporting detail routes and a shared orbital scene. `src/config.ts` retains unused template sections and is not the source of truth for current product behavior. The configuration and structure descriptions below concern the original scaffold. Current product, privacy and release boundaries are in the [root README](../README.md), [security policy](../SECURITY.md) and [limitations](../docs/LIMITATIONS.md). No landing animation performs a transaction.

A dark, immersive creative-studio website template.
Built with Vite, React 19, strict TypeScript, Lenis, and GSAP ScrollTrigger.

## Commands

```bash
npm ci            # install dependencies; Node.js 20.19 or newer
npm run dev       # development server on port 3000
npm run lint      # ESLint
npm run check     # tsc -b in strict mode
npm test          # Vitest: validateConfig plus captcha, form, and dinosaur logic
npm run build     # TypeScript and Vite production build
npm run preview   # production preview on port 4173
BASE_URL=http://localhost:4173 npm run test:e2e   # browser behavior matrix through playwright-core
```

## Configuration Boundary

- `src/types.ts` defines the instance-content schema for menus, themes, and every section of Home, About, Work, Lab, Blog, Contact, and 404 pages.
- `src/config.ts` is the **only customization entry point**. Change the brand, copy, projects, experiments, articles, and palette here without touching the engine.
- `src/lib/validateConfig.ts` performs visible pre-render runtime validation for duplicate IDs, dangling categories, invalid cardinalities, six-sided cube requirements, and more.
- `scripts/generate_media.py` generates procedural placeholder media through Pillow with deterministic seeds and no third-party assets.
- OFL fonts are self-hosted in `public/fonts/`: variable Bricolage Grotesque, variable Instrument Sans, Space Mono, and Bitcount Grid Single 400 for the 404 scoreboard only. License files are stored in the same directory.

## Structure

- `src/components/` contains global chrome: `NavPill`, which morphs between a pill and a full-screen showcase menu; `Cursor` with dot, ring, magnetic behavior, and pixel trail; film-grain `Noise`; `ScrollProgress`; `DepthGauge`; the ledger-style `LedgerHero`; `WordMarquee`; `DiveBand`; loader; and footer.
- `src/pages/` contains Home with loader, pinned hero, oversized pixel title, scrolling marquee, 3D cube, statement word grid, capabilities, and horizontal gallery; About with pixel marquee, expanding showreel, year counter, cube carousel, roster-follow image, and awards; Work and WorkDetail; Lab with tabs, scatterboard, and video lightbox; Blog and BlogPost with skeleton and error states plus follow image; Contact with underline form, budget tags, and math captcha; and NotFound with a pixel `4x4` scoreboard and dinosaur runner.
- `src/lib/` contains the Lenis 0.09 plus ScrollTrigger smooth-scroll wrapper, reduced-motion helpers, mock blog API seam, captcha logic, and dinosaur logic.
- On mobile or under reduced motion, cursor and noise layers turn off automatically, Lenis does not initialize, and marquees become static.
