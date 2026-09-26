export function routeScrollKey(location: { key: string; pathname: string; search: string; hash: string }) {
  // Native hash entries have no Router state and reuse "default". They must
  // never share the initial document's position just because that key matches.
  return JSON.stringify([location.key, location.pathname, location.search, location.hash])
}
