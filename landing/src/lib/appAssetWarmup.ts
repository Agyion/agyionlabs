type AppAsset = { href: string; as: 'script' | 'style' }
type ManifestResponse = { ok: boolean; json: () => Promise<unknown> }
type WarmupOptions = {
  origin: string
  fetchManifest: (url: string, options: RequestInit) => Promise<ManifestResponse>
  prefetchAsset: (asset: AppAsset) => void
}

const staticAsset = /^\/_next\/static\/(?:chunks\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\/[A-Za-z0-9_.-]+\.js|chunks\/[A-Za-z0-9_.-]+\.js|css\/[A-Za-z0-9_.-]+\.css)$/

/** Treat a missing, stale-schema or malformed manifest as an optional optimization. */
export function parseAppAssetManifest(value: unknown, origin: string): AppAsset[] {
  if (!value || typeof value !== 'object') return []
  const manifest = value as { version?: unknown; assets?: unknown }
  if (manifest.version !== 1 || !Array.isArray(manifest.assets) || manifest.assets.length > 48) return []
  const accepted = new Map<string, AppAsset>()
  for (const item of manifest.assets) {
    if (!item || typeof item !== 'object') return []
    const { href, as } = item as { href?: unknown; as?: unknown }
    if (typeof href !== 'string' || !staticAsset.test(href) || href.split('/').some(segment => segment === '.' || segment === '..')) return []
    if ((as !== 'script' && as !== 'style') || (as === 'style') !== href.endsWith('.css')) return []
    try {
      if (new URL(href, origin).origin !== origin) return []
    } catch { return [] }
    accepted.set(href, { href, as })
  }
  return [...accepted.values()]
}

/** One manifest request per document, shared by hover, keyboard intent and departure. */
export function createAppAssetWarmer({ origin, fetchManifest, prefetchAsset }: WarmupOptions) {
  let pending: Promise<void> | undefined
  return () => {
    pending ??= Promise.resolve().then(async () => {
      const response = await fetchManifest('/app-assets.json', { credentials: 'same-origin', cache: 'no-cache', redirect: 'error' })
      if (!response.ok) return
      const assets = parseAppAssetManifest(await response.json(), origin)
      for (const asset of assets) prefetchAsset(asset)
    }).catch(() => { /* Vite, offline or blocked prefetch must never block navigation. */ })
    return pending
  }
}

let warm: ReturnType<typeof createAppAssetWarmer> | undefined
export function warmAppAssets(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  warm ??= createAppAssetWarmer({
    origin: window.location.origin,
    fetchManifest: (url, options) => window.fetch(url, options),
    prefetchAsset: ({ href, as }) => {
      // Prefetch only: neither execute Next scripts nor apply its styles to landing.
      const link = document.createElement('link')
      link.rel = 'prefetch'
      link.as = as
      link.href = href
      document.head.append(link)
    },
  })
  void warm()
}
