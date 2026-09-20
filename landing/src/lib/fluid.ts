/* Fluid gradient field — the template's signature hero ambience layer.
 * Domain-warped fbm value noise rendered to a low-res canvas (CSS upscales
 * it softly), drifting over time, with a radial pointer push that warps the
 * domain around the cursor. Zero dependencies; reduced-motion renders one
 * static frame. Pure samplers are exported for unit tests.
 */
import { prefersReducedMotion } from './motion'

export interface Rgb {
  r: number
  g: number
  b: number
}

export interface FluidFieldOptions {
  /** Time multiplier 0..3 (default 1). */
  speed?: number
  /** Pointer push strength 0..1 (default 0.6). */
  strength?: number
  /** Palette: dark base, mid glow, highlight. */
  palette?: [Rgb, Rgb, Rgb]
  /**
   * Mapping curve: 'dark' (default) fills the field broadly with mid tones
   * for a glow field on black; 'light' keeps most of the field at the base
   * tone and lets only thin high-value bands go deep — ink bands on foam
   * (multiply compositing).
   */
  curve?: 'dark' | 'light'
}

export interface FluidField {
  /** Feed a pointer position in unit space (0..1 across the canvas). */
  pointer(nx: number, ny: number): void
  destroy(): void
}

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '')
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 }
}

function hash2(ix: number, iy: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function vnoise(x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = hash2(ix, iy)
  const b = hash2(ix + 1, iy)
  const c = hash2(ix, iy + 1)
  const d = hash2(ix + 1, iy + 1)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

function fbm(x: number, y: number, octaves: number): number {
  let v = 0
  let amp = 0.5
  let freq = 1
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    v += vnoise(x * freq, y * freq) * amp
    norm += amp
    amp *= 0.5
    freq *= 2.03
  }
  return v / norm
}

/**
 * Field value 0..1 at unit-space (x, y), time t (seconds), pointer at
 * (mx, my) with push strength 0..1. Domain warp: two fbm layers where the
 * second is advected by the first; the pointer displaces the domain
 * radially away from itself with a gaussian falloff.
 */
export function sampleFluid(x: number, y: number, t: number, mx: number, my: number, strength: number): number {
  const dx = x - mx
  const dy = y - my
  const push = strength * Math.exp(-(dx * dx + dy * dy) / 0.018)
  const px = x + dx * push * 1.4
  const py = y + dy * push * 1.4
  const q = fbm(px * 2.6 + t * 0.1, py * 2.6 - t * 0.07, 4)
  return fbm(px * 4.4 + q * 2.4 + 5.2 - t * 0.05, py * 4.4 + q * 1.9 + 1.3, 3)
}

function smoothstep(e0: number, e1: number, v: number): number {
  const k = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)))
  return k * k * (3 - 2 * k)
}

/** Internal buffer width for a given CSS pixel width (perf bound). */
function bufferWidth(cssWidth: number): number {
  return Math.round(Math.min(200, Math.max(96, cssWidth / 8)))
}

export function createFluidField(canvas: HTMLCanvasElement, opts: FluidFieldOptions = {}): FluidField {
  const ctx = canvas.getContext('2d')
  const speed = opts.speed ?? 1
  const strength = opts.strength ?? 0.6
  const palette = opts.palette ?? [hexToRgb('#050807'), hexToRgb('#c89a45'), hexToRgb('#f2e2b8')]
  const reduced = prefersReducedMotion()

  let raf = 0
  let last = 0
  let start = -1
  let mx = 0.5
  let my = 0.42
  let tx = mx
  let ty = my
  let bw = 0
  let bh = 0
  let img: ImageData | null = null

  const render = (t: number) => {
    if (!ctx) return
    const cssW = canvas.clientWidth || 1
    const cssH = canvas.clientHeight || 1
    const wantW = bufferWidth(cssW)
    const wantH = Math.max(2, Math.round((wantW * cssH) / cssW))
    if (wantW !== bw || wantH !== bh) {
      bw = wantW
      bh = wantH
      canvas.width = bw
      canvas.height = bh
      img = ctx.createImageData(bw, bh)
    }
    if (!img) return
    const data = img.data
    const aspect = cssW / cssH
    const [c0, c1, c2] = palette
    const light = opts.curve === 'light'
    let p = 0
    for (let iy = 0; iy < bh; iy++) {
      const y = iy / bh
      for (let ix = 0; ix < bw; ix++) {
        const x = (ix / bw) * aspect
        const v = sampleFluid(x, y, t, mx * aspect, my, strength)
        /* slow ribbon modulation so the highlights read as flowing bands */
        const band = 0.86 + 0.14 * Math.sin((v * 7 - t * 0.5) * Math.PI * 2)
        const m1 = light ? smoothstep(0.52, 0.94, v) : smoothstep(0.34, 0.88, v)
        const m2 = (light ? smoothstep(0.74, 0.985, v) : smoothstep(0.66, 0.97, v)) * band
        data[p] = c0.r + (c1.r - c0.r) * m1 + (c2.r - c1.r) * m2
        data[p + 1] = c0.g + (c1.g - c0.g) * m1 + (c2.g - c1.g) * m2
        data[p + 2] = c0.b + (c1.b - c0.b) * m1 + (c2.b - c1.b) * m2
        data[p + 3] = 255
        p += 4
      }
    }
    ctx.putImageData(img, 0, 0)
  }

  if (reduced) {
    /* reduced-motion: one designed static frame, no loop */
    render(0)
    return { pointer() {}, destroy() {} }
  }

  const loop = (now: number) => {
    raf = requestAnimationFrame(loop)
    if (start < 0) start = now
    if (now - last < 33) return /* ~30fps is enough for a slow field */
    last = now
    if (document.hidden) return
    mx += (tx - mx) * 0.09
    my += (ty - my) * 0.09
    render(((now - start) / 1000) * speed)
  }
  raf = requestAnimationFrame(loop)

  return {
    pointer(nx: number, ny: number) {
      tx = Math.min(1, Math.max(0, nx))
      ty = Math.min(1, Math.max(0, ny))
    },
    destroy() {
      cancelAnimationFrame(raf)
    },
  }
}
