/* Math captcha — pure, unit-tested. */

export interface CaptchaChallenge {
  a: number
  b: number
  answer: number
}

export function newChallenge(rand: () => number = Math.random): CaptchaChallenge {
  const a = 1 + Math.floor(rand() * 9)
  const b = 1 + Math.floor(rand() * 9)
  return { a, b, answer: a + b }
}

export function verifyChallenge(challenge: CaptchaChallenge, input: string): boolean {
  const n = Number(input.trim())
  return Number.isFinite(n) && n === challenge.answer
}

/* Contact form field validation — kept pure for the unit tests. */

export interface FieldRule {
  required: boolean
  type: 'text' | 'email' | 'tel' | 'textarea'
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateField(rule: FieldRule, value: string): boolean {
  const v = value.trim()
  if (!rule.required) return true
  if (!v) return false
  if (rule.type === 'email') return EMAIL_RE.test(v)
  return true
}

/** Returns the set of invalid required field ids. */
export function validateForm(
  fields: Array<{ id: string; required: boolean; type: FieldRule['type'] }>,
  values: Record<string, string>,
): string[] {
  return fields.filter((f) => !validateField(f, values[f.id] ?? '')).map((f) => f.id)
}
