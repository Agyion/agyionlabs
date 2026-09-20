/**
 * Template browser acceptance matrix — config-aware edition.
 * Expected values (counts, labels, slugs, colors, copy) are read from the
 * instance's src/config.ts, so consumers can re-run this matrix unchanged
 * after adapting the config. Geometry is measured from the live DOM.
 *
 *   BASE_URL=http://localhost:4173 npm run test:e2e
 *
 * Best-effort: skips cleanly (exit 0) when playwright-core or a chromium
 * executable is unavailable in the current environment.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { config } = await import('../../src/config.ts')

function findChromium() {
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright')
  const candidates = []
  try {
    for (const dir of fs.readdirSync(cache)) {
      for (const rel of [
        'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
        'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
        'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
        'chrome-linux/chrome',
        'chrome-win/chrome.exe',
      ]) {
        const p = path.join(cache, dir, rel)
        if (fs.existsSync(p)) candidates.push(p)
      }
    }
  } catch {
    return null
  }
  return candidates.sort().pop() ?? null
}

const EXE = findChromium()
if (!EXE) {
  console.log('SKIP  no chromium executable found in ~/Library/Caches/ms-playwright — e2e matrix skipped')
  process.exit(0)
}
const { chromium } = await import('playwright-core').catch(() => {
  console.log('SKIP  playwright-core not installed — e2e matrix skipped')
  process.exit(0)
})

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol

/* hex → 'rgb(r, g, b)' as serialized by getComputedStyle */
const rgb = (hex) => {
  const h = hex.replace('#', '')
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `rgb(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255})`
}
const SURFACE = rgb(config.theme.surface)
const MENUBG = rgb(config.theme.menuBg)
const ACCENT = rgb(config.theme.accent)
const ACCENT_ZONED = (() => {
  if (!config.theme.depthZones) return rgb(config.theme.accent)
  const m = rgb(config.theme.accent).match(/\d+/g).map(Number)
  return `rgb(${Math.round(m[0] * 0.58)}, ${Math.round(m[1] * 0.58)}, ${Math.round(m[2] * 0.58)})`
})()
/* form/composition switches (engine defaults when absent) */
const NAV_FORM = config.menu.form ?? 'pill'
const HERO_COMPOSITION = config.home.hero.composition ?? 'banner'
/* layout, gauge, zone and statement switches */
const MENU_LAYOUT = config.menu.layout ?? 'stage'
const DEPTH_GAUGE = config.depthGauge?.enabled === true
const DEPTH_ZONES = !!config.theme.depthZones
const MANIFESTO = config.home.statement.manifesto?.lines?.length ? config.home.statement.manifesto.lines : null
const FLUID_TONE = HERO_COMPOSITION === 'ledger' && !config.home.hero.bgImage ? 'light' : 'dark'
/* dock chrome: color-mix(in srgb, surface 78%, transparent) as serialized */
const DOCK_BG = SURFACE.replace('rgb(', 'rgba(').replace(')', ', 0.78)')

/* config-derived expectations */
const ROWS = config.menu.rows.length
const PROJECTS = config.work.projects
const EXPERIMENTS = config.lab.experiments
const POSTS = config.blog.posts
const TABS = [config.lab.allLabel, ...config.lab.categories]
const SECOND_TAB_COUNT = EXPERIMENTS.filter((e) => e.category === config.lab.categories[0]).length
const XL_WORDS = config.home.statement.groups.flat().filter((w) => w.size === 'xl').length
const REQUIRED_FIELD_IDS = config.contact.form.fields.filter((f) => f.required).map((f) => f.id)
const FIRST_PROJECT = PROJECTS[0]
const SECOND_PROJECT = PROJECTS[1 % PROJECTS.length]

