/* Runtime config validation. Runs before render; throws with a readable
 * message list so content editors see every problem at once.
 */
import type { SiteConfig } from '../types'

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

function checkUnique(ids: string[], what: string, errs: string[]) {
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) errs.push(`${what}: duplicate id "${id}"`)
    seen.add(id)
  }
}

export function validateConfig(cfg: SiteConfig): string[] {
  const errs: string[] = []

  /* theme */
  for (const [k, v] of Object.entries(cfg.theme)) {
    if (k === 'menuLine') continue // rgba() string
    if (k === 'depthZones') continue // nested zone palette, checked below
    if (!HEX.test(v)) errs.push(`theme.${k}: "${v}" is not a hex color`)
  }
  if (cfg.theme.depthZones) {
    for (const [zone, v] of Object.entries(cfg.theme.depthZones)) {
      if (!HEX.test(v)) errs.push(`theme.depthZones.${zone}: "${v}" is not a hex color`)
    }
    const ZONES = ['surface', 'drift', 'twilight', 'deep', 'abyss']
    for (const z of ZONES)
      if (!(z in cfg.theme.depthZones)) errs.push(`theme.depthZones: missing zone "${z}"`)
  }
  /* depth gauge */
  if (cfg.depthGauge !== undefined) {
    if (typeof cfg.depthGauge.enabled !== 'boolean') errs.push('depthGauge.enabled must be a boolean')
    if (cfg.depthGauge.maxDepthM !== undefined && !(cfg.depthGauge.maxDepthM > 0 && cfg.depthGauge.maxDepthM <= 11000))
      errs.push('depthGauge.maxDepthM must be within 1..11000')
  }

  /* menu */
  const menuIds = cfg.menu.rows.map((r) => r.id)
  checkUnique(menuIds, 'menu.rows', errs)
  if (cfg.menu.form !== undefined && !['pill', 'dock'].includes(cfg.menu.form))
    errs.push(`menu.form: must be 'pill' or 'dock'`)
  if (cfg.menu.layout !== undefined && !['stage', 'ledger'].includes(cfg.menu.layout))
    errs.push(`menu.layout: must be 'stage' or 'ledger'`)
  for (const r of cfg.menu.rows) {
    if (!KEBAB.test(r.id)) errs.push(`menu row "${r.id}": id must be kebab-case`)
    if (!r.href.startsWith('/')) errs.push(`menu row "${r.id}": href must start with /`)
    if (!r.label.trim()) errs.push(`menu row "${r.id}": empty label`)
    if (r.thumbs.length !== 2) errs.push(`menu row "${r.id}": needs exactly 2 thumbs`)
  }
  if (cfg.menu.rows.length < 2 || cfg.menu.rows.length > 7)
    errs.push(`menu.rows: ${cfg.menu.rows.length} rows: engine supports 2..7`)

  /* cursor + noise numeric bases */
  if (cfg.cursor.magnetStrength < 0 || cfg.cursor.magnetStrength > 1)
    errs.push('cursor.magnetStrength must be within 0..1')
  if (cfg.noise.opacity < 0 || cfg.noise.opacity > 1) errs.push('noise.opacity must be within 0..1')
  if (cfg.noise.density < 0 || cfg.noise.density > 1) errs.push('noise.density must be within 0..1')
  if (cfg.noise.fps <= 0 || cfg.noise.fpsHold <= 0) errs.push('noise fps values must be > 0')
  if (cfg.noise.fpsHold > cfg.noise.fps) errs.push('noise.fpsHold should not exceed noise.fps')

  /* home */
  if (cfg.home.loader.holdMs < 0 || cfg.home.loader.dismissMs < cfg.home.loader.holdMs)
    errs.push('home.loader: dismissMs must be >= holdMs >= 0')
  if (cfg.home.cube.faces.length !== 6)
    errs.push(`home.cube.faces: ${cfg.home.cube.faces.length}: a cube has exactly 6 faces`)
  if (!cfg.home.hero.brandWord.trim()) errs.push('home.hero.brandWord is empty')
  if (cfg.home.hero.brandWordOutline !== undefined && !cfg.home.hero.brandWordOutline.trim())
    errs.push('home.hero.brandWordOutline: empty string')
  if (cfg.home.statement.heightPx < 1000) errs.push('home.statement.heightPx unreasonably small')
  if (!cfg.home.statement.manifesto) {
    if (cfg.home.statement.groups.flat().filter((w) => w.size === 'xl').length === 0)
      errs.push('home.statement: needs at least one xl display letter')
  }
  if (cfg.home.statement.manifesto) {
    const m = cfg.home.statement.manifesto
    if (m.lines.length < 3) errs.push('home.statement.manifesto.lines: need at least 3 lines')
    for (const ln of m.lines) {
      if (!ln.text.trim()) errs.push('home.statement.manifesto: empty line')
      if (ln.em !== undefined && !ln.text.includes(ln.em))
        errs.push(`home.statement.manifesto: em "${ln.em}" is not a substring of its line`)
    }
  }
  if (cfg.home.gallery.images.length < 2) errs.push('home.gallery.images: need at least 2')
  if (cfg.home.gallery.cards) {
    if (cfg.home.gallery.cards.length !== cfg.home.gallery.images.length)
      errs.push('home.gallery.cards: must match images 1:1')
    for (const c of cfg.home.gallery.cards) {
      if (!c.tag.trim()) errs.push('home.gallery.cards: empty tag')
      if (!c.body.trim()) errs.push('home.gallery.cards: empty body')
    }
  }
  if (cfg.home.hero.ctas) {
    if (cfg.home.hero.ctas.length > 3) errs.push('home.hero.ctas: at most 3 buttons')
    for (const c of cfg.home.hero.ctas) {
      if (!c.label.trim()) errs.push('home.hero.ctas: empty label')
      if (!/^(https?:\/\/|\/|#)/.test(c.href)) errs.push(`home.hero.ctas "${c.label}": href must start with /, # or http(s)`)
    }
  }
  if (typeof cfg.home.hero.waveDrift !== 'boolean') errs.push('home.hero.waveDrift must be a boolean')
  /* optional density layers */
  const POS = ['left', 'q1', 'q3', 'right']
  if (cfg.home.hero.wordColumns) {
    const wc = cfg.home.hero.wordColumns
    if (!wc.left.length || !wc.right.length)
      errs.push('home.hero.wordColumns: left/right word lists must be non-empty')
    for (const w of [...wc.left, ...wc.right])
      if (!w.trim()) errs.push('home.hero.wordColumns: empty word')
  }
  if (cfg.home.statement.statusLines) {
    for (const s of cfg.home.statement.statusLines) {
      if (!s.text.trim()) errs.push('home.statement.statusLines: empty text')
      if (!POS.includes(s.pos)) errs.push(`home.statement.statusLines: bad pos "${s.pos}"`)
    }
  }
  if (cfg.home.statement.readout) {
    if (cfg.home.statement.readout.length !== 3)
      errs.push('home.statement.readout: exactly 3 tokens')
    for (const t of cfg.home.statement.readout)
      if (!t.trim()) errs.push('home.statement.readout: empty token')
  }
  if (cfg.footer.watermark !== undefined && !cfg.footer.watermark.trim())
    errs.push('footer.watermark: empty string')
  if (cfg.footer.videoTag !== undefined && !cfg.footer.videoTag.trim())
    errs.push('footer.videoTag: empty string')
  if (cfg.footer.cta !== undefined) {
    if (!cfg.footer.cta.label.trim()) errs.push('footer.cta.label: empty string')
    if (!/^(https?:\/\/|\/|#)/.test(cfg.footer.cta.href)) errs.push('footer.cta.href must start with /, # or http(s)')
  }
  if (cfg.footer.video !== undefined && !cfg.footer.video.src.trim()) errs.push('footer.video.src: empty string')
  if (cfg.footer.ctaKicker !== undefined && !cfg.footer.ctaKicker.trim())
    errs.push('footer.ctaKicker: empty string')
  /* optional scroll-fidelity layers (fix2 additions) */
  if (cfg.home.hero.waveOverlap !== undefined && typeof cfg.home.hero.waveOverlap !== 'boolean')
    errs.push('home.hero.waveOverlap must be a boolean')
  /* optional hero composition layers (fix3 additions) */
  if (cfg.home.hero.bgImage !== undefined && !cfg.home.hero.bgImage.src.trim())
    errs.push('home.hero.bgImage: empty src')
  if (cfg.home.hero.bgDim !== undefined && (cfg.home.hero.bgDim < 0 || cfg.home.hero.bgDim > 1))
    errs.push('home.hero.bgDim must be within 0..1')
  if (cfg.home.hero.titleVw !== undefined && !(cfg.home.hero.titleVw >= 6 && cfg.home.hero.titleVw <= 30))
    errs.push('home.hero.titleVw must be within 6..30')
  if (cfg.home.hero.stack !== undefined && typeof cfg.home.hero.stack !== 'boolean')
    errs.push('home.hero.stack must be a boolean')
  if (cfg.home.hero.composition !== undefined && !['banner', 'poster', 'ledger'].includes(cfg.home.hero.composition))
    errs.push(`home.hero.composition: must be 'banner', 'poster' or 'ledger'`)
  if (cfg.home.cube.zoom) {
    const z = cfg.home.cube.zoom
    if (!(z.vw > 0 && z.vw <= 1 && z.vh > 0 && z.vh <= 1 && z.scale > 0 && z.scale <= 1))
      errs.push('home.cube.zoom: vw/vh/scale must be within 0..1')
  }
  if (cfg.home.statement.spotlight) {
    const s = cfg.home.statement.spotlight
    if (s.baseOpacity !== undefined && (s.baseOpacity < 0 || s.baseOpacity > 1))
      errs.push('home.statement.spotlight.baseOpacity must be within 0..1')
    if (s.farBlurPx !== undefined && (s.farBlurPx < 0 || s.farBlurPx > 12))
      errs.push('home.statement.spotlight.farBlurPx must be within 0..12')
    if (s.scramble !== undefined && typeof s.scramble !== 'boolean')
      errs.push('home.statement.spotlight.scramble must be a boolean')
  }
  /* optional signature fluid field */
  if (cfg.home.hero.fluid) {
    const f = cfg.home.hero.fluid
    if (typeof f.enabled !== 'boolean') errs.push('home.hero.fluid.enabled must be a boolean')
    if (f.speed !== undefined && !(f.speed >= 0 && f.speed <= 3)) errs.push('home.hero.fluid.speed must be within 0..3')
    if (f.strength !== undefined && (f.strength < 0 || f.strength > 1)) errs.push('home.hero.fluid.strength must be within 0..1')
    if (f.mouse !== undefined && typeof f.mouse !== 'boolean') errs.push('home.hero.fluid.mouse must be a boolean')
  }
  if (cfg.home.gallery.card) {
    const c = cfg.home.gallery.card
    if (!(c.minPx > 0 && c.vw > 0 && c.maxPx >= c.minPx))
      errs.push('home.gallery.card: need 0 < minPx <= maxPx and vw > 0')
    if (!/^\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?$/.test(c.aspect))
      errs.push('home.gallery.card.aspect: use "w / h" form, e.g. "4 / 3"')
  }

  /* about */
  if (cfg.about.cube.faces.length !== 6)
    errs.push(`about.cube.faces: ${cfg.about.cube.faces.length}: carousel has exactly 6 faces`)
  if (cfg.about.years.to < cfg.about.years.from) errs.push('about.years: to < from')
  checkUnique(cfg.about.roster.clients.map((c) => c.name), 'about.roster.clients', errs)

  /* work */
  const projIds = cfg.work.projects.map((p) => p.id)
  const projSlugs = cfg.work.projects.map((p) => p.slug)
  checkUnique(projIds, 'work.projects', errs)
  checkUnique(projSlugs, 'work.project slugs', errs)
  for (const p of cfg.work.projects) {
    if (!KEBAB.test(p.slug)) errs.push(`work project "${p.id}": slug must be kebab-case`)
    if (p.images.length === 0) errs.push(`work project "${p.id}": needs at least 1 gallery image`)
    if (!p.title.trim()) errs.push(`work project "${p.id}": empty title`)
  }
  if (cfg.work.projects.length < 2) errs.push('work.projects: need at least 2 for prev/next nav')
  if (typeof cfg.work.stagger !== 'boolean') errs.push('work.stagger must be a boolean')

  /* lab */
  const labIds = cfg.lab.experiments.map((e) => e.id)
  checkUnique(labIds, 'lab.experiments', errs)
  for (const e of cfg.lab.experiments) {
    if (!cfg.lab.categories.includes(e.category))
      errs.push(`lab experiment "${e.id}": category "${e.category}" not in lab.categories`)
  }
  if (cfg.lab.categories.length === 0) errs.push('lab.categories: empty')

  /* blog */
  const postSlugs = cfg.blog.posts.map((p) => p.slug)
  checkUnique(postSlugs, 'blog.post slugs', errs)
  for (const p of cfg.blog.posts) {
    if (!KEBAB.test(p.slug)) errs.push(`blog post "${p.slug}": slug must be kebab-case`)
    if (p.body.length === 0) errs.push(`blog post "${p.slug}": empty body`)
  }
  if (cfg.blog.fetchDelayMs < 0) errs.push('blog.fetchDelayMs must be >= 0')
  if (cfg.blog.skeletonRows < 1) errs.push('blog.skeletonRows must be >= 1')

  /* contact */
  const fieldIds = cfg.contact.form.fields.map((f) => f.id)
  checkUnique(fieldIds, 'contact.form.fields', errs)
  for (const f of cfg.contact.form.fields) {
    if (f.required && !f.errorText) errs.push(`contact field "${f.id}": required but no errorText`)
  }
  const svcIds = cfg.contact.form.services.map((s) => s.id)
  checkUnique(svcIds, 'contact.form.services', errs)
  for (const s of cfg.contact.form.services) {
    if (s.prices.length === 0) errs.push(`contact service "${s.id}": no price options`)
  }

  /* 404 */
  if (cfg.notFound.messages.length === 0) errs.push('notFound.messages: empty')
  if (!cfg.notFound.ctaHref.startsWith('/')) errs.push('notFound.ctaHref must start with /')

  /* interface copy: every engine string must be present and non-empty */
  if (!cfg.copy || typeof cfg.copy !== 'object') {
    errs.push('copy: missing interface copy groups (ui/a11y/cursor)')
  } else {
    for (const group of ['ui', 'a11y', 'cursor'] as const) {
      const g = cfg.copy[group]
      if (!g || typeof g !== 'object') {
        errs.push(`copy.${group}: missing group`)
        continue
      }
      for (const [k, v] of Object.entries(g)) {
        if (typeof v !== 'string' || !v.trim()) errs.push(`copy.${group}.${k}: empty or missing`)
      }
    }
  }

  /* media references exist as strings */
  const allMedia: string[] = [
    ...cfg.menu.rows.flatMap((r) => r.thumbs.map((t) => t.src)),
    ...cfg.work.projects.flatMap((p) => [p.cover.src, p.hero.src, ...p.images.map((i) => i.src)]),
    ...cfg.lab.experiments.map((e) => e.image.src),
    ...cfg.blog.posts.map((p) => p.image.src),
  ]
  for (const src of allMedia) {
    if (!src || (!src.startsWith('/') && !src.startsWith('http')))
      errs.push(`media src "${src}" must be an absolute path or URL`)
  }

  return errs
}

/** Throws when the config is invalid; returns the config for chaining. */
export function assertValidConfig(cfg: SiteConfig): SiteConfig {
  const errs = validateConfig(cfg)
  if (errs.length) {
    throw new Error(`Invalid site config (${errs.length} problem${errs.length === 1 ? '' : 's'}):\n` + errs.map((e) => `  - ${e}`).join('\n'))
  }
  return cfg
}
