/* Typed configuration surface for the template.
 * Ordinary adaptations edit src/config.ts only; these types are the schema.
 * The engine (src/components, src/pages) must never contain instance content.
 */

export interface MediaImage {
  src: string
  alt: string
  /** CSS object-position, e.g. '50% 30%'. Optional. */
  position?: string
}

export interface MediaVideo {
  src: string
  poster?: string
}

/* ---------------- theme ---------------- */

export interface SiteTheme {
  /** Page base background. */
  canvas: string
  /** Raised surface (nav pill, overlays). */
  surface: string
  /** Primary text on dark. */
  ink: string
  /** Fullscreen menu background (cream). */
  menuBg: string
  /** Text inside the fullscreen menu. */
  menuInk: string
  /** Menu row divider, rgba string. */
  menuLine: string
  /** Gold accent (menu hover layer, blog accent). */
  accent: string
  /** Ambient glow tint for the home hero canvas (usually = accent). */
  glow: string
  /** Muted text grays, darkest → lightest. */
  muted: string
  faint: string
  /**
   * Depth-zone colour program ("scroll = descent"):
   * five band backgrounds from the water surface down to the abyss. Sections
   * opt into zones via page markup; ink/line/accent/muted per zone are
   * derived by the engine (luminance). Optional: without it every zone
   * resolves to the uniform canvas/ink (classic behaviour).
   */
  depthZones?: { surface: string; drift: string; twilight: string; deep: string; abyss: string }
}

/* ---------------- global chrome ---------------- */

export interface MenuRow {
  /** Unique kebab-case id. */
  id: string
  /** Large uppercase title, e.g. 'WORK'. */
  label: string
  /** Small index caption under the title, e.g. '( 案例 )'. */
  subLabel: string
  href: string
  /** [left, right] hover thumbnails (3:2). */
  thumbs: [MediaImage, MediaImage]
}

export interface MenuConfig {
  rows: MenuRow[]
  /** mailto: target shown as the left icon in the pill bar. Optional. */
  email?: string
  /** Short brand mark rendered at pill center (text, not an image). */
  brandMark: string
  homeLabel: string
  closeAria: string
  openAria: string
  mailAria?: string
  /**
   * Chrome form variant: 'pill' (default) is the top-centred solid pill;
   * 'dock' is a frosted capsule docked at the bottom edge.
   * Morph/fullscreen/row mechanics identical.
   */
  form?: 'pill' | 'dock'
  /**
   * Menu row composition: 'stage' (default) keeps the
   * centred giant rows; 'ledger' re-composes rows as a left-aligned index
   * table (mono index cell, capitalised display title, right-aligned
   * sub-label column). Hover layer-swap and row-anchored thumbnails
   * (mechanism) are identical in both.
   */
  layout?: 'stage' | 'ledger'
}

export interface CursorConfig {
  enabled: boolean
  /** 0..1 magnetic pull toward small (<300px) interactive targets. */
  magnetStrength: number
  defaultLabel: string
  /** Pixel-block mouse trail (desktop only). */
  trail: boolean
}

export interface NoiseConfig {
  enabled: boolean
  /** 0..1 canvas opacity. */
  opacity: number
  /** 0..1 fraction of lit pixels per frame. */
  density: number
  fps: number
  /** fps while scroll is cooling. */
  fpsHold: number
}

export interface FooterConfig {
  marqueeWords: string[]
  email?: string
  phone: string
  address: string
  socials: Array<{ label: string; href: string }>
  backToTopLabel: string
  copyright: string
  /** Giant low-opacity glyph/word behind the footer base (e.g. '©'). Optional. */
  watermark?: string
  /** Small caption overlaid on the footer video corner. Optional. */
  videoTag?: string
  /**
   * Giant call-to-action block above the contact row (the "abyss footer"):
   * a display-size link with an ink-sweep hover. Optional.
   * href may be internal ('/...') or external ('https://...').
   */
  cta?: { label: string; href: string }
  /** Small mono kicker above the footer CTA. Optional. */
  ctaKicker?: string
  /** Ambient loop video for the footer corner. Optional (engine default reel). */
  video?: MediaVideo
}

/* ---------------- shared page primitives ---------------- */

export interface LedgerHero {
  /** Left big word, uppercase. */
  left: string
  /** Right big word, uppercase. */
  right: string
  /** Centered description between the words (\n for line break). */
  desc: string
  /** Bottom meta row. */
  metaLeft: string
  metaCenter: string
  metaRight: string
}

