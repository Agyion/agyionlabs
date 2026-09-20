/* Blog list — simulated fetch: skeleton → rows | error. Hover-follow image. */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { config } from '../config'
import type { BlogPost } from '../types'
import { BlogApiError, fetchPosts } from '../lib/api'
import LedgerHero from '../components/LedgerHero'
import Footer from '../components/Footer'
import DiveBand from '../components/DiveBand'

type Status = 'loading' | 'ready' | 'error'

export default function Blog() {
  const { blog } = config
  const [status, setStatus] = useState<Status>('loading')
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [errorStatus, setErrorStatus] = useState<number>(502)
  const hoverBoxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    fetchPosts()
      .then((data) => {
        if (cancelled) return
        setPosts(data)
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setErrorStatus(err instanceof BlogApiError ? err.status : 500)
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  /* hover-follow floating thumb (lerp 0.16, mousemove + rAF) */
  useEffect(() => {
    const box = hoverBoxRef.current
    if (!box) return
    if (window.matchMedia('(hover: none)').matches) return
    let raf = 0
    let tx = 0
    let ty = 0
    let cx = 0
    let cy = 0
    const onMove = (e: MouseEvent) => {
      tx = e.clientX
      ty = e.clientY
    }
    const loop = () => {
      raf = requestAnimationFrame(loop)
      cx += (tx - cx) * 0.16
      cy += (ty - cy) * 0.16
      box.style.transform = `translate(${cx}px,${cy}px) translate(-50%,-50%)${box.classList.contains('is-visible') ? '' : ' scale(0.92)'}`
    }
    raf = requestAnimationFrame(loop)
    document.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('mousemove', onMove)
    }
  }, [])

  const showHoverImg = (src: string) => {
    const box = hoverBoxRef.current
    if (!box) return
    const img = box.querySelector('img')
    if (img && img.getAttribute('src') !== src) img.setAttribute('src', src)
    box.classList.add('is-visible')
  }

  const hideHoverImg = () => hoverBoxRef.current?.classList.remove('is-visible')

  return (
    <div>
      <LedgerHero data={blog.hero} />
      <DiveBand from={0} to={1} />
      <div className="blog-wrap zone zone-z1">
        {status === 'loading' && (
          <>
            <div className="blog-loading" id="blog-loading">
              {blog.loadingLabel}
            </div>
            <div className="blog-grid" aria-hidden="true">
              {Array.from({ length: blog.skeletonRows }, (_, i) => (
                <div className="blog-post blog-post--sk" key={i}>
                  <span className="sk sk-date" />
                  <span className="sk sk-title" />
                  <span className="blog-post__arrow">›</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className={`blog-error${status === 'error' ? ' is-visible' : ''}`} id="blog-error" role="alert">
          {blog.errorLabel(errorStatus)}
        </div>

        {status === 'ready' &&
          (posts.length === 0 ? (
            <div className="blog-loading">{blog.emptyLabel}</div>
          ) : (
            <div className="blog-grid" id="blog-grid">
              {posts.map((p) => (
                <Link
                  key={p.slug}
                  to={`/blog/${p.slug}`}
                  className="blog-post"
                  data-img={p.image.src}
                  onMouseEnter={() => showHoverImg(p.image.src)}
                  onMouseLeave={hideHoverImg}
                >
                  <span className="blog-post__date">{p.date}</span>
                  <span className="blog-post__title">{p.title}</span>
                  <span className="blog-post__arrow" aria-hidden="true">
                    ›
                  </span>
                </Link>
              ))}
            </div>
          ))}
      </div>

      <div ref={hoverBoxRef} className="blog-hover-img" id="blog-hover-img" aria-hidden="true">
        <img src={posts[0]?.image.src} alt="" decoding="async" />
      </div>

      <DiveBand from={1} to={4} />
      <Footer />
    </div>
  )
}
