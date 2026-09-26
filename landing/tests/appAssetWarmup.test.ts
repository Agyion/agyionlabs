import { describe, expect, it, vi } from 'vitest'
import { createAppAssetWarmer, parseAppAssetManifest } from '../src/lib/appAssetWarmup'

const origin = 'https://agyionlabs.dev'
const assets = [
  { href: '/_next/static/chunks/app/app/page-123abc.js', as: 'script' },
  { href: '/_next/static/css/app-123abc.css', as: 'style' },
]
const manifest = { version: 1, assets }

describe('app asset manifest validation', () => {
  it('accepts same-origin static JavaScript and CSS without converting them into executable elements', () => {
    expect(parseAppAssetManifest(manifest, origin)).toEqual(assets)
  })

  it.each([
    'https://other.test/_next/static/chunks/x.js',
    'https://agyionlabs.dev/_next/static/chunks/x.js',
    '//other.test/_next/static/chunks/x.js',
    '/_next/static/../x.js',
    '/_next/static/chunks/%2e%2e/x.js',
    '/_next/static/chunks/x.js?x',
    '/_next/static/chunks/x.js#x',
    '/_next/static/chunks\\x.js',
    '/_next/static//x.js',
    '/api/x.js',
  ])('rejects unsafe or noncanonical path %s', href => {
    expect(parseAppAssetManifest({ ...manifest, assets: [{ href, as: 'script' }] }, origin)).toEqual([])
  })

  it('rejects wrong extensions, unknown versions, excessive lists and a partly malformed manifest atomically', () => {
    expect(parseAppAssetManifest({ version: 2, assets }, origin)).toEqual([])
    expect(parseAppAssetManifest({ version: 1, assets: Array(49).fill(assets[0]) }, origin)).toEqual([])
    expect(parseAppAssetManifest({ version: 1, assets: [assets[0], { ...assets[1], as: 'script' }] }, origin)).toEqual([])
    expect(parseAppAssetManifest({ version: 1, assets: [{ href: '/_next/static/media/font.woff2', as: 'style' }] }, origin)).toEqual([])
    expect(parseAppAssetManifest(null, origin)).toEqual([])
  })
})

describe('intent asset warming', () => {
  it('revalidates the manifest and deduplicates concurrent and repeated intent across routes', async () => {
    const fetchManifest = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...manifest, assets: [...assets, assets[0]] }) })
    const prefetchAsset = vi.fn()
    const warm = createAppAssetWarmer({ origin, fetchManifest, prefetchAsset })
    await Promise.all([warm(), warm(), warm()])
    await warm()
    expect(fetchManifest).toHaveBeenCalledOnce()
    expect(fetchManifest).toHaveBeenCalledWith('/app-assets.json', { credentials: 'same-origin', cache: 'no-cache', redirect: 'error' })
    expect(prefetchAsset.mock.calls).toEqual(assets.map(asset => [asset]))
  })

  it.each(['not-found', 'offline', 'invalid-json', 'invalid-manifest'])('does not block navigation or repeatedly retry when %s', async failure => {
    const fetchManifest = vi.fn(async () => {
      if (failure === 'offline') throw new Error('offline')
      return { ok: failure !== 'not-found', json: async () => {
        if (failure === 'invalid-json') throw new SyntaxError('HTML fallback')
        return failure === 'invalid-manifest' ? { version: 1, assets: [{ href: '//external.test/x.js', as: 'script' }] } : manifest
      } }
    })
    const prefetchAsset = vi.fn()
    const warm = createAppAssetWarmer({ origin, fetchManifest, prefetchAsset })
    await expect(warm()).resolves.toBeUndefined()
    await expect(warm()).resolves.toBeUndefined()
    expect(fetchManifest).toHaveBeenCalledOnce()
    expect(prefetchAsset).not.toHaveBeenCalled()
  })
})