/* ---------------- home ---------------- */

export interface HomeLoader {
  enabled: boolean
  /** Two display letters flanking the mark, e.g. ['F','D']. */
  letters: [string, string]
  holdMs: number
  dismissMs: number
}

/**
 * Signature fluid ambience layer: a domain-
 * warped fbm gradient field rendered behind the hero, drifting over time
 * with a pointer push. Replaces the plain ambient blob canvas when enabled.
 * Optional; reduced-motion always renders a single static frame.
 */
export interface HomeHeroFluid {
  /** Master switch for the fluid field. */
  enabled: boolean
  /** Time multiplier 0..3 (default 1). */
  speed?: number
  /** Pointer disturbance strength 0..1 (default 0.6). */
  strength?: number
  /** Pointer disturbance on fine pointers (default true). */
  mouse?: boolean
}

/** Hero action button: '/...' internal, '#...' on-page anchor, 'https://...' external. */
export interface HomeHeroCta {
  label: string
  href: string
  /** Solid accent fill when true, hairline ghost otherwise. */
  primary?: boolean
}

export interface HomeHero {
  kicker: string
  /** Giant brand word (ledger composition renders it solid, mixed case). */
  brandWord: string
  /**
   * Second word of the ledger hero pair, rendered as a light outline offset
   * to the right (weight-contrast composition). Optional;
   * used by the 'ledger' composition only.
   */
  brandWordOutline?: string
  subLine: string
  /**
   * Full-bleed photographic hero background (dark
   * texture, clearly visible). Optional; without it the hero keeps the
   * plain black base + ambient canvas only.
   */
  bgImage?: MediaImage
  /** 0..1 strength of the dark scrim over bgImage (default 0.5). */
  bgDim?: number
  /**
   * Giant word font-size in vw; the letters spread edge-to-edge across the
   * hero top (wrapping to two lines when long). Default 16.
   */
  titleVw?: number
  /** Wave of small thumbnails scrubbed by scroll. */
  wave: MediaImage[]
  /** Slow ambient float on the wave images (off for reduced-motion). */
  waveDrift: boolean
  /**
   * Floating card-stack composition (central object + small cards pressing
   * the hero bottom edge): the middle wave image becomes the
   * raised main card, the rest cluster around it tilted with deep shadows.
   * Optional; default false. Takes precedence over waveOverlap.
   */
  stack?: boolean
  /**
   * Overlapping-card strip composition: cards overlap
   * with deep shadows, non-active dimmed, the middle card raised + lit.
   * Optional; default false keeps the flat tile row.
   */
  waveOverlap?: boolean
  /**
   * Flanking capability word columns (small uppercase, low opacity),
   * fading out as the hero scrolls away. Desktop only. Optional.
   */
  wordColumns?: { left: string[]; right: string[] }
  /** Signature fluid gradient field ambience (see HomeHeroFluid). Optional. */
  fluid?: HomeHeroFluid
  /** Hero action buttons below the sub line (ledger: bottom-left block). Optional. */
  ctas?: HomeHeroCta[]
  /**
   * Hero composition variant: 'banner' (default) keeps the top-spread
   * giant word + bottom object; 'poster' centres the giant word as a
   * monument; 'ledger' re-composes the hero as a descent ledger: top mono
   * data strip, giant
   * word pair (solid + outline, weight-contrast), left-anchored sub, right
   * meta column, and the wave images as a uniform specimen rail.
   */
  composition?: 'banner' | 'poster' | 'ledger'
}

export interface HomeMarquee {
  items: Array<{ text: string; label: string }>
  /** -1 moves left with scroll, 1 moves right. */
  direction: -1 | 1
}

export interface StatementWord {
  text: string
  /** 'xl' renders the pixel display size; 'sm' the small caption size. */
  size: 'xl' | 'sm'
  /** Horizontal anchor: left / quarter / right-quarter / right. */
  pos: 'left' | 'q1' | 'q3' | 'right'
  /** Extra vertical offset inside its group, px. */
  offsetY?: number
}

export interface StatementStatus {
  text: string
  /** Horizontal anchor: left / quarter / right-quarter / right. */
  pos: 'left' | 'q1' | 'q3' | 'right'
  /** Extra vertical offset inside its group, px. */
  offsetY?: number
}

