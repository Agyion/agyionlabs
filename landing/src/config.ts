/* Instance content — the ONLY file a typical adaptation edits.
 * Schema: src/types.ts. Runtime checks: src/lib/validateConfig.ts.
 */
import type { SiteConfig } from './types'

const img = (src: string, alt: string, position?: string) => ({ src, alt, ...(position ? { position } : {}) })

export const config: SiteConfig = {
  locale: 'en',
  siteTitle: 'agyionlabs: conditional money',
  siteDescription:
    'Money, bound by your rules. Explore conditional money instruments on Stellar testnet.',
  brandName: 'AGYIONLABS',

  theme: {
    canvas: '#07090d',
    surface: '#11151b',
    ink: '#f2eee5',
    menuBg: '#11151b',
    menuInk: '#f2eee5',
    menuLine: 'rgba(167, 173, 184, 0.2)',
    accent: '#e8b77b',
    glow: '#e8b77b',
    muted: '#a7adb8',
    faint: '#666666',
    /* "scroll = descent": every page starts at the
     * foam surface and sinks through five bands to the abyss footer */
    depthZones: {
      surface: '#07090d',
      drift: '#11151b',
      twilight: '#0d1117',
      deep: '#0b0f15',
      abyss: '#07090d',
    },
  },

  /* signature chrome: right-edge depth gauge replaces the top progress bar */
  depthGauge: { enabled: false, maxDepthM: 3600 },

  menu: {
    brandMark: 'A·L',
    homeLabel: 'HOME',
    openAria: 'Open menu',
    closeAria: 'Close menu',
    /* frosted capsule dock at the bottom edge */
    form: 'dock',
    /* ledger row composition (index cell + capitalised
     * title + right-aligned sub column) */
    layout: 'ledger',
    rows: [
      {
        id: 'home',
        label: 'HOME',
        subLabel: '( INDEX )',
        href: '/',
        thumbs: [img('/media/agyion-ink.png', 'Ink field visual'), img('/media/agyion-fade.png', 'FADE instrument still')],
      },
      {
        id: 'manifesto',
        label: 'MANIFESTO',
        subLabel: '( CREED )',
        href: '/#manifesto',
        thumbs: [img('/media/agyion-ink.png', 'Ink field visual'), img('/media/agyion-pod.png', 'POD instrument still')],
      },
      {
        id: 'instruments',
        label: 'INSTRUMENTS',
        subLabel: '( FOUR PRODUCTS )',
        href: '/instruments',
        thumbs: [img('/media/agyion-envoy.png', 'ENVOY instrument still'), img('/media/agyion-fade.png', 'FADE instrument still')],
      },
      {
        id: 'ramp',
        label: 'ON/OFF RAMP',
        subLabel: '( TRY ↔ USDC )',
        href: '/ramp',
        thumbs: [img('/media/agyion-rule.png', 'Rule etching'), img('/media/agyion-ink.png', 'Ink field visual')],
      },
      {
        id: 'ledger',
        label: 'LEDGER',
        subLabel: '( PROOF PACK )',
        href: '/ledger',
        thumbs: [img('/media/agyion-pod.png', 'POD instrument still'), img('/media/agyion-trigger.png', 'TRIGGER instrument still')],
      },
    ],
  },

  cursor: {
    enabled: false,
    magnetStrength: 0.22,
    defaultLabel: 'OPEN',
    trail: true,
  },

  noise: {
    enabled: false,
    opacity: 0.06,
    density: 0.7,
    fps: 25,
    fpsHold: 12,
  },

  footer: {
    marqueeWords: ['NO DISCRETION'],
    phone: 'PGP on request',
    address: 'Online · UTC±0',
    socials: [
      { label: 'X / Twitter', href: 'https://x.com/agyion_labs' },
      { label: 'GitHub', href: 'https://github.com/Agyion/agyionlabs' },
    ],
    backToTopLabel: 'RESURFACE ↑',
    copyright: '© 2026 AGYIONLABS: conditional money',
    watermark: '§',
    video: { src: '/media/agyion-loop.mp4' },
    videoTag: 'RULE ENGINE: LOOP 01',
    /* abyss footer CTA */
    cta: { label: 'Open the app', href: '/app/' },
    ctaKicker: 'THE RULE IS THE COUNTERPARTY',
  },

  home: {
    loader: { enabled: false, letters: ['A', 'G'], holdMs: 2200, dismissMs: 2700 },
    hero: {
      kicker: 'CONDITIONAL MONEY × RULES THAT EXECUTE THEMSELVES',
      brandWord: 'agyion',
      /* ledger composition: solid + outline word pair */
      brandWordOutline: 'labs',
      subLine: 'Conditional money: it locks, it executes itself when proven, and it returns when not.',
      ctas: [
        { label: 'Open the app', href: '/app/', primary: true },
        { label: 'Explore instruments', href: '/instruments' },
      ],
      /* descent ledger — data strip, weight-contrast
       * word pair, left sub, specimen rail */
      composition: 'ledger',
      titleVw: 18,
      wave: [
        img('/media/agyion-fade.png', 'FADE specimen'),
        img('/media/agyion-pod.png', 'POD specimen'),
        img('/media/agyion-trigger.png', 'TRIGGER specimen'),
        img('/media/agyion-envoy.png', 'ENVOY specimen'),
        img('/media/agyion-ink.png', 'Ink field specimen'),
      ],
      waveDrift: true,
      /* signature fluid ambience: fbm gradient field + pointer push */
      fluid: { enabled: true, speed: 1, strength: 0.65, mouse: true },
    },
    marquee: {
      direction: -1,
      items: [
        { text: 'LOCK', label: '( THE VAULT )' },
        { text: 'PROVE', label: '( THE ORACLE )' },
        { text: 'EXECUTE', label: '( THE RULE )' },
        { text: 'REFUND', label: '( THE RETURN )' },
        { text: 'NO DISCRETION', label: '( THE LAW )' },
      ],
    },
    cube: {
      faces: [
        img('/media/agyion-trigger.png', 'Cube face: TRIGGER'),
        img('/media/agyion-pod.png', 'Cube face: POD'),
        img('/media/agyion-fade.png', 'Cube face: FADE'),
        img('/media/agyion-envoy.png', 'Cube face: ENVOY'),
        img('/media/agyion-ink.png', 'Cube face: ink field'),
        img('/media/agyion-rule.png', 'Cube face: rule etching'),
      ],
      /* min(0.44×W, 0.72×H) × 0.9 → 570px stage at 1440×900 */
      zoom: { vw: 0.44, vh: 0.72, scale: 0.9 },
    },
    statement: {
      heightPx: 2800,
      /* manifesto form: editorial descent lines lit by
       * the same spotlight curve */
      groups: [],
      manifesto: {
        lines: [
          { text: "Money has no native 'if'.", em: "'if'" },
          { text: 'We give money a rule,', em: 'a rule' },
          { text: 'not a support ticket.', em: 'not a support ticket' },
        ],
      },
      statusLines: [
        { text: 'VAULT SEALED', pos: 'left', offsetY: -40 },
        { text: 'ORACLE LISTENING', pos: 'q1', offsetY: -24 },
        { text: 'RULE COMPILED', pos: 'left', offsetY: -40 },
        { text: 'REFUND PATH ARMED', pos: 'q1', offsetY: -24 },
      ],
      readout: ['NO_DISCRETION', 'SELF_EXECUTING', 'EST_2026'],
      /* words dim far from centre, light up near it, scramble on entry */
      spotlight: { baseOpacity: 0.6, farBlurPx: 2, scramble: true },
    },
    capabilities: {
      heading: 'HOW IT WORKS',
      items: [
        { index: '01', title: 'Lock', body: 'Deposit into a vault governed by rules: amount, condition, deadline. From that moment, the money follows the rule rather than anyone’s discretion.' },
        { index: '02', title: 'Prove', body: 'An oracle or a designated counterparty attests the outcome. Evidence is the only key; opinion opens nothing.' },
        { index: '03', title: 'Execute', body: 'Proof lands, the rule fires, the money moves. No approval queue, no discretion, no support ticket.' },
        { index: '04', title: 'Refund', body: 'If the deadline passes unproven, the vault unwinds itself and every deposit returns to its sender. Automatic, not negotiated.' },
      ],
    },
    gallery: {
      heading: 'FOUR INSTRUMENTS',
      heightPx: 3800,
      /* cards measure 648×486 / 535×402 — landscape, near half-viewport */
      card: { minPx: 420, vw: 45, maxPx: 648, aspect: '4 / 3' },
      images: [
        img('/media/agyion-fade.png', 'FADE: descending price instrument'),
        img('/media/agyion-pod.png', 'POD: capsule locked until its set time'),
        img('/media/agyion-trigger.png', 'TRIGGER: escrow released with event proof'),
        img('/media/agyion-envoy.png', 'ENVOY: AI spending mandate'),
      ],
      cards: [
        { tag: 'FADE', body: 'A price that walks backwards; below zero, the pot pays you.' },
        { tag: 'POD', body: 'A capsule locked until its set time: no one opens before 2035, including me.' },
        { tag: 'TRIGGER', body: 'Escrow that executes when an event is proven, refunds when not.' },
        { tag: 'ENVOY', body: 'A spending mandate for AI agents: caps, expiry, revoke with one click.' },
      ],
    },
  },

  /* ---- unused template sections (landing page only — routes stripped).
   * Kept schema-valid so the engine and validator stay happy; re-add the
   * routes in App.tsx to re-enable. */
  about: {
    marqueeWords: ['AGYIONLABS'],
    showreel: {
      video: { src: '/media/agyion-loop.mp4', poster: '/media/agyion-ink.png' },
      label: 'RULE ENGINE: LOOP',
      heightPx: 1800,
    },
    years: { from: 2026, to: 2026, label: 'YEAR ONE' },
    cube: {
      faces: [
        { title: 'LOCK', subTitle: '( VAULT )', icon: '◈' },
        { title: 'PROVE', subTitle: '( ORACLE )', icon: '◉' },
        { title: 'EXECUTE', subTitle: '( RULE )', icon: '◎' },
        { title: 'REFUND', subTitle: '( RETURN )', icon: '◍' },
        { title: 'CAPS', subTitle: '( LIMITS )', icon: '◐' },
        { title: 'REVOKE', subTitle: '( KILLSWITCH )', icon: '◑' },
      ],
    },
    roster: {
      heading: 'STACK',
      clients: [
        { name: 'Vault Engine', note: 'Core', image: img('/media/agyion-rule.png', 'Vault Engine') },
        { name: 'Oracle Mesh', note: 'Proof', image: img('/media/agyion-ink.png', 'Oracle Mesh') },
      ],
    },
    awards: { heading: 'RECOGNITION', items: [{ year: '2026', title: 'Conditional money primitives', org: 'agyionlabs' }] },
  },

  work: {
    hero: {
      left: 'Instruments',
      right: 'Archive',
      desc: 'FOUR STUDIES IN\nCONDITIONAL MONEY',
      metaLeft: '©2026',
      metaCenter: '( INSTRUMENTS )',
      metaRight: 'VAULT | ORACLE | RULE',
    },
    previewLabel: 'PREVIEW',
    stagger: true,
    projects: [
      {
        id: 'fade', slug: 'fade', index: '01', title: 'FADE',
        subTitle: 'A price that walks backwards', tags: ['VAULT'], year: '2026',
        cover: img('/media/agyion-fade.png', 'FADE cover'),
        hero: img('/media/agyion-fade.png', 'FADE hero'),
        images: [img('/media/agyion-fade.png', 'FADE detail')],
        overview: {
          heading: 'Below zero, the pot pays you.',
          body: 'FADE is an instrument whose price walks backwards along a published curve. Cross below zero and the vault inverts: the accumulated pot starts paying the holder.',
          meta: [{ label: 'TYPE', value: 'INSTRUMENT' }, { label: 'RULE', value: 'PRICE CURVE' }, { label: 'YEAR', value: '2026' }],
        },
        prevLabel: 'PREV', nextLabel: 'NEXT',
      },
      {
        id: 'pod', slug: 'pod', index: '02', title: 'POD',
        subTitle: 'A capsule locked until its set time', tags: ['VAULT', 'TIME'], year: '2026',
        cover: img('/media/agyion-pod.png', 'POD cover'),
        hero: img('/media/agyion-pod.png', 'POD hero'),
        images: [img('/media/agyion-pod.png', 'POD detail')],
        overview: {
          heading: 'No one opens before 2035, including me.',
          body: 'POD seals funds behind a timestamp. The rule is absolute: no admin key, no early exit, no exception path.',
          meta: [{ label: 'TYPE', value: 'INSTRUMENT' }, { label: 'RULE', value: 'TIMELOCK' }, { label: 'YEAR', value: '2026' }],
        },
        prevLabel: 'PREV', nextLabel: 'NEXT',
      },
    ],
  },

  lab: {
    hero: {
      left: 'Rule',
      right: 'Notes',
      desc: 'EXPERIMENTS IN\nCONDITIONAL MONEY',
      metaLeft: '©2026',
      metaCenter: '( EXPERIMENT LOG )',
      metaRight: 'VAULT | ORACLE | RULE',
    },
    allLabel: 'ALL',
    categories: ['INSTRUMENTS'],
    experiments: [
      { id: 'e01', title: 'Fade Curve 001', date: '2026.06', tags: ['CURVE'], category: 'INSTRUMENTS', image: img('/media/agyion-fade.png', 'Fade Curve 001') },
      { id: 'e02', title: 'Pod Seal Study', date: '2026.05', tags: ['TIMELOCK'], category: 'INSTRUMENTS', image: img('/media/agyion-pod.png', 'Pod Seal Study') },
    ],
    lightbox: {
      playAria: 'Play or pause the video',
      muteAria: 'Mute or unmute the video',
      closeAria: 'Close the player',
      toastText: 'Playback is a local demo asset',
    },
  },

  blog: {
    hero: {
      left: 'Field',
      right: 'Notes',
      desc: 'RULES, ORACLES\n& OCCASIONAL DOUBT',
      metaLeft: '©2026',
      metaCenter: '( FIELD LOG )',
      metaRight: '2026',
    },
    fetchDelayMs: 700,
    loadingLabel: 'LOADING…',
    emptyLabel: 'No entries yet: the notebook is open.',
    errorLabel: (status) => `Load error: server responded ${status}. Please retry in a moment.`,
    skeletonRows: 8,
    backLabel: '← ALL NOTES',
    posts: [
      {
        slug: 'money-has-no-if', date: '2026.06.12', title: "Money has no native 'if'",
        excerpt: 'Why conditional transfer is a primitive, not a feature request.',
        image: img('/media/agyion-ink.png', 'Conditional money'),
        body: [
          'Every payment system ships with an implicit appeal process: a queue, an agent, a ticket. The transfer itself is unconditional; the conditions live in the bureaucracy around it.',
          'agyionlabs moves the condition into the money itself. A rule, an oracle, a deadline: evidence moves funds forward, silence returns them.',
        ],
      },
    ],
  },

  contact: {
    hero: {
      left: 'Let’s',
      right: 'talk',
      desc: 'PARTNERSHIPS,\nORACLES & HELLOS',
      metaLeft: '©2026',
      metaCenter: '( GET IN TOUCH )',
      metaRight: 'REPLIES IN 48H',
    },
    marqueeWords: ["LET'S TALK"],
    form: {
      fields: [
        { id: 'name', label: 'Name', placeholder: 'Your Name', required: true, errorText: 'Your name is required.', type: 'text' },
        { id: 'email', label: 'Email', placeholder: '...@example.com', required: true, errorText: 'A valid email is required.', type: 'email' },
        { id: 'phone', label: 'Phone', placeholder: '+00 ...', required: true, errorText: 'A contact number is required.', type: 'tel' },
        { id: 'company', label: 'Company', placeholder: 'Company name', required: false, optionalTag: '(optional)', errorText: '', type: 'text' },
        { id: 'message', label: 'Project Brief', placeholder: 'Describe the scope, timing and goals in a few lines...', required: false, errorText: 'A few lines about the project helps.', type: 'textarea' },
      ],
      servicesLabel: 'SERVICES (SELECT ANY)',
      services: [
        { id: 'vault', label: 'Vault integration', prices: ['PILOT', 'PRODUCTION', 'PROTOCOL'] },
      ],
      priceLabel: 'ENGAGEMENT',
      selectedLabel: 'SELECTED',
      captchaLabel: 'Captcha',
      captchaError: 'Wrong sum: try again.',
      submitLabel: 'Submit',
      sendingLabel: 'SENDING…',
      successTitle: 'MESSAGE RECEIVED',
      successBody: 'Thanks for writing. We’ll reply within two working days.',
      resetLabel: 'SEND ANOTHER',
    },
  },

  notFound: {
    heading: 'ERROR 404: RULE NOT FOUND',
    messages: [
      'This route matches no condition.',
      'The vault returned your scroll.',
      'Press SPACE: jumping helps everyone.',
    ],
    ctaLabel: 'BACK TO THE VAULT',
    ctaHref: '/',
    hiScoreLabel: 'HI',
  },

  copy: {
    ui: {
      skipLink: 'Skip to content',
      cubeCaption: 'SCROLL TO ROTATE: LOCK · PROVE · EXECUTE · REFUND',
      galleryFragmentLabel: 'INSTRUMENT',
      notFoundHint: 'SPACE / TAP: RUN WITH THE RUNNER',
      notFoundGameOver: 'GAME OVER: SPACE TO RESTART',
      playPrefix: 'Play',
      removePrefix: 'Remove',
      caseImagesSuffix: 'case images',
    },
    a11y: {
      loading: 'Loading',
      menuNav: 'Primary',
      socials: 'Social links',
      cube: 'Instrument cube',
      showreel: 'Showreel',
      capabilities: 'How it works',
      capabilityNav: 'Steps navigation',
      workGrid: 'Instruments',
      moreProjects: 'More instruments',
      labTabs: 'Experiment categories',
      labBoard: 'Experiments',
      playbackProgress: 'Playback progress',
    },
    cursor: {
      home: 'HOME',
      contact: 'CONTACT',
      open: 'OPEN',
      top: 'TOP',
      view: 'VIEW',
      preview: 'PREVIEW',
      back: 'BACK',
      prev: 'PREV',
      next: 'NEXT',
      video: 'VIDEO',
    },
  },
}
