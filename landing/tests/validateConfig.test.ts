import { describe, expect, it } from 'vitest'
import { config } from '../src/config'
import { validateConfig } from '../src/lib/validateConfig'

/* config holds functions (blog.errorLabel) — JSON clone drops them, which is
 * fine because validateConfig never invokes them. */
const cloneConfig = () => JSON.parse(JSON.stringify(config)) as typeof config

describe('validateConfig', () => {
  it('accepts the shipped config', () => {
    expect(validateConfig(config)).toEqual([])
  })

  it('flags duplicate project slugs', () => {
    const bad = cloneConfig()
    bad.work.projects[1].slug = bad.work.projects[0].slug
    const errs = validateConfig(bad)
    expect(errs.some((e) => e.includes('duplicate') && e.includes('slug'))).toBe(true)
  })

  it('flags dangling lab categories', () => {
    const bad = cloneConfig()
    bad.lab.experiments[0].category = 'NO SUCH CATEGORY'
    const errs = validateConfig(bad)
    expect(errs.some((e) => e.includes('lab experiment') && e.includes('not in lab.categories'))).toBe(true)
  })

  it('flags illegal numeric bases', () => {
    const bad = cloneConfig()
    bad.cursor.magnetStrength = 1.4
    bad.noise.opacity = -0.2
    const errs = validateConfig(bad)
    expect(errs.some((e) => e.includes('magnetStrength'))).toBe(true)
    expect(errs.some((e) => e.includes('noise.opacity'))).toBe(true)
  })

  it('requires exactly 6 cube faces on home and about', () => {
    const bad = cloneConfig()
    bad.home.cube.faces = bad.home.cube.faces.slice(0, 5)
    bad.about.cube.faces = [...bad.about.cube.faces, bad.about.cube.faces[0]]
    const errs = validateConfig(bad)
    expect(errs.filter((e) => e.includes('6 faces') || e.includes('exactly 6')).length).toBeGreaterThanOrEqual(2)
  })

  it('flags bad hex colors and non-kebab ids', () => {
    const bad = cloneConfig()
    bad.theme.accent = 'gold'
    bad.menu.rows[0].id = 'Not Kebab'
    const errs = validateConfig(bad)
    expect(errs.some((e) => e.includes('theme.accent'))).toBe(true)
    expect(errs.some((e) => e.includes('kebab-case'))).toBe(true)
  })

  it('flags loader timing inversion', () => {
    const bad = cloneConfig()
    bad.home.loader.dismissMs = bad.home.loader.holdMs - 1
    expect(validateConfig(bad).some((e) => e.includes('loader'))).toBe(true)
  })

  it('flags malformed density layers', () => {
    const bad = cloneConfig()
    bad.home.statement.statusLines = [{ text: '  ', pos: 'middle' }]
    bad.home.statement.readout = ['ONLY_ONE']
    bad.home.hero.wordColumns = { left: [], right: ['x'] }
    bad.footer.watermark = '   '
    const errs = validateConfig(bad)
    expect(errs.some((e) => e.includes('statusLines'))).toBe(true)
    expect(errs.some((e) => e.includes('readout'))).toBe(true)
    expect(errs.some((e) => e.includes('wordColumns'))).toBe(true)
    expect(errs.some((e) => e.includes('footer.watermark'))).toBe(true)
  })
})