export interface HomeStatement {
  /** Groups of words; each group is one scroll beat. */
  groups: StatementWord[][]
  /** Approximate section height in px (desktop). */
  heightPx: number
  /** Terminal-style status lines with a blinking block cursor. Optional. */
  statusLines?: StatementStatus[]
  /** Three readout tokens over a hairline rule at the section end (e.g. 'EST_2019'). Optional. */
  readout?: [string, string, string]
  /**
   * Scroll spotlight: small words ramp baseOpacity → 1 as
   * they approach the viewport centre and pick up a slight far-blur; text
   * scrambles in on entry. Optional; engine defaults baseOpacity 0.6,
   * farBlurPx 2, scramble on (all off under reduced-motion).
   */
  spotlight?: { baseOpacity?: number; farBlurPx?: number; scramble?: boolean }
  /**
   * Manifesto form: replaces the scattered-letter
   * scatterboard with long editorial lines: each line is one scroll beat
   * lit by the same spotlight curve (dim/blur far from centre). `em` marks
   * the substring rendered in the zone accent. Optional; when present it
   * takes precedence over `groups`. Section height/spotlight mechanism
   * unchanged.
   */
  manifesto?: { lines: Array<{ text: string; em?: string }> }
}

export interface HomeCapabilities {
  heading: string
  items: Array<{ index: string; title: string; body: string }>
}

export interface HomeGalleryCard {
  /** Bracketed product tag rendered as the card title, e.g. 'FADE' → [FADE]. */
  tag: string
  /** One-line product description under the tag. */
  body: string
}

export interface HomeGallery {
  heading: string
  images: MediaImage[]
  /** Product captions per image (same order, same length). Optional. */
  cards?: HomeGalleryCard[]
  heightPx: number
  /**
   * Card frame: clamp(minPx, vw, maxPx) width + CSS aspect-ratio.
   * Optional; engine default clamp(420px, 45vw, 648px) at 4/3.
   */
  card?: { minPx: number; vw: number; maxPx: number; aspect: string }
}

/** Cube stage sizing: min(vw×W, vh×H)×scale (zoomed scene). */
export interface HomeCubeZoom {
  vw: number
  vh: number
  scale: number
}

export interface HomeConfig {
  loader: HomeLoader
  hero: HomeHero
  marquee: HomeMarquee
  cube: { faces: MediaImage[]; zoom?: HomeCubeZoom } // exactly 6 faces
  statement: HomeStatement
  capabilities: HomeCapabilities
  gallery: HomeGallery
}

/* ---------------- about ---------------- */

export interface AboutShowreel {
  video: MediaVideo
  label: string
  /** Tall scroll room for the expansion scrub, px. */
  heightPx: number
}

export interface AboutYears {
  from: number
  to: number
  label: string
}

export interface CubeFace {
  title: string
  subTitle: string
  icon: string
}

export interface AboutRoster {
  heading: string
  clients: Array<{ name: string; note: string; image: MediaImage }>
}

export interface AboutAwards {
  heading: string
  items: Array<{ year: string; title: string; org: string }>
}

export interface AboutConfig {
  marqueeWords: string[]
  showreel: AboutShowreel
  years: AboutYears
  cube: { faces: CubeFace[] } // exactly 6
  roster: AboutRoster
  awards: AboutAwards
}

/* ---------------- work ---------------- */

export interface WorkProject {
  /** Unique kebab-case id. */
  id: string
  /** Unique kebab-case route slug → /work/:slug. */
  slug: string
  /** Display index, e.g. '01'. */
  index: string
  title: string
  subTitle: string
  tags: string[]
  year: string
  cover: MediaImage
  hero: MediaImage
  /** Case gallery (2-col grid). */
  images: MediaImage[]
  overview: {
    heading: string
    body: string
    meta: Array<{ label: string; value: string }>
  }
  prevLabel: string
  nextLabel: string
}

export interface WorkConfig {
  hero: LedgerHero
  projects: WorkProject[]
  previewLabel: string
  /** Editorial stagger: even cards drop down (desktop). */
  stagger: boolean
}

/* ---------------- lab ---------------- */

export interface LabExperiment {
  /** Unique kebab-case id. */
  id: string
  title: string
  /** Display date, e.g. '2026.03'. */
  date: string
  tags: string[]
  /** Must match one of LabConfig.categories. */
  category: string
  image: MediaImage
  /** Optional video; clicking the card opens the lightbox. */
  video?: MediaVideo
}

