/* Blog detail — local data, back link, pixel date, hero image, body. */
import { Link, useParams } from 'react-router'
import { config } from '../config'
import { getPost } from '../lib/api'
import Footer from '../components/Footer'
import DiveBand from '../components/DiveBand'
import NotFound from './NotFound'

export default function BlogPost() {
  const { slug } = useParams()
  const post = slug ? getPost(slug) : undefined
  if (!post) return <NotFound />

  return (
    <div>
      <article className="blog-detail zone zone-z0">
        <Link to="/blog" className="blog-detail__back" data-cursor={config.copy.cursor.back}>
          {config.blog.backLabel}
        </Link>
        <p className="blog-detail__date">{post.date}</p>
        <h1 className="blog-detail__title">{post.title}</h1>
        <figure className="blog-detail__hero">
          <img src={post.image.src} alt={post.image.alt} decoding="async" />
        </figure>
        <div className="blog-detail__body">
          {post.body.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      </article>
      <DiveBand from={0} to={4} />
      <Footer />
    </div>
  )
}
