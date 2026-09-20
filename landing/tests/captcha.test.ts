import { describe, expect, it } from 'vitest'
import { newChallenge, validateField, validateForm, verifyChallenge } from '../src/lib/captcha'

describe('math captcha', () => {
  it('challenge answer matches a+b', () => {
    const c = newChallenge(() => 0.5)
    expect(c.answer).toBe(c.a + c.b)
    expect(c.a).toBeGreaterThanOrEqual(1)
    expect(c.b).toBeLessThanOrEqual(9)
  })

  it('verify accepts the exact sum only', () => {
    const c = { a: 3, b: 4, answer: 7 }
    expect(verifyChallenge(c, '7')).toBe(true)
    expect(verifyChallenge(c, ' 7 ')).toBe(true)
    expect(verifyChallenge(c, '8')).toBe(false)
    expect(verifyChallenge(c, '')).toBe(false)
    expect(verifyChallenge(c, 'abc')).toBe(false)
  })
})

describe('form validation', () => {
  it('required text rejects empty but accepts whitespace-trimmed content', () => {
    expect(validateField({ required: true, type: 'text' }, '  ')).toBe(false)
    expect(validateField({ required: true, type: 'text' }, ' Ada ')).toBe(true)
  })

  it('optional fields always pass', () => {
    expect(validateField({ required: false, type: 'textarea' }, '')).toBe(true)
  })

  it('email requires a plausible shape', () => {
    expect(validateField({ required: true, type: 'email' }, 'a@b.co')).toBe(true)
    expect(validateField({ required: true, type: 'email' }, 'a@b')).toBe(false)
    expect(validateField({ required: true, type: 'email' }, 'nope')).toBe(false)
  })

  it('validateForm returns only invalid required ids', () => {
    const fields = [
      { id: 'name', required: true, type: 'text' as const },
      { id: 'email', required: true, type: 'email' as const },
      { id: 'company', required: false, type: 'text' as const },
      { id: 'message', required: false, type: 'textarea' as const },
    ]
    expect(validateForm(fields, { name: '', email: 'bad', company: '', message: '' })).toEqual(['name', 'email'])
    expect(validateForm(fields, { name: 'Ada', email: 'a@b.co', company: '', message: '' })).toEqual([])
  })
})
