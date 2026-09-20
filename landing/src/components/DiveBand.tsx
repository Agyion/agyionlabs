/* Dive band — the short gradient drop between two depth zones
 * ("scroll = descent"). Content sections stay solid and legible;
 * the descent happens here. Pure decoration. */
export default function DiveBand({ from, to }: { from: 0 | 1 | 2 | 3 | 4; to: 0 | 1 | 2 | 3 | 4 }) {
  return <div className={`zone-dive zone-z${from} zone-next-z${to}`} aria-hidden="true" />
}
