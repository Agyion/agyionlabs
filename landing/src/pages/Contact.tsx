/* Contact — split hero, underline form, service/budget tag selection,
 * math captcha, inline bilingual validation, demo submit, pixel marquee. */
import { useMemo, useState } from 'react'
import { config } from '../config'
import { newChallenge, validateForm, verifyChallenge, type CaptchaChallenge } from '../lib/captcha'
import LedgerHero from '../components/LedgerHero'
import WordMarquee from '../components/WordMarquee'
import Footer from '../components/Footer'
import DiveBand from '../components/DiveBand'

export default function Contact() {
  const { contact } = config
  const form = contact.form

  const [values, setValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<string[]>([])
  const [captcha, setCaptcha] = useState<CaptchaChallenge>(() => newChallenge())
  const [captchaWrong, setCaptchaWrong] = useState(false)
  const [pickedServices, setPickedServices] = useState<string[]>([])
  const [pickedPrice, setPickedPrice] = useState<string>('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const setValue = (id: string, v: string) => {
    setValues((prev) => ({ ...prev, [id]: v }))
    setErrors((prev) => prev.filter((e) => e !== id))
  }

  /* available price options = union of picked services' prices */
  const priceOptions = useMemo(
    () => [...new Set(form.services.filter((s) => pickedServices.includes(s.id)).flatMap((s) => s.prices))],
    [form.services, pickedServices],
  )

  const toggleService = (id: string) => {
    setPickedServices((prev) => {
      const next = prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
      return next
    })
    setPickedPrice('')
  }

  const removeService = (id: string) => toggleService(id)

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const bad = validateForm(form.fields, values)
    const captchaOk = verifyChallenge(captcha, values.captcha ?? '')
    setErrors(bad)
    setCaptchaWrong(!captchaOk)
    if (bad.length || !captchaOk) {
      if (!captchaOk) setCaptcha(newChallenge())
      return
    }
    setSending(true)
    /* demo stub — no backend; resolves locally */
    window.setTimeout(() => {
      setSending(false)
      setSent(true)
    }, 900)
  }

  const reset = () => {
    setValues({})
    setErrors([])
    setPickedServices([])
    setPickedPrice('')
    setCaptcha(newChallenge())
    setSent(false)
  }

  const fieldError = (id: string) => errors.includes(id)

  return (
    <div>
      <LedgerHero data={contact.hero} />
      <DiveBand from={0} to={1} />

      <div className="contact-form-wrap zone zone-z1">
        {sent ? (
          <div className="contact-success" role="status">
            <h2 className="contact-success__title">{form.successTitle}</h2>
            <p className="contact-success__body">{form.successBody}</p>
            <button type="button" className="btn-submit" onClick={reset}>
              {form.resetLabel}
            </button>
          </div>
        ) : (
          <form className="contact-form" id="contact-form" noValidate onSubmit={onSubmit}>
            {/* hidden selection fields (written by tag clicks) */}
            <input type="hidden" id="f_budget" name="budget" value={pickedServices.map((id) => form.services.find((s) => s.id === id)?.label ?? id).join(', ')} />
            <input type="hidden" id="f_price" name="price" value={pickedPrice} />
            <input type="text" className="form-hp" name="_hp" tabIndex={-1} autoComplete="off" aria-hidden="true" />

            <div className="form-fields">
              {form.fields.map((f) => (
                <div key={f.id} className={`field-group${f.type === 'textarea' ? ' field-full' : ''}`}>
                  <label htmlFor={`f_${f.id}`}>
                    {f.required && (
                      <span className="req" aria-hidden="true">
                        *{' '}
                      </span>
                    )}
                    {f.label}
                    {f.optionalTag && <span className="opt"> {f.optionalTag}</span>}
                  </label>
                  {f.type === 'textarea' ? (
                    <textarea
                      id={`f_${f.id}`}
                      name={f.id}
                      placeholder={f.placeholder}
                      value={values[f.id] ?? ''}
                      onChange={(e) => setValue(f.id, e.target.value)}
                    />
                  ) : (
                    <input
                      id={`f_${f.id}`}
                      name={f.id}
                      type={f.type}
                      placeholder={f.placeholder}
                      value={values[f.id] ?? ''}
                      onChange={(e) => setValue(f.id, e.target.value)}
                    />
                  )}
                  <div
                    className={`field-error${fieldError(f.id) ? ' is-visible' : ''}`}
                    id={`${f.id}-error`}
                    role={fieldError(f.id) ? 'alert' : undefined}
                  >
                    {f.errorText}
                  </div>
                </div>
              ))}
            </div>

            <div className="budget-section">
              <div className="budget-label">{form.servicesLabel}</div>
              <div className="budget-offers">
                {form.services.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`budget-btn${pickedServices.includes(s.id) ? ' is-selected' : ''}`}
                    data-budget={s.label}
                    aria-pressed={pickedServices.includes(s.id)}
                    onClick={() => toggleService(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <div className={`budget-prices${pickedServices.length ? ' is-visible' : ''}`} id="budget-price-offers">
                {priceOptions.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`budget-btn${pickedPrice === p ? ' is-selected' : ''}`}
                    aria-pressed={pickedPrice === p}
                    onClick={() => setPickedPrice(pickedPrice === p ? '' : p)}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div className={`budget-selected${pickedServices.length ? ' is-visible' : ''}`}>
                <div className="budget-label">{form.selectedLabel}</div>
                <div className="budget-selected__tags" id="budget-selected-tags">
                  {pickedServices.map((id) => {
                    const svc = form.services.find((s) => s.id === id)
                    return (
                      <span className="budget-tag" key={id}>
                        {svc?.label}
                        {pickedPrice && ` · ${pickedPrice}`}
                        <button type="button" aria-label={`${config.copy.ui.removePrefix} ${svc?.label}`} onClick={() => removeService(id)}>
                          ×
                        </button>
                      </span>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="captcha-block">
              <div className="budget-label">{form.captchaLabel}</div>
              <div className="captcha-row">
                <div className="captcha-eq" aria-hidden="true">
                  <span>{captcha.a}</span>
                  <span>+</span>
                  <span>{captcha.b}</span>
                  <span>=</span>
                </div>
                <input
                  className="captcha-input"
                  id="f_captcha"
                  name="captcha"
                  type="number"
                  placeholder="?"
                  aria-label={form.captchaLabel}
                  value={values.captcha ?? ''}
                  onChange={(e) => setValue('captcha', e.target.value)}
                />
              </div>
              <div className={`field-error${captchaWrong ? ' is-visible' : ''}`} id="captcha-error" role={captchaWrong ? 'alert' : undefined}>
                {form.captchaError}
              </div>
            </div>

            <div className="submit-wrap">
              <button type="submit" className="btn-submit" id="btn-submit" disabled={sending}>
                {sending ? form.sendingLabel : form.submitLabel}
              </button>
            </div>
          </form>
        )}
      </div>

      <WordMarquee words={contact.marqueeWords} duration={20} />
      <DiveBand from={1} to={4} />
      <Footer />
    </div>
  )
}
