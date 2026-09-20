/* Home entry loader — brand mark overlay, dismissed at the config'd time,
 * removed from the DOM right after the fade. */
import { useEffect, useState } from 'react'
import { config } from '../config'

let shownThisSession = false

export default function Loader() {
  const [visible, setVisible] = useState(() => config.home.loader.enabled && !shownThisSession)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!visible) return
    shownThisSession = true
    const { holdMs, dismissMs } = config.home.loader
    const t1 = window.setTimeout(() => setDismissed(true), holdMs)
    const t2 = window.setTimeout(() => setVisible(false), dismissMs)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [visible])

  if (!visible) return null
  const [l1, l2] = config.home.loader.letters
  return (
    <div className={`loader${dismissed ? ' is-dismissed' : ''}`} id="site-loader" role="status" aria-label={config.copy.a11y.loading}>
      <div className="loader__mark" aria-hidden="true">
        <span className="loader__letter">{l1}</span>
        <span className="loader__icon" />
        <span className="loader__letter">{l2}</span>
      </div>
    </div>
  )
}
