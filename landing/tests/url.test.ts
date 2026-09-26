import { describe, expect, it } from 'vitest'
import { isExternalHref, isOwnOriginHref } from '../src/lib/url'

describe('link origin classification', () => {
  it.each([
    'https://agyionlabs.dev.evil.test/app/',
    'https://agyionlabs.dev@evil.test/app/',
    'https://agyionlabs.dev:444/app/',
    'http://agyionlabs.dev/app/',
    '//evil.test/app/',
  ])('does not treat a different origin as our own: %s', href => {
    expect(isOwnOriginHref(href)).toBe(false)
    expect(isExternalHref(href)).toBe(true)
  })

  it.each(['https://agyionlabs.dev/app/', 'https://AGYIONLABS.DEV:443/app/'])('recognizes the parsed same origin: %s', href => {
    expect(isOwnOriginHref(href)).toBe(true)
    expect(isExternalHref(href)).toBe(false)
  })

  it.each(['/app/', '#instruments', 'mailto:test@example.test', 'javascript:alert(1)', 'https://[invalid'])('does not misclassify a relative, non-HTTP or malformed link as an absolute own-origin URL: %s', href => {
    expect(isOwnOriginHref(href)).toBe(false)
    expect(isExternalHref(href)).toBe(false)
  })
})
