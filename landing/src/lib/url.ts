/* Own-origin links (the /app console lives on the same domain) navigate
 * in-place; only truly external hrefs earn target="_blank". */
const OWN_ORIGIN = 'https://agyionlabs.dev'

function httpUrl(href: string, base?: string): URL | null {
  try {
    const url = new URL(href, base)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
  } catch { return null }
}

// Classification only: neither helper makes an arbitrary href safe to render.
export const isExternalHref = (href: string) => {
  const url = httpUrl(href, OWN_ORIGIN)
  return url !== null && url.origin !== OWN_ORIGIN
}

/* absolute URL pointing back at us — plain anchor, same-tab full navigation */
export const isOwnOriginHref = (href: string) => httpUrl(href)?.origin === OWN_ORIGIN
