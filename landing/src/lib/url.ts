/* Own-origin links (the /app console lives on the same domain) navigate
 * in-place; only truly external hrefs earn target="_blank". */
const OWN_ORIGIN = 'https://agyionlabs.dev'

export const isExternalHref = (href: string) =>
  /^https?:\/\//.test(href) && !href.startsWith(OWN_ORIGIN)

/* absolute URL pointing back at us — plain anchor, same-tab full navigation */
export const isOwnOriginHref = (href: string) => href.startsWith(OWN_ORIGIN)