;(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true })

  /* ---------- global chrome: pill, menu morph, cursor, progress ---------- */
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const consoleErrors = []
    page.on('pageerror', (e) => consoleErrors.push(e.message))
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
    await page.goto(BASE + '/work', { waitUntil: 'networkidle' })
    await page.waitForTimeout(900)

    // pill geometry (engine spec) — dock form: frosted capsule at bottom edge
    const pill = await page.evaluate(() => {
      const el = document.querySelector('.nav-shell')
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return { x: r.x, y: r.y, w: r.width, h: r.height, bg: cs.backgroundColor, radius: cs.borderRadius, z: cs.zIndex }
    })
    check(
      NAV_FORM === 'dock'
        ? 'nav dock: 500×64 capsule @bottom30 centered, frosted surface z10000'
        : 'pill: 500×64 @top30 centered, surface r6 z10000',
      near(pill.w, 500) &&
        near(pill.h, 64) &&
        near(pill.x, 470) &&
        pill.z === '10000' &&
        (NAV_FORM === 'dock'
          ? near(pill.y, 900 - 30 - 64) && pill.bg === DOCK_BG && pill.radius === '999px'
          : near(pill.y, 30) && pill.bg === SURFACE && pill.radius === '6px'),
      JSON.stringify(pill),
    )

    // cursor dot + ring (engine spec)
    const cursor = await page.evaluate(() => {
      const d = getComputedStyle(document.querySelector('.cursor-dot'))
      const r = getComputedStyle(document.querySelector('.cursor-ring'))
      return { dw: d.width, dh: d.height, dblend: d.mixBlendMode, rblend: r.mixBlendMode }
    })
    check(
      'cursor: 6px dot difference + ring difference',
      cursor.dw === '6px' && cursor.dh === '6px' && cursor.dblend === 'difference' && cursor.rblend === 'difference',
      JSON.stringify(cursor),
    )

    // ring grows to 68px with the config'd label on card hover
    await page.hover('.work-card__link')
    await page.waitForTimeout(700)
    const ringHover = await page.evaluate(() => {
      const r = document.querySelector('.cursor-ring')
      return { w: getComputedStyle(r).width, label: r.getAttribute('data-cursor-label'), isLink: r.classList.contains('is-link') }
    })
    check(
      'cursor: 68px ring + config preview label on hover',
      ringHover.w === '68px' && ringHover.isLink && ringHover.label === config.work.previewLabel,
      JSON.stringify(ringHover),
    )

    // menu morph + rows + theatre
    await page.click('.nav-burger')
    await page.waitForTimeout(1800)
    const menu = await page.evaluate(() => {
      const el = document.querySelector('.nav-shell')
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      const rows = [...document.querySelectorAll('.menu-row')]
      const t = getComputedStyle(document.querySelector('.menu-row__title'))
      return {
        w: r.width, h: r.height, bg: cs.backgroundColor, radius: cs.borderRadius,
        rows: rows.length, rowH: rows[0]?.getBoundingClientRect().height,
        titleFont: t.fontFamily, titleSize: t.fontSize, titleLh: t.lineHeight, titleLs: t.letterSpacing, titleWeight: t.fontWeight, titleText: document.querySelector('.menu-row__layer.is-primary')?.textContent?.trim(),
        expanded: document.querySelector('.nav-burger').getAttribute('aria-expanded'),
        menuNavAria: document.querySelector('.menu-stage')?.getAttribute('aria-label'),
      }
    })
    check(
      'menu: morphs to 100vw×100vh menuBg r0',
      near(menu.w, 1440) && near(menu.h, 900) && menu.bg === MENUBG && menu.radius === '0px' && menu.expanded === 'true',
      JSON.stringify({ w: menu.w, h: menu.h, bg: menu.bg, radius: menu.radius }),
    )
    const expectRowH = (900 - 64) / ROWS
    check(
      `menu: ${ROWS} rows (config), rowH= (900-64)/rows ≥92px`,
      menu.rows === ROWS && near(menu.rowH, expectRowH, 1) && menu.rowH >= 92,
      `rows=${menu.rows} rowH=${menu.rowH} expect≈${expectRowH}`,
    )
    if (MENU_LAYOUT === 'ledger') {
      /* ledger rows — Bricolage 800 capitalised title,
       * clamp(40,6.2vw,84), ls -0.03em, mono index cell present */
      const expectSize = Math.min(84, Math.max(40, 0.062 * 1440))
      check(
        'menu: ledger row title — Bricolage 800 clamp(40,6.2vw,84) ls -0.03em, capitalised',
        menu.titleFont.includes('Bricolage') && menu.titleWeight === '800' && near(parseFloat(menu.titleSize), expectSize) && near(parseFloat(menu.titleLs), -0.03 * expectSize, 0.2) && menu.titleText === 'Home',
        `${menu.titleFont.slice(0, 24)} w=${menu.titleWeight} ${menu.titleSize} ls=${menu.titleLs} text=${menu.titleText}`,
      )
    } else {
      check(
        'menu: row title display 600 clamp(56,7vw,90) lh .92 ls -.04em',
        menu.titleFont.includes('Bricolage') && menu.titleWeight === '600' && near(parseFloat(menu.titleSize), Math.min(90, Math.max(56, 0.07 * 1440))) && near(parseFloat(menu.titleLh) / parseFloat(menu.titleSize), 0.92, 0.01) && menu.titleLs === `${(-0.04 * parseFloat(menu.titleSize)).toFixed(1)}px`,
        `${menu.titleFont.slice(0, 24)} w=${menu.titleWeight} ${menu.titleSize} lh=${menu.titleLh} ls=${menu.titleLs}`,
      )
    }
    check('copy-follow: menu nav aria from config.copy.a11y.menuNav', menu.menuNavAria === config.copy.a11y.menuNav, menu.menuNavAria)

    // row hover theatre
    await page.hover('.menu-row:nth-child(3)')
    await page.waitForTimeout(800)
    const hover = await page.evaluate(() => {
      const row = document.querySelector('.menu-row:nth-child(3)')
      const primary = row.querySelector('.menu-row__layer.is-primary')
      const accent = row.querySelector('.menu-row__layer.is-accent')
      const thumbs = [...row.querySelectorAll('.menu-row__thumb')].map((t) => {
        const r = t.getBoundingClientRect()
        const cs = getComputedStyle(t)
        return { w: r.width, h: r.height, opacity: cs.opacity, clip: cs.clipPath, parent: t.offsetParent?.className }
      })
      return {
        pt: getComputedStyle(primary).transform,
        at: getComputedStyle(accent).transform,
        ac: getComputedStyle(accent).color,
        layerH: primary.getBoundingClientRect().height,
        thumbs,
      }
    })
    const ptY = (() => {
      const m = hover.pt.match(/matrix\([^)]*,\s*(-?[\d.]+)\)$/)
      return m ? parseFloat(m[1]) : 0
    })()
    check(
      'menu row hover: primary -104% / accent 0, accent color = theme.accent',
      near(ptY, -hover.layerH * 1.04, 1.5) && (hover.at === 'none' || hover.at.includes('matrix(1, 0, 0, 1, 0, 0)')) && hover.ac === ACCENT,
      `pt=${hover.pt} at=${hover.at} ac=${hover.ac}`,
    )
    check(
      'menu row hover: thumbs 162×108 clip-revealed, anchored to row',
      hover.thumbs.length === 2 && hover.thumbs.every((t) => near(t.w, 162, 2) && near(t.h, 108, 2) && t.opacity === '1' && t.clip === 'inset(0%)' && String(t.parent).includes('menu-row')),
      JSON.stringify(hover.thumbs),
    )

    // close → pill again
    await page.keyboard.press('Escape')
    await page.waitForTimeout(1000)
    const closed = await page.evaluate(() => {
      const r = document.querySelector('.nav-shell').getBoundingClientRect()
      const cs = getComputedStyle(document.querySelector('.nav-shell'))
      return { w: r.width, h: r.height, bg: cs.backgroundColor, radius: cs.borderRadius }
    })
    check(
      NAV_FORM === 'dock' ? 'menu close: back to 500×64 frosted capsule' : 'menu close: back to 500×64 surface r6',
      near(closed.w, 500) &&
        near(closed.h, 64) &&
        (NAV_FORM === 'dock' ? closed.bg === DOCK_BG && closed.radius === '999px' : closed.bg === SURFACE && closed.radius === '6px'),
      JSON.stringify(closed),
    )

    // progress chrome + show-nav-scroll class
    await page.evaluate(() => window.scrollTo(0, 800))
    await page.waitForTimeout(600)
    const scrollCls = await page.evaluate(() => document.documentElement.className)
    if (DEPTH_GAUGE) {
      /* signature chrome: right-edge depth gauge — drop
       * marker tracks scroll, mono readout counts the descent */
      await page.evaluate(() => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) / 2))
      await page.waitForTimeout(1200)
      const prog = await page.evaluate(() => ({
        gauge: !!document.querySelector('.depth-gauge'),
        dropTop: parseFloat(document.querySelector('.depth-gauge__drop')?.style.top ?? '0'),
        read: document.querySelector('.depth-gauge__read')?.textContent ?? '',
      }))
      check('depth gauge: present, drop descends, readout counts metres', prog.gauge && prog.dropTop > 20 && /^−\d{3,4} M$/.test(prog.read) && prog.read !== '−0000 M', JSON.stringify(prog))
    } else {
      const prog = await page.evaluate(() => ({
        w: document.querySelector('.scroll-progress').style.width,
        cls: document.documentElement.className,
      }))
      check('progress bar width grows on scroll', parseFloat(prog.w) > 5, `w=${prog.w}`)
    }
    check('show-nav-scroll class past threshold', scrollCls.includes('show-nav-scroll'), scrollCls)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(400)

    check('desktop: no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
    await page.close()
  }

  /* ---------- work list + detail ---------- */
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(BASE + '/work', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)

    const hero = await page.evaluate(() => {
      const w1 = document.querySelector('.ledger-hero__w1')
      const w2 = document.querySelector('.ledger-hero__w2')
      const cs = getComputedStyle(w1)
      const cs2 = w2 ? getComputedStyle(w2) : null
      const strip = [...document.querySelectorAll('.ledger-hero__cell')].map((c) => c.textContent.trim())
      return {
        size: cs.fontSize, ls: cs.letterSpacing, ff: cs.fontFamily, weight: cs.fontWeight,
        w2weight: cs2?.fontWeight ?? null, w2stroke: cs2?.webkitTextStrokeWidth ?? null, w2color: cs2?.color ?? null,
        strip,
      }
    })
    /* ledger hero: weight-contrast pair on the foam zone —
     * w1 Bricolage 800, w2 light outline, mono data strip from config meta */
    const heroSize = Math.min(168, Math.max(64, 0.115 * 1440))
    check(
      'ledger hero: Bricolage 800 w1 + outline w2 (weight contrast)',
      hero.ff.includes('Bricolage') && hero.weight === '800' && near(parseFloat(hero.size), heroSize) && near(parseFloat(hero.ls), -0.025 * heroSize, 0.3) &&
        hero.w2weight !== null && parseInt(hero.w2weight) <= 400 && parseFloat(hero.w2stroke) >= 1 && hero.w2color === 'rgba(0, 0, 0, 0)',
      JSON.stringify(hero),
    )
    check(
      'ledger hero: data strip = config meta triple',
      hero.strip.join('|') === [config.work.hero.metaLeft, config.work.hero.metaCenter, config.work.hero.metaRight].join('|'),
      hero.strip.join(' / '),
    )

    const grid = await page.evaluate(() => {
      const g = document.querySelector('.work-grid')
      const gcs = getComputedStyle(g)
      const padX = parseFloat(gcs.paddingLeft)
      const gap = parseFloat(gcs.gap)
      const card = document.querySelector('.work-card__box').getBoundingClientRect()
      return { cols: gcs.gridTemplateColumns.split(' ').length, w: card.width, h: card.height, count: document.querySelectorAll('.work-card').length, expectW: (1440 - 2 * padX - gap) / 2, ratio: card.width / card.height }
    })
    check(
      `work grid: 2 cols ×${PROJECTS.length} (config), first card = (vw-pad-gap)/2 × /1.63`,
      grid.cols === 2 && grid.count === PROJECTS.length && near(grid.w, grid.expectW, 1) && near(grid.ratio, 1.63, 0.01),
      JSON.stringify(grid),
    )

    // card hover: cover scale 1.05, overlay on
    await page.hover('.work-card:first-child .work-card__link')
    await page.waitForTimeout(900)
    const cardHover = await page.evaluate(() => {
      const img = document.querySelector('.work-card__cover')
      return { t: getComputedStyle(img).transform, tr: getComputedStyle(img).transitionDuration, o: getComputedStyle(document.querySelector('.work-card__blur')).opacity }
    })
    check('work card hover: img scale(1.05) 0.72s + overlay opacity 1', cardHover.t.includes('1.05') && cardHover.tr === '0.72s' && cardHover.o === '1', JSON.stringify(cardHover))

    // detail page (first project from config)
    await page.click('.work-card:first-child .work-card__link')
    await page.waitForTimeout(1200)
    check('work detail: route /work/<first config slug>', page.url().endsWith(`/work/${FIRST_PROJECT.slug}`), page.url())
    const dh = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('.wd-hero__title'))
      const item = document.querySelector('.wd-grid__item').getBoundingClientRect()
      return { size: cs.fontSize, lh: cs.lineHeight, iw: item.width, ih: item.height }
    })
    check('detail hero title 60px/60px', near(parseFloat(dh.size), 60) && near(parseFloat(dh.lh), 60), `${dh.size}/${dh.lh}`)
    check('detail grid item ≈688×459 (engine spec)', near(dh.iw, 688, 2) && near(dh.ih, 459, 2), `${dh.iw}×${dh.ih}`)
    const navCount = await page.$$eval('.wd-nav a', (els) => els.length)
    check('detail prev/next arrows', navCount === 2, `count=${navCount}`)
    await page.click('.wd-nav a:last-child')
    await page.waitForTimeout(900)
    check('detail next → adjacent config project', page.url().endsWith(`/work/${SECOND_PROJECT.slug}`), page.url())
    await page.close()
  }

  /* ---------- lab ---------- */
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(BASE + '/lab', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)

    const tabs = await page.$$eval('.lab-tab', (els) => els.map((e) => e.textContent.trim()))
    check('lab: tabs = [allLabel, ...categories] (config)', JSON.stringify(tabs) === JSON.stringify(TABS), tabs.join('|'))
    const total = await page.$$eval('.lab-item', (els) => els.length)
    check(`lab: ${EXPERIMENTS.length} experiments (config)`, total === EXPERIMENTS.length, `count=${total}`)

    await page.click('.lab-tab:nth-child(2)')
    await page.waitForTimeout(500)
    const filt = await page.evaluate(() => ({
      active: document.querySelector('.lab-tab.is--active')?.textContent.trim(),
      dimmed: document.querySelectorAll('.lab-item.is--filtered-out').length,
    }))
    check(
      'lab: tab click → is--active + non-matching dimmed (config counts)',
      filt.active === config.lab.categories[0] && filt.dimmed === EXPERIMENTS.length - SECOND_TAB_COUNT,
      JSON.stringify(filt),
    )

    // lightbox + cursor-native hook decoupled from label text
    await page.click('.lab-tab:nth-child(1)')
    await page.waitForTimeout(400)
    const hook = await page.evaluate(() => {
      const el = document.querySelector('.lab-item:has(.lab-item__play) .lab-item__media')
      return { native: el?.hasAttribute('data-cursor-native'), label: el?.getAttribute('data-cursor'), cursor: el ? getComputedStyle(el).cursor : null }
    })
    check(
      'cursor hook: video card carries data-cursor-native + config video label + native pointer',
      hook.native && hook.label === config.copy.cursor.video && hook.cursor === 'pointer',
      JSON.stringify(hook),
    )
    await page.click('.lab-item:has(.lab-item__play) .lab-item__media')
    await page.waitForTimeout(900)
    const lb = await page.evaluate(() => {
      const el = document.querySelector('.lightbox__wrap')
      const r = el.getBoundingClientRect()
      return { active: document.querySelector('.lightbox').classList.contains('is-active'), w: r.width, h: document.querySelector('.lightbox__media').getBoundingClientRect().height, x: r.x }
    })
    check('lab lightbox: opens 1000×562.5 (16:9) centered', lb.active && near(lb.w, 1000) && near(lb.h, 562.5, 1) && near(lb.x, 220), JSON.stringify(lb))
    const ctrls = await page.evaluate(() => ({
      mute: !!document.getElementById('video-mute-btn'),
      progress: !!document.getElementById('video-progress-fill'),
      toast: !!document.getElementById('lightbox-toast'),
    }))
    check('lab lightbox: play/progress/mute/toast controls', ctrls.mute && ctrls.progress && ctrls.toast)
    await page.click('#video-mute-btn')
    await page.waitForTimeout(300)
    const toastOn = await page.evaluate(() => document.getElementById('lightbox-toast').classList.contains('is-visible'))
    check('lab lightbox: mute toggles toast', toastOn)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    check('lab lightbox: Esc closes', !(await page.evaluate(() => document.querySelector('.lightbox').classList.contains('is-active'))))
    await page.close()
  }

  /* ---------- blog: skeleton → rows, error state, hover image ---------- */
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(BASE + '/blog', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(250)
    const sk = await page.$$eval('.blog-post--sk', (els) => els.length)
    check('blog: skeleton rows = config.skeletonRows', sk === config.blog.skeletonRows, `sk=${sk}`)
    await page.waitForTimeout(Math.max(1200, config.blog.fetchDelayMs + 600))
    const rows = await page.$$eval('.blog-grid .blog-post:not(.blog-post--sk)', (els) => els.length)
    check(`blog: ${POSTS.length} posts after fetch (config)`, rows === POSTS.length, `rows=${rows}`)

    await page.hover('.blog-grid .blog-post:first-child')
    await page.waitForTimeout(500)
    const hoverImg = await page.evaluate(() => {
      const el = document.getElementById('blog-hover-img')
      const r = el.getBoundingClientRect()
      return { vis: el.classList.contains('is-visible'), ratio: r.width / r.height }
    })
    check('blog: hover-follow image visible 4:3', hoverImg.vis && near(hoverImg.ratio, 4 / 3, 0.05), JSON.stringify(hoverImg))

    await page.click('.blog-grid .blog-post:first-child')
    await page.waitForTimeout(800)
    check('blog: detail route = first config post slug', page.url().endsWith(`/blog/${POSTS[0].slug}`) && (await page.isVisible('.blog-detail__body p')), page.url())

    await page.goto(BASE + '/blog?blogError=1', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(Math.max(1200, config.blog.fetchDelayMs + 600))
    const err = await page.evaluate(() => ({
      vis: document.getElementById('blog-error').classList.contains('is-visible'),
      text: document.getElementById('blog-error').textContent.trim(),
      gridEmpty: document.querySelectorAll('#blog-grid .blog-post').length === 0,
    }))
    check(
      'blog: error state = config.errorLabel(502), grid empty',
      err.vis && err.text === config.blog.errorLabel(502).trim() && err.gridEmpty,
      err.text.slice(0, 60),
    )
    await page.close()
  }

  /* ---------- contact ---------- */
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(BASE + '/contact', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)

    const input = await page.evaluate(() => {
      const el = document.getElementById('f_name')
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return { w: r.width, size: cs.fontSize, weight: cs.fontWeight, ls: cs.letterSpacing, bg: cs.backgroundColor, radius: cs.borderRadius }
    })
    check(
      'contact input: 1077 wide, 32px/400 ls -0.32 transparent r0',
      near(input.w, 1077) && near(parseFloat(input.size), 32) && input.weight === '400' && near(parseFloat(input.ls), -0.32, 0.02) && input.bg === 'rgba(0, 0, 0, 0)' && input.radius === '0px',
      JSON.stringify(input),
    )

    await page.focus('#f_name')
    await page.waitForTimeout(300)
    const focus = await page.evaluate(() => {
      const cs = getComputedStyle(document.getElementById('f_name'))
      return { border: cs.borderBottomColor, shadow: cs.boxShadow }
    })
    check(
      DEPTH_ZONES ? 'contact focus: border zone-ink, no box-shadow' : 'contact focus: border white, no box-shadow',
      (DEPTH_ZONES ? /^rgba?\(14, 27, 24(, 1)?\)$/.test(focus.border) : /^rgba?\(255, 255, 255(, (0\.99\d*|1))?\)$/.test(focus.border)) && focus.shadow === 'none',
      JSON.stringify(focus),
    )

    // empty submit → errors exactly on required fields + captcha (config-driven)
    await page.click('#btn-submit')
    await page.waitForTimeout(400)
    const errs = await page.evaluate(() =>
      [...document.querySelectorAll('.field-error')].map((el) => ({ id: el.id, vis: el.classList.contains('is-visible') })),
    )
    const visIds = errs.filter((e) => e.vis).map((e) => e.id).sort()
    const expectIds = [...REQUIRED_FIELD_IDS.map((id) => `${id}-error`), 'captcha-error'].sort()
    check('contact: empty submit → errors = required fields + captcha (config)', JSON.stringify(visIds) === JSON.stringify(expectIds), visIds.join(','))

    // budget tags → hidden fields + selected chips
    await page.click('.budget-btn[data-budget]')
    await page.waitForTimeout(300)
    const budget = await page.evaluate(() => ({
      hidden: document.getElementById('f_budget').value,
      tags: document.querySelectorAll('#budget-selected-tags .budget-tag').length,
      prices: document.querySelectorAll('#budget-price-offers .budget-btn').length,
    }))
    const expectPrices = config.contact.form.services[0].prices.length
    check('contact: service tag writes #f_budget + selected tags + price offers (config)', budget.hidden === config.contact.form.services[0].label && budget.tags === 1 && budget.prices === expectPrices, JSON.stringify(budget))
    await page.click('#budget-price-offers .budget-btn')
    await page.waitForTimeout(200)
    check('contact: price tag writes #f_price', (await page.evaluate(() => document.getElementById('f_price').value)) === config.contact.form.services[0].prices[0])

    // captcha wrong → error; correct → success
    const readSum = () =>
      page.evaluate(() => {
        const nums = [...document.querySelectorAll('.captcha-eq span')].map((s) => s.textContent.trim()).filter((t) => /^\d+$/.test(t))
        return nums.reduce((a, b) => a + Number(b), 0)
      })
    await page.fill('#f_name', 'Ada Lovelace')
    await page.fill('#f_email', 'ada@example.com')
    await page.fill('#f_phone', '+00 555 0134')
    await page.fill('#f_captcha', String((await readSum()) + 1))
    await page.click('#btn-submit')
    await page.waitForTimeout(400)
    const capErr = await page.evaluate(() => ({
      vis: document.getElementById('captcha-error').classList.contains('is-visible'),
      text: document.getElementById('captcha-error').textContent.trim(),
    }))
    check('contact: wrong captcha → config captchaError visible', capErr.vis && capErr.text === config.contact.form.captchaError, capErr.text.slice(0, 50))
    await page.fill('#f_captcha', String(await readSum()))
    await page.click('#btn-submit')
    await page.waitForTimeout(1400)
    check('contact: valid submit → config success panel', (await page.textContent('.contact-success__title')) === config.contact.form.successTitle)

    const btn = await page.evaluate(() => {
      const el = document.querySelector('.contact-success .btn-submit')
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return { h: r.height, radius: cs.borderRadius, bg: cs.backgroundColor }
    })
    check(
      'contact submit: solid accent capsule 17px 72px → ≈52.8px tall',
      near(btn.h, 52.8, 1.5) && btn.radius === '999px' && btn.bg === ACCENT_ZONED,
      JSON.stringify(btn),
    )
    await page.close()
  }

  /* ---------- home mechanisms ---------- */
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(500)
    check('home: loader visible on entry', await page.isVisible('#site-loader'))
    await page.waitForTimeout(config.home.loader.dismissMs + 400)
    check('home: loader dismissed + removed', (await page.$('#site-loader')) === null)

    const giant = await page.evaluate(() => {
      const el = document.querySelector('.home-hero__word')
      if (!el) return null /* ledger composition renders the pair instead */
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return { ff: cs.fontFamily, size: cs.fontSize, lh: cs.lineHeight, text: el.getAttribute('aria-label'), ratio: r.width / innerWidth, top: r.top, cy: r.top + r.height / 2 }
    })
    const titleVw = config.home.hero.titleVw ?? 16
    if (HERO_COMPOSITION === 'ledger') {
      /* weight-contrast pair on the foam surface */
      const pair = await page.evaluate(() => {
        const h1 = document.querySelector('.home-hero__pair')
        const w1 = document.querySelector('.home-hero__pair-w1')
        const w2 = document.querySelector('.home-hero__pair-w2')
        const cs1 = getComputedStyle(w1)
        const cs2 = getComputedStyle(w2)
        const r = h1.getBoundingClientRect()
        const cells = document.querySelectorAll('.home-hero__wave--specimen .home-hero__cell').length
        return {
          label: h1.getAttribute('aria-label'),
          ff: cs1.fontFamily, weight: cs1.fontWeight, size: cs1.fontSize,
          w2weight: cs2.fontWeight, w2stroke: cs2.webkitTextStrokeWidth, w2color: cs2.color,
          top: r.top, w: r.width / innerWidth, cells,
        }
      })
      check(
        'home: ledger hero pair — config words, Bricolage 800 solid + 340 outline, specimen rail cells',
        pair.label === [config.home.hero.brandWord, config.home.hero.brandWordOutline].filter(Boolean).join(' ') &&
          pair.ff.includes('Bricolage') && pair.weight === '800' && parseInt(pair.w2weight) <= 400 && parseFloat(pair.w2stroke) >= 1 && pair.w2color === 'rgba(0, 0, 0, 0)' &&
          pair.top < 900 * 0.45 && pair.w >= 0.5 && pair.cells === config.home.hero.wave.length,
        JSON.stringify(pair),
      )
    } else {
      check(
        `home: brand word = config brandWord, display face, config titleVw lh 0.9, spans ≥60% viewport, ${HERO_COMPOSITION === 'poster' ? 'centred (poster)' : 'at hero top (banner)'}`,
        giant.text === config.home.hero.brandWord &&
          giant.ff.includes('Bricolage') &&
          near(parseFloat(giant.size), (1440 * titleVw) / 100) &&
          near(parseFloat(giant.lh), (1440 * titleVw) / 100 * 0.9) &&
          giant.ratio >= 0.6 &&
          (HERO_COMPOSITION === 'poster' ? giant.cy > 900 * 0.3 && giant.cy < 900 * 0.7 : giant.top < 900 * 0.35),
        JSON.stringify(giant),
      )
    }

    /* poster composition — centred monument word, uniform
     * bottom rail of wave images, sub line anchored bottom-right */
    if (HERO_COMPOSITION === 'poster') {
      const poster = await page.evaluate(() => {
        const word = document.querySelector('.home-hero__word').getBoundingClientRect()
        const rail = [...document.querySelectorAll('.home-hero__wave--rail img')]
        const sub = document.querySelector('.home-hero__sub').getBoundingClientRect()
        return {
          cx: word.left + word.width / 2,
          railN: rail.length,
          railTopSpread: rail.length ? Math.max(...rail.map((im) => im.offsetTop)) - Math.min(...rail.map((im) => im.offsetTop)) : -1,
          subRight: sub.right,
          vw: innerWidth,
        }
      })
      check(
        'home: poster composition — word centred, uniform bottom rail, sub anchored right',
        near(poster.cx, 720, 2) &&
          poster.railN === config.home.hero.wave.length &&
          poster.railTopSpread >= 0 &&
          poster.railTopSpread < 2 &&
          poster.subRight > poster.vw - 60,
        JSON.stringify(poster),
      )
    }

    /* fix3: photographic hero background — loaded, covers the viewport,
     * pixel variance non-black, scrim strength from config, ambient canvas
     * composited as a glow layer (screen blend) */
    if (config.home.hero.bgImage) {
      const bg = await page.evaluate(async () => {
        const img = document.querySelector('.home-hero__bg-img')
        if (!img) return { found: false }
        await img.decode().catch(() => {})
        const r = img.getBoundingClientRect()
        const c = document.createElement('canvas')
        c.width = 32
        c.height = 32
        const ctx = c.getContext('2d')
        let mean = -1
        let std = -1
        try {
          ctx.drawImage(img, 0, 0, 32, 32)
          const d = ctx.getImageData(0, 0, 32, 32).data
          const lum = []
          for (let i = 0; i < d.length; i += 4) lum.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2])
          mean = lum.reduce((a, b) => a + b, 0) / lum.length
          std = Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length)
        } catch {
          std = -1
        }
        return {
          found: true,
          loaded: img.complete && img.naturalWidth > 0,
          w: r.width,
          h: r.height,
          mean: +mean.toFixed(1),
          std: +std.toFixed(1),
          scrim: +getComputedStyle(document.querySelector('.home-hero__bg-scrim')).opacity,
          blend: getComputedStyle(document.querySelector('.home-hero__bg-canvas')).mixBlendMode,
        }
      })
      const dim = config.home.hero.bgDim ?? 0.5
      check(
        'home: hero photographic bg visible (covers viewport, non-black variance, config scrim)',
        bg.found && bg.loaded && near(bg.w, 1440, 2) && bg.h >= 898 && bg.std > 6 && bg.mean > 12 && near(bg.scrim, dim, 0.01) && bg.blend === 'screen',
        JSON.stringify(bg),
      )
    }

    /* signature fluid field — low-res fbm canvas in the
     * hero ambience slot, screen blend, animating over time (unit tests in
     * tests/fluid.test.ts cover determinism + pointer response) */
    if (config.home.hero.fluid?.enabled) {
      const sampleField = () =>
        page.evaluate(() => {
          const c = document.querySelector('canvas.home-hero__bg-canvas--fluid')
          if (!c) return null
          const ctx = c.getContext('2d')
          const d = ctx.getImageData(0, 0, c.width, c.height).data
          let sum = 0
          let lit = 0
          for (let i = 0; i < d.length; i += 4) {
            sum += d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7 + i
            if (d[i] + d[i + 1] + d[i + 2] > 24) lit++
          }
          return { w: c.width, rectW: c.getBoundingClientRect().width, blend: getComputedStyle(c).mixBlendMode, sum, lit }
        })
      const f0 = await sampleField()
      await page.waitForTimeout(700)
      const f1 = await sampleField()
      check(
        `home: fluid field canvas live (buffer ≥96 wide, covers hero, ${FLUID_TONE === 'light' ? 'multiply ink-in-water' : 'screen glow'} blend, non-flat, animating)`,
        f0 !== null &&
          f1 !== null &&
          f0.w >= 96 &&
          f0.rectW >= 1438 &&
          f0.blend === (FLUID_TONE === 'light' ? 'multiply' : 'screen') &&
          f0.lit > f0.w * 2 &&
          f0.sum !== f1.sum,
        JSON.stringify({ w: f0?.w, rectW: f0?.rectW, blend: f0?.blend, lit: f0?.lit, delta: f1 && f0 ? f1.sum - f0.sum : 0 }),
      )
    }

    const stm = await page.evaluate(() => ({
      h: document.querySelector('.statement').getBoundingClientRect().height,
      xl: document.querySelectorAll('.statement__word--xl').length,
      caps: document.querySelector('.core-caps').getBoundingClientRect().height >= 800,
      gallery: document.querySelector('.scroll-gallery').getBoundingClientRect().height,
    }))
    check('home: statement heightPx (config) with config xl words', near(stm.h, config.home.statement.heightPx, 5) && stm.xl === XL_WORDS, `h=${stm.h} xl=${stm.xl}/${XL_WORDS}`)
    if (MANIFESTO) {
      const mf = await page.evaluate(() => ({
        lines: document.querySelectorAll('.statement__line').length,
        em: getComputedStyle(document.querySelector('.statement__line em') ?? document.createElement('em')).color,
      }))
      check(
        'home: manifesto form — config lines render, em in zone accent',
        mf.lines === MANIFESTO.length && mf.em === ACCENT,
        `lines=${mf.lines}/${MANIFESTO.length} em=${mf.em}`,
      )
    }
    check('home: core-capabilities ≥100vh + gallery heightPx (config)', stm.caps && near(stm.gallery, config.home.gallery.heightPx, 5), `gallery=${stm.gallery}`)

    /* density layers, all config-derived */
    const density = await page.evaluate(() => ({
      wcLeft: [...document.querySelectorAll('.home-hero__words-col--left li')].map((e) => e.textContent),
      wcRight: [...document.querySelectorAll('.home-hero__words-col--right li')].map((e) => e.textContent),
      status: [...document.querySelectorAll('.statement__status-text')].map((e) => e.textContent),
      statusBlocks: document.querySelectorAll('.statement__status-block').length,
      readout: [...document.querySelectorAll('.statement__readout-token')].map((e) => e.textContent),
      watermark: document.querySelector('.footer-watermark')?.textContent.trim() ?? null,
      videoTag: document.querySelector('.footer-video__tag')?.textContent.trim() ?? null,
    }))
    const wc = config.home.hero.wordColumns
    if (wc) {
      check(
        'home: hero word columns render config words',
        density.wcLeft.join('|') === wc.left.join('|') && density.wcRight.join('|') === wc.right.join('|'),
        `L=${density.wcLeft.length}/${wc.left.length} R=${density.wcRight.length}/${wc.right.length}`,
      )
    }
    const sl = config.home.statement.statusLines ?? []
    if (sl.length) {
      check(
        'home: statement status lines + block cursors (config)',
        density.status.join('|') === sl.map((s) => s.text).join('|') && density.statusBlocks === sl.length,
        `status=${density.status.length}/${sl.length} blocks=${density.statusBlocks}`,
      )
    }
    const ro = config.home.statement.readout
    if (ro) {
      check('home: statement readout tokens (config)', density.readout.join('|') === ro.join('|'), density.readout.join(' / '))
    }
    if (config.footer.watermark) {
      check('footer: watermark = config', density.watermark === config.footer.watermark, density.watermark)
    }
    if (config.footer.videoTag) {
      check('footer: video tag = config', density.videoTag === config.footer.videoTag, density.videoTag)
    }

    const cube = await page.evaluate(() => ({
      style: getComputedStyle(document.querySelector('.cube')).transformStyle,
      caption: document.querySelector('.cube-section__caption')?.textContent.trim(),
    }))
    check('home: cube preserve-3d', cube.style === 'preserve-3d', cube.style)
    check('copy-follow: cube caption = config.copy.ui.cubeCaption', cube.caption === config.copy.ui.cubeCaption, cube.caption?.slice(0, 40))

    /* fix2 scroll-fidelity assertions — config-aware, conditional */
    const absTop = (sel) => page.evaluate((s) => document.querySelector(s).getBoundingClientRect().top + window.scrollY, sel)

    /* fix3: floating card stack — main card + clustered small cards with
     * deep shadows, centered, pressing the hero bottom edge */
    if (config.home.hero.stack) {
      const st = await page.evaluate(() => {
        const el = document.querySelector('.home-hero__stack')
        if (!el) return { found: false }
        const r = el.getBoundingClientRect()
        const main = document.querySelector('.home-hero__stack-main')
        const mr = main?.getBoundingClientRect()
        return {
          found: true,
          main: !!main,
          mainShadow: main ? getComputedStyle(main).boxShadow !== 'none' : false,
          cards: document.querySelectorAll('.home-hero__stack-card').length,
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
          vh: innerHeight,
          mainCx: mr ? Math.round(mr.left + mr.width / 2) : 0,
        }
      })
      check(
        'home: hero floating stack (main + cluster, deep shadows) presses hero bottom edge',
        st.found && st.main && st.cards >= 2 && st.mainShadow && st.bottom > st.vh && st.top < st.vh && near(st.mainCx, 720, 40),
        JSON.stringify(st),
      )
    }

    /* hero wave: overlapping card strip with a raised active card */
    if (config.home.hero.waveOverlap && !config.home.hero.stack) {
      const wave = await page.evaluate(() => {
        const imgs = [...document.querySelectorAll('.home-hero__wave--overlap img')]
        const r0 = imgs[0]?.getBoundingClientRect()
        const r1 = imgs[1]?.getBoundingClientRect()
        return {
          overlap: r0 && r1 ? r0.right - r1.left : 0,
          active: !!document.querySelector('.home-hero__wave--overlap img.is-active'),
          shadow: imgs[0] ? getComputedStyle(imgs[0]).boxShadow !== 'none' : false,
        }
      })
      check('home: hero wave overlap strip (overlapping + active + shadows)', wave.overlap > 8 && wave.active && wave.shadow, JSON.stringify(wave))
    }

    /* cube stage: big enough to read, faces loaded, rotation scrubbed */
    const cubeTop = await absTop('.cube-section')
    await page.evaluate((y) => window.scrollTo(0, y), cubeTop + 300)
    await page.waitForTimeout(1200)
    const cubeA = await page.evaluate(() => document.querySelector('.cube').style.transform || getComputedStyle(document.querySelector('.cube')).transform)
    await page.evaluate((y) => window.scrollTo(0, y), cubeTop + 900)
    await page.waitForTimeout(1200)
    const cubeStage = await page.evaluate(() => {
      const r = document.querySelector('.cube-scene').getBoundingClientRect()
      const t = document.querySelector('.cube').style.transform || getComputedStyle(document.querySelector('.cube')).transform
      const imgs = [...document.querySelectorAll('.cube__face img')]
      return { w: r.width, h: r.height, t, loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length, faces: imgs.length }
    })
    const expectCube = config.home.cube.zoom ? config.home.cube.zoom.vw * config.home.cube.zoom.scale * 1440 : 0.3 * 1440
    check(
      'home: cube stage visible at configured scale, faces loaded, rotation scrubbed',
      cubeStage.w >= 0.3 * 1440 && cubeStage.w >= expectCube - 2 && cubeStage.loaded === cubeStage.faces && cubeStage.faces === 6 && cubeStage.t !== cubeA,
      `w=${Math.round(cubeStage.w)} loaded=${cubeStage.loaded}/${cubeStage.faces} rot=${cubeA.slice(0, 24)}→${cubeStage.t.slice(0, 24)}`,
    )

    /* statement spotlight: a word centred in the viewport lights to ≈1,
     * idle words stay ≥ baseOpacity; xl letters keep pixel size @1 */
    const stmTop = await absTop('.statement')
    const targetY = await page.evaluate((top) => {
      const el = [...document.querySelectorAll('.statement__word:not(.statement__word--xl)')]
        .find((w) => w.getBoundingClientRect().top + window.scrollY > top + 400)
      const r = el.getBoundingClientRect()
      return r.top + window.scrollY + r.height / 2 - innerHeight / 2
    }, stmTop)
    await page.evaluate((y) => window.scrollTo(0, y), targetY)
    await page.waitForTimeout(1600)
    const spot = await page.evaluate(() => {
      const mid = innerHeight / 2
      const sm = [...document.querySelectorAll('.statement__word:not(.statement__word--xl)')]
        .map((el) => ({ r: el.getBoundingClientRect(), op: parseFloat(getComputedStyle(el).opacity) }))
        .filter((w) => w.r.bottom > 0 && w.r.top < innerHeight)
      const centred = sm.reduce((best, w) => {
        const d = Math.abs(w.r.top + w.r.height / 2 - mid)
        return !best || d < best.d ? { d, op: w.op } : best
      }, null)
      const xl = [...document.querySelectorAll('.statement__word--xl')]
        .map((el) => ({ r: el.getBoundingClientRect(), op: parseFloat(getComputedStyle(el).opacity), fs: parseFloat(getComputedStyle(el).fontSize) }))
        .filter((w) => w.r.bottom > 0 && w.r.top < innerHeight)
      return {
        smN: sm.length,
        centredOp: centred?.op ?? 0,
        centredD: centred?.d ?? 999,
        smMin: sm.length ? Math.min(...sm.map((w) => w.op)) : 1,
        xlN: xl.length,
        xlFs: xl.length ? Math.max(...xl.map((w) => w.fs)) : 0,
        xlOp: xl.length ? Math.max(...xl.map((w) => w.op)) : 0,
      }
    })
    const spotCfg = config.home.statement.spotlight
    const baseOp = spotCfg?.baseOpacity ?? 0.6
    if (MANIFESTO) {
      check(
        'home: statement spotlight — centred manifesto line ≈1, idle lines ≥ 0.73 floor',
        spot.smN > 0 && spot.centredD < 40 && spot.centredOp >= 0.95 && spot.smMin >= 0.73,
        `centred op=${spot.centredOp.toFixed(2)} d=${Math.round(spot.centredD)} idleMin=${spot.smMin.toFixed(2)} (n=${spot.smN})`,
      )
    } else {
      check(
        'home: statement spotlight — centred word ≈1, idle ≥ baseOpacity, xl ≥180px @1',
        spot.smN > 0 && spot.centredD < 40 && spot.centredOp >= 0.95 && spot.smMin >= baseOp - 0.05 && spot.xlN > 0 && spot.xlFs >= 180 && spot.xlOp >= 0.99,
        `centred op=${spot.centredOp.toFixed(2)} d=${Math.round(spot.centredD)} idleMin=${spot.smMin.toFixed(2)} (n=${spot.smN}) xl fs=${Math.round(spot.xlFs)} op=${spot.xlOp} (n=${spot.xlN})`,
      )
    }

    /* gallery: cards at configured magnitude, images rendered */
    const galTop = await absTop('.scroll-gallery')
    await page.evaluate((y) => window.scrollTo(0, y), galTop + 1200)
    await page.waitForTimeout(1200)
    const gal = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.scroll-gallery__card')]
        .map((el) => {
          const r = el.getBoundingClientRect()
          const img = el.querySelector('img')
          return { r, ok: img.complete && img.naturalWidth > 0, h: img.getBoundingClientRect().height }
        })
        .filter((c) => c.r.right > 0 && c.r.left < innerWidth)
      return { n: cards.length, maxW: cards.length ? Math.max(...cards.map((c) => c.r.width)) : 0, allOk: cards.every((c) => c.ok), h: cards.length ? cards[0].h : 0 }
    })
    const expectCardW = config.home.gallery.card ? Math.min((config.home.gallery.card.vw / 100) * 1440, config.home.gallery.card.maxPx) : 0.35 * 1440
    check(
      'home: gallery cards prominent (≥35vw), images loaded, aspect held',
      gal.n > 0 && gal.maxW >= 0.35 * 1440 && gal.maxW >= expectCardW - 2 && gal.allOk && near(gal.h, (gal.maxW * 3) / 4, 3),
      `n=${gal.n} maxW=${Math.round(gal.maxW)} h=${Math.round(gal.h)} loaded=${gal.allOk}`,
    )
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(600)

    const mq = await page.evaluate(() => ({
      anim: getComputedStyle(document.querySelector('.title-marquee__track')).animationName,
      x0: document.querySelector('.title-marquee__track').getBoundingClientRect().x,
    }))
    await page.evaluate(() => window.scrollTo(0, 1600))
    await page.waitForTimeout(800)
    const mq2 = await page.evaluate(() => ({ x1: document.querySelector('.title-marquee__track').getBoundingClientRect().x }))
    check('home: title marquee JS scroll-driven (no CSS anim)', mq.anim === 'none' && mq2.x1 !== mq.x0, `anim=${mq.anim} dx=${mq2.x1 - mq.x0}`)
    await page.close()
  }

  /* ---------- about mechanisms ---------- */
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(BASE + '/about', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)

    const faces = await page.$$eval('.cc__nav-btn', (els) => els.length)
    check('about: cube nav buttons = config faces', faces === config.about.cube.faces.length, `faces=${faces}`)
    const before = await page.evaluate(() => getComputedStyle(document.getElementById('cc-cube')).transform)
    await page.click('.cc__nav-btn:nth-child(3)')
    await page.waitForTimeout(1100)
    const after = await page.evaluate(() => ({
      t: getComputedStyle(document.getElementById('cc-cube')).transform,
      active: document.querySelector('.cc__nav-btn:nth-child(3)').classList.contains('is-active'),
    }))
    check('about: cube carousel click rotates + activates', before !== after.t && after.active, `${before.slice(0, 40)} → ${after.t.slice(0, 40)}`)

    const row = page.locator('.roster__row').first()
    await row.scrollIntoViewIfNeeded()
    await row.hover()
    await page.waitForTimeout(600)
    const roster = await page.evaluate(() => {
      const el = document.querySelector('.roster__cursor-img')
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return { vis: el.classList.contains('is-visible'), w: r.width, h: r.height, clip: cs.clipPath, pos: cs.position, label: document.querySelector('.cursor-ring').getAttribute('data-cursor-label') }
    })
    check(
      'about: roster follow img 300×210 fixed clip inset(0%)',
      roster.vis && near(roster.w, 300) && near(roster.h, 210) && roster.clip === 'inset(0%)' && roster.pos === 'fixed',
      JSON.stringify(roster),
    )
    check('copy-follow: roster cursor label = config.copy.cursor.view', roster.label === config.copy.cursor.view, roster.label)
    await page.close()
  }

  /* ---------- 404 + dino ---------- */
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(BASE + '/no-such-page', { waitUntil: 'networkidle' })
    await page.waitForTimeout(900)
    const nf = await page.evaluate(() => ({
      face: !!document.querySelector('.nf__graphic'),
      heading: document.querySelector('.nf__heading')?.textContent.trim(),
      cta: !!document.querySelector('.nf__cta'),
      hint: document.querySelector('.nf__hint')?.textContent.trim(),
    }))
    check('404: pixel face + config heading + CTA', nf.face && nf.heading === config.notFound.heading && nf.cta, nf.heading)
    check('copy-follow: 404 hint = config.copy.ui.notFoundHint', nf.hint === config.copy.ui.notFoundHint, nf.hint)

    const d0 = await page.evaluate(() => document.getElementById('dino-player').style.transform)
    await page.keyboard.press('Space')
    await page.waitForTimeout(300)
    const d1 = await page.evaluate(() => document.getElementById('dino-player').style.transform)
    check('404: dino jumps on Space', d0 !== d1 && d1.includes('-'), `${d0} → ${d1}`)
    const score = await page.evaluate(() => ({
      hi: document.querySelector('.dino-score__hi')?.textContent,
      cur: !!document.querySelector('.dino-score__current'),
    }))
    check('404: score board = config hiScoreLabel + current', score.hi?.startsWith(config.notFound.hiScoreLabel) && score.cur, score.hi)

    // typewriter: behavior over a window, values always a prefix of a config message
    const samples = []
    for (let i = 0; i < 6; i++) {
      samples.push(await page.textContent('#nf-typewriter'))
      await page.waitForTimeout(500)
    }
    const distinct = new Set(samples)
    const prefixes = samples.every((s) => config.notFound.messages.some((m) => m.startsWith(s) || s === ''))
    check('404: typewriter advances within config messages', distinct.size >= 2 && prefixes, `${distinct.size} distinct`)
    await page.close()
  }

  /* ---------- mobile 390×844 ---------- */
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(config.home.loader.dismissMs + 500)

    const pill = await page.evaluate(() => {
      const r = document.querySelector('.nav-shell').getBoundingClientRect()
      const cs = getComputedStyle(document.querySelector('.nav-shell'))
      return { x: r.x, y: r.y, w: r.width, h: r.height, bg: cs.backgroundColor }
    })
    check(
      NAV_FORM === 'dock' ? 'mobile: nav dock 366×64 @(12,bottom16) frosted' : 'mobile: pill 366×64 @(12,16) surface',
      near(pill.w, 366) &&
        near(pill.h, 64) &&
        near(pill.x, 12) &&
        (NAV_FORM === 'dock' ? near(pill.y, 844 - 16 - 64) && pill.bg === DOCK_BG : near(pill.y, 16) && pill.bg === SURFACE),
      JSON.stringify(pill),
    )

    const cur = await page.evaluate(() => getComputedStyle(document.querySelector('.cursor-dot')).display)
    check('mobile: custom cursor off', cur === 'none', cur)
    const noise = await page.evaluate(() => getComputedStyle(document.getElementById('bg-noise')).display)
    check('mobile: film grain off', noise === 'none', noise)

    await page.click('.nav-burger')
    await page.waitForTimeout(1800)
    const mm = await page.evaluate(() => {
      const r = document.querySelector('.nav-shell').getBoundingClientRect()
      const row = document.querySelector('.menu-row').getBoundingClientRect()
      const title = getComputedStyle(document.querySelector('.menu-row__title')).fontSize
      const rows = document.querySelectorAll('.menu-row').length
      return { w: r.width, h: r.height, rowH: row.height, title, rows }
    })
    const expectMobileRowH = (844 - 64) / ROWS
    const expectMobileTitle = MENU_LAYOUT === 'ledger' ? Math.min(48, Math.max(34, 0.1 * 390)) : Math.min(56, Math.max(38, 0.11 * 390))
    check(
      `mobile: menu 390×844, ${ROWS} rows × (844-64)/rows, title clamp`,
      near(mm.w, 390) && near(mm.h, 844) && mm.rows === ROWS && near(mm.rowH, expectMobileRowH, 1) && near(parseFloat(mm.title), expectMobileTitle, 0.5),
      JSON.stringify(mm),
    )
    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    check('mobile: no horizontal overflow', overflow <= 0, `overflow=${overflow}px`)
    await page.close()
  }

  /* ---------- reduced motion ---------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(config.home.loader.dismissMs + 500)
    const noise = await page.evaluate(() => getComputedStyle(document.getElementById('bg-noise')).display)
    check('reduced-motion: film grain off', noise === 'none', noise)
    const marquee = await page.evaluate(() => getComputedStyle(document.querySelector('.word-marquee__track')).animationName)
    check('reduced-motion: CSS marquees static', marquee === 'none', marquee)
    const lenis = await page.evaluate(() => document.documentElement.classList.contains('lenis-smooth'))
    check('reduced-motion: lenis not initialised', !lenis)
    if (config.home.hero.fluid?.enabled) {
      const sampleField = () =>
        page.evaluate(() => {
          const c = document.querySelector('canvas.home-hero__bg-canvas--fluid')
          if (!c) return null
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
          let sum = 0
          for (let i = 0; i < d.length; i += 4) sum += d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7 + i
          return sum
        })
      const fa = await sampleField()
      await page.waitForTimeout(700)
      const fb = await sampleField()
      check('reduced-motion: fluid field renders one static frame', fa !== null && fa === fb, `${fa} → ${fb}`)
    }
    await ctx.close()
  }

  await browser.close()
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n== matrix: ${results.length - failed}/${results.length} passed ==`)
  process.exit(failed ? 1 : 0)
})()