export interface LabConfig {
  hero: LedgerHero
  /** Filter categories (excluding the implicit ALL tab). */
  categories: string[]
  allLabel: string
  experiments: LabExperiment[]
  lightbox: {
    playAria: string
    muteAria: string
    closeAria: string
    toastText: string
  }
}

/* ---------------- blog ---------------- */

export interface BlogPost {
  /** Unique kebab-case slug → /blog/:slug. */
  slug: string
  /** Display date, e.g. '2026.06.12'. */
  date: string
  title: string
  excerpt: string
  image: MediaImage
  body: string[]
}

export interface BlogConfig {
  hero: LedgerHero
  posts: BlogPost[]
  /** Simulated fetch latency so the skeleton state is visible. */
  fetchDelayMs: number
  loadingLabel: string
  emptyLabel: string
  errorLabel: (status: number) => string
  skeletonRows: number
  backLabel: string
}

/* ---------------- contact ---------------- */

export interface ContactField {
  id: 'name' | 'email' | 'phone' | 'company' | 'message'
  label: string
  placeholder: string
  required: boolean
  optionalTag?: string
  errorText: string
  type: 'text' | 'email' | 'tel' | 'textarea'
}

export interface ContactService {
  id: string
  label: string
  /** Price-range options offered once this service is picked. */
  prices: string[]
}

export interface ContactForm {
  fields: ContactField[]
  servicesLabel: string
  services: ContactService[]
  priceLabel: string
  selectedLabel: string
  captchaLabel: string
  captchaError: string
  submitLabel: string
  sendingLabel: string
  successTitle: string
  successBody: string
  resetLabel: string
}

export interface ContactConfig {
  hero: LedgerHero
  form: ContactForm
  marqueeWords: string[]
}

/* ---------------- 404 ---------------- */

export interface NotFoundConfig {
  heading: string
  /** Typewriter lines cycled under the heading. */
  messages: string[]
  ctaLabel: string
  ctaHref: string
  hiScoreLabel: string
}

/* ---------------- interface copy (engine strings, all config-driven) ---------------- */

/** Visible engine strings (non-aria). */
export interface UiCopy {
  skipLink: string
  cubeCaption: string
  /** Gallery figcaption suffix, e.g. '01: FRAGMENT'. */
  galleryFragmentLabel: string
  notFoundHint: string
  notFoundGameOver: string
  /** Lab media button aria prefix: `${playPrefix} ${title}`. */
  playPrefix: string
  /** Contact budget-tag remove aria prefix: `${removePrefix} ${label}`. */
  removePrefix: string
  /** Work-detail gallery aria suffix: `${title} ${caseImagesSuffix}`. */
  caseImagesSuffix: string
}

/** Accessible names owned by the engine. */
export interface A11yCopy {
  loading: string
  menuNav: string
  socials: string
  cube: string
  showreel: string
  capabilities: string
  capabilityNav: string
  workGrid: string
  moreProjects: string
  labTabs: string
  labBoard: string
  playbackProgress: string
}

/** Custom-cursor text labels (data-cursor display values). */
export interface CursorCopy {
  home: string
  contact: string
  open: string
  top: string
  view: string
  preview: string
  back: string
  prev: string
  next: string
  video: string
}

export interface InterfaceCopy {
  ui: UiCopy
  a11y: A11yCopy
  cursor: CursorCopy
}

/* ---------------- root config ---------------- */

export interface SiteConfig {
  /** BCP-47 locale, e.g. 'en'. Source of truth for visible copy. */
  locale: string
  siteTitle: string
  siteDescription: string
  brandName: string
  theme: SiteTheme
  menu: MenuConfig
  cursor: CursorConfig
  noise: NoiseConfig
  /**
   * Depth gauge (signature chrome): a fixed right-edge
   * rail with tick marks, a drop marker tracking scroll progress and a mono
   * depth readout (−N M). Replaces the classic top progress bar when
   * enabled. Desktop only; reduced-motion safe (position, no animation).
   * Optional: absent/disabled keeps the classic top progress bar.
   */
  depthGauge?: { enabled: boolean; maxDepthM?: number }
  footer: FooterConfig
  home: HomeConfig
  about: AboutConfig
  work: WorkConfig
  lab: LabConfig
  blog: BlogConfig
  contact: ContactConfig
  notFound: NotFoundConfig
  copy: InterfaceCopy
}
