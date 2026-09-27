/** Parse the exact path/trailing-splat rules emitted by the static site builder. */
export function staticPreviewHeaders(document, pathname) {
  const headers = {};
  let applies = false;
  for (const line of document.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      const pattern = line.trim();
      applies = pattern.endsWith('*') ? pathname.startsWith(pattern.slice(0, -1)) : pattern === pathname;
    } else if (applies) {
      const colon = line.indexOf(':');
      if (colon > 0) {
        const name = line.slice(0, colon).trim().toLowerCase();
        const value = line.slice(colon + 1).trim();
        headers[name] = Object.hasOwn(headers, name) ? `${headers[name]}, ${value}` : value;
      }
    }
  }
  return headers;
}
