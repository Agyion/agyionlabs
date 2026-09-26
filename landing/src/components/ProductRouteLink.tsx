import type { MouseEvent, ReactNode } from 'react'
import { useNavigate } from 'react-router'
import type { CoreInstrument } from './DetailWorld'
import { commitProductRoute, isPlainProductClick, transitionProductRoute } from './productRouteTransition'
import '../styles/product-route-transition.css'

export type ProductRouteLinkProps = { id: CoreInstrument; children: ReactNode; className?: string }

export default function ProductRouteLink({ id, children, className }: ProductRouteLinkProps) {
  const navigate = useNavigate()
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainProductClick(event, event.currentTarget.target) || event.currentTarget.hasAttribute('download')) return
    event.preventDefault()
    transitionProductRoute(id, async () => {
      const committed = await commitProductRoute(id, () => navigate(`/${id}`, { state: { productEntry: true } }))
      // App acknowledges the real DOM commit, so this cannot overwrite the
      // still-mounted gallery's saved position or snapshot its old contents.
      if (committed) window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    })
  }
  return <a href={`/${id}`} className={className} data-product-route-link={id} onClick={open}>{children}</a>
}
