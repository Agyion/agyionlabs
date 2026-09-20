/* Site footer (abyss zone): giant CTA with ink-sweep, word marquee,
 * contact/socials grid, resurface button, colophon. */
import { Link } from 'react-router'
import { config } from '../config'
import WordMarquee from './WordMarquee'

export default function Footer() {
  const { footer } = config
  const toTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

  return (
    <footer className="site-footer zone zone-z4 zone-solid" id="site-footer">
      {footer.cta && (
        <div className="footer-cta">
          {footer.ctaKicker && (
            <span className="footer-cta__kicker" aria-hidden="true">
              {footer.ctaKicker}
            </span>
          )}
          {/^https?:\/\//.test(footer.cta.href) ? (
            <a href={footer.cta.href} target="_blank" rel="noopener noreferrer" className="footer-cta__link" data-cursor={config.copy.cursor.contact}>
              <span className="footer-cta__text">{footer.cta.label}</span>
              <span className="footer-cta__arrow" aria-hidden="true">
                ↗
              </span>
            </a>
          ) : (
            <Link to={footer.cta.href} className="footer-cta__link" data-cursor={config.copy.cursor.contact}>
              <span className="footer-cta__text">{footer.cta.label}</span>
              <span className="footer-cta__arrow" aria-hidden="true">
                ↗
              </span>
            </Link>
          )}
        </div>
      )}
      <div className="footer-marquee">
        <WordMarquee words={footer.marqueeWords} duration={26} />
      </div>
      <div className="footer-main">
        <div className="footer-contact">
          <a href={`mailto:${footer.email}`} data-cursor={config.copy.cursor.contact}>
            {footer.email}
          </a>
          <span className="footer-phone">{footer.phone}</span>
          <div className="footer-address">{footer.address}</div>
          <nav className="footer-socials" aria-label={config.copy.a11y.socials}>
            {footer.socials.map((s) =>
              s.href.startsWith('/') ? (
                <Link key={s.label} to={s.href} data-cursor={config.copy.cursor.open}>
                  {s.label}
                </Link>
              ) : (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" data-cursor={config.copy.cursor.open}>
                  {s.label}
                </a>
              ),
            )}
          </nav>
        </div>
        <div className="footer-right">
          <div className="footer-video" aria-hidden="true">
            <video src={footer.video?.src ?? '/media/cc0-flower.mp4'} poster={footer.video?.poster} autoPlay muted loop playsInline preload="metadata" />
            {footer.videoTag && <span className="footer-video__tag">{footer.videoTag}</span>}
          </div>
          <button type="button" className="footer-top-btn" onClick={toTop} data-cursor={config.copy.cursor.top}>
            {footer.backToTopLabel}
          </button>
        </div>
      </div>
      <div className="footer-bottom">
        <span>{footer.copyright}</span>
        <span aria-hidden="true">©</span>
      </div>
      {footer.watermark && (
        <div className="footer-watermark" aria-hidden="true">
          {footer.watermark}
        </div>
      )}
    </footer>
  )
}
