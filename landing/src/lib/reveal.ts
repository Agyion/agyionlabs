/* Scroll-enter reveal — one IntersectionObserver per scan, elements marked
 * with data-reveal get .is-revealed once (CSS drives the transition).
 * Reduced-motion: the global RM rule collapses transitions, so the class
 * flip lands instantly — no content ever stays hidden. */
export function initReveals(root: ParentNode = document): () => void {
  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'))
  if (!els.length) return () => {}
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-revealed')
          io.unobserve(e.target)
        }
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0 },
  )
  for (const el of els) io.observe(el)
  return () => io.disconnect()
}
