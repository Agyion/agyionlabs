/* Demo blog API — local data behind an async seam so the list page shows
 * real loading skeleton / success / error states without a backend.
 * `?blogError=1` (or localStorage 'blog:force-error') forces the error path,
 * which is how the acceptance matrix exercises it.
 */
import { config } from '../config'
import type { BlogPost } from '../types'

export class BlogApiError extends Error {
  status: number
  constructor(status: number) {
    super(`server responded ${status}`)
    this.name = 'BlogApiError'
    this.status = status
  }
}

export function isForcedError(search = window.location.search): boolean {
  if (new URLSearchParams(search).has('blogError')) return true
  try {
    return window.localStorage.getItem('blog:force-error') === '1'
  } catch {
    return false
  }
}

export async function fetchPosts(delayMs = config.blog.fetchDelayMs): Promise<BlogPost[]> {
  await new Promise((r) => setTimeout(r, delayMs))
  if (isForcedError()) throw new BlogApiError(502)
  return config.blog.posts
}

export function getPost(slug: string): BlogPost | undefined {
  return config.blog.posts.find((p) => p.slug === slug)
}
