/** Runs inside a browser via locator.evaluate(auditRenderedTypography, options).
 * Audits rendered HTML text, including content reachable by vertical scrolling.
 * It deliberately does not treat aria-hidden as visually hidden. Every skipped
 * text node records why it was excluded; closed disclosures are not opened.
 */
export function auditRenderedTypography(root, options = {}) {
  const minimum = options.minimum ?? 14
  const bodyMinimum = options.bodyMinimum ?? 16
  const tolerance = options.centerTolerance ?? 3
  const metadataSelectors = options.metadataSelectors ?? [
    '.station-workspace-footer', '.protocol-status', '.transaction-activity',
    '.instrument-wallet-note', '.pod-key-state', '.example-disclosure',
    '.product-footer', '.site-footer', '.landing-footer',
  ]
  const rect = r => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height })
  const label = element => {
    if (element.id) return `#${element.id}`
    const classes = [...element.classList].slice(0, 4).map(name => `.${CSS.escape(name)}`).join('')
    return `${element.tagName.toLowerCase()}${classes}`
  }
  function excluded(element) {
    if (!(element instanceof HTMLElement)) return 'non-HTML artwork'
    if (element.closest('script,style,noscript,template')) return 'non-rendered source'
    if (element.closest('.sr-only,.visually-hidden,[data-sr-only]')) return 'screen-reader-only class'
    for (let node = element; node; node = node.parentElement) {
      if (node instanceof HTMLDetailsElement && !node.open) {
        const summary = [...node.children].find(child => child.tagName === 'SUMMARY')
        if (!summary?.contains(element)) return 'closed disclosure'
      }
      const css = getComputedStyle(node)
      if (css.display === 'none') return 'display:none'
      if (css.visibility === 'hidden' || css.visibility === 'collapse') return `visibility:${css.visibility}`
      if (Number(css.opacity) === 0) return 'opacity:0'
      if (css.contentVisibility === 'hidden') return 'content-visibility:hidden'
      const b = node.getBoundingClientRect()
      if (['absolute', 'fixed'].includes(css.position) && b.width <= 2 && b.height <= 2 && (css.clip !== 'auto' || css.clipPath !== 'none')) return 'screen-reader-only clipping'
      if (node.matches('.station-skip,.skip-link') && (b.bottom <= 0 || b.right <= 0 || b.left >= innerWidth)) return 'offscreen skip-to-content control'
    }
    return null
  }
  function renderedScale(element) {
    let scale = 1
    for (let node = element; node; node = node.parentElement) {
      const transform = getComputedStyle(node).transform
      if (transform !== 'none') {
        const matrix = new DOMMatrixReadOnly(transform)
        scale *= Math.hypot(matrix.m21, matrix.m22, matrix.m23)
      }
    }
    return scale
  }
  function glyphRects(element) {
    const rectangles = []
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim() || excluded(node.parentElement)) continue
      const range = document.createRange(); range.selectNodeContents(node)
      rectangles.push(...[...range.getClientRects()].filter(r => r.width > 0 && r.height > 0).map(rect))
    }
    return rectangles
  }
  function bounds(rectangles) {
    if (!rectangles.length) return null
    const left = Math.min(...rectangles.map(r => r.left)), right = Math.max(...rectangles.map(r => r.right))
    const top = Math.min(...rectangles.map(r => r.top)), bottom = Math.max(...rectangles.map(r => r.bottom))
    return { left, right, top, bottom, width: right - left, height: bottom - top }
  }
  const report = { minimum, bodyMinimum, metadataSelectors, selector: label(root), text: [], excluded: [], centering: [], overflow: [], violations: [] }
  function record(element, sample, rectangles, kind = 'text') {
    const reason = excluded(element)
    const item = { selector: label(element), text: sample.replace(/\s+/g, ' ').trim().slice(0, 160), kind }
    if (reason || !rectangles.length) { report.excluded.push({ ...item, reason: reason || 'no rendered glyphs' }); return }
    const css = getComputedStyle(element)
    const metadata = metadataSelectors.find(selector => element.closest(selector)) || null
    const paragraph = Boolean(element.closest('p'))
    const fontSize = parseFloat(css.fontSize)
    const renderedFontSize = fontSize * renderedScale(element)
    const required = paragraph && !metadata ? bodyMinimum : minimum
    const box = bounds(rectangles)
    const entry = { ...item, fontSize, renderedFontSize, required, metadata, paragraph, inViewport: box.right > 0 && box.left < innerWidth && box.bottom > 0 && box.top < innerHeight, box }
    report.text.push(entry)
    if (renderedFontSize + .05 < required) report.violations.push({ type: paragraph && !metadata ? 'body-text-too-small' : 'text-too-small', ...entry })

    // Vertical scrolling is allowed. Horizontal scrolling and hidden overflow
    // must not be used to conceal text. Stop the vertical check at the nearest
    // scrolling ancestor so below-the-fold text is not mistaken for cropping.
    let verticalReachable = false
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor), clip = ancestor.getBoundingClientRect()
      if (/(auto|scroll)/.test(style.overflowY)) verticalReachable = true
      const horizontalClip = /(hidden|clip|auto|scroll)/.test(style.overflowX) && (box.left < clip.left - 2 || box.right > clip.right + 2)
      const verticalClip = !verticalReachable && /(hidden|clip)/.test(style.overflowY) && (box.top < clip.top - 2 || box.bottom > clip.bottom + 2)
      if (horizontalClip || verticalClip) {
        const issue = { type: 'cropped-text', selector: item.selector, text: item.text, clipper: label(ancestor), horizontal: horizontalClip, vertical: verticalClip, box, clip: rect(clip) }
        report.overflow.push(issue); report.violations.push(issue); break
      }
      if (ancestor === root) break
    }
    if (box.left < -2 || box.right > innerWidth + 2) {
      const issue = { type: 'text-outside-viewport', selector: item.selector, text: item.text, box, viewport: innerWidth }
      report.overflow.push(issue); report.violations.push(issue)
    }
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim()) continue
    const range = document.createRange(); range.selectNodeContents(node)
    record(node.parentElement, node.textContent, [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0).map(rect))
  }
  for (const input of root.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea,select')) {
    // Audit control text size without recording unsigned input values or keys.
    record(input, input.getAttribute('aria-label') || input.labels?.[0]?.textContent || input.tagName, input.getClientRects().length ? [rect(input.getBoundingClientRect())] : [], 'control')
  }
  function center(element, group, kind) {
    if (excluded(element)) return
    const rectangles = glyphRects(element)
    if (kind === 'primary-button') for (const icon of element.querySelectorAll('svg,img')) {
      const iconBox = icon.getBoundingClientRect(), css = getComputedStyle(icon)
      const hiddenAncestor = excluded(icon instanceof HTMLElement ? icon : icon.parentElement)
      if (!hiddenAncestor && css.display !== 'none' && css.visibility !== 'hidden' && Number(css.opacity) !== 0 && iconBox.width > 0 && iconBox.height > 0) rectangles.push(rect(iconBox))
      else report.excluded.push({ selector: label(icon), kind: 'button-icon', reason: hiddenAncestor || 'no visible icon geometry' })
    }
    const glyphs = bounds(rectangles), box = group.getBoundingClientRect()
    if (!glyphs || !box.width || !box.height) return
    const dx = (glyphs.left + glyphs.right - box.left - box.right) / 2
    const dy = (glyphs.top + glyphs.bottom - box.top - box.bottom) / 2
    const entry = { kind, selector: label(element), group: label(group), text: element.textContent.trim().slice(0, 160), dx, dy, tolerance, glyphs, groupBox: rect(box) }
    report.centering.push(entry)
    if (Math.abs(dx) > tolerance || (kind === 'primary-button' && Math.abs(dy) > tolerance)) report.violations.push({ type: 'content-not-centered', ...entry })
  }
  for (const heading of root.querySelectorAll('.station-workspace-title h2')) center(heading, heading.closest('.station-workspace-header'), 'workspace-heading')
  for (const heading of root.querySelectorAll('.workbench-heading h3')) center(heading, heading.closest('.workbench-heading'), 'workbench-heading')
  for (const heading of root.querySelectorAll('.ledger-toolbar > h3')) center(heading, heading.closest('.ledger-toolbar'), 'ledger-heading')
  for (const button of root.querySelectorAll('.btn-primary,.product-launch')) center(button, button, 'primary-button')
  for (const [kind, count] of Object.entries(options.expectedCenters || {})) {
    const actual = report.centering.filter(item => item.kind === kind).length
    if (actual < count) report.violations.push({ type: 'missing-centering-target', kind, expected: count, actual })
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) {
    const issue = { type: 'document-horizontal-overflow', scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth }
    report.overflow.push(issue); report.violations.push(issue)
  }
  return report
}
