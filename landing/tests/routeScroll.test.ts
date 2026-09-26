import { describe, expect, it } from 'vitest'
import { routeScrollKey } from '../src/lib/routeScroll'

describe('native history scroll identity', () => {
  it('does not restore the initial hero position into a native instruments hash entry', () => {
    const initial = { key: 'default', pathname: '/', search: '', hash: '' }
    const positions = new Map([[routeScrollKey(initial), 0]])
    expect(positions.get(routeScrollKey({ ...initial, hash: '#instruments' }))).toBeUndefined()
  })
  it('keeps exact Back entries separate, including repeated URLs and query variants', () => {
    const entry = { key: 'first', pathname: '/', search: '', hash: '#instruments' }
    const positions = new Map([[routeScrollKey(entry), 960]])
    expect(positions.get(routeScrollKey({ ...entry }))).toBe(960)
    expect(positions.get(routeScrollKey({ ...entry, key: 'second' }))).toBeUndefined()
    expect(positions.get(routeScrollKey({ ...entry, search: '?from=detail' }))).toBeUndefined()
  })
})
