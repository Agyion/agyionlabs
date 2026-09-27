/** Build Cloudflare static-asset response headers without touching artifacts. */
export function buildSiteHeaders(csp) {
  const htmlPaths = ['/', '/index.html', '/app', '/404', '/404/', '/404.html'];
  for (const route of ['instruments', 'fade', 'pod', 'trigger', 'envoy', 'ramp', 'ledger']) {
    htmlPaths.push(`/${route}`, `/${route}/`, `/${route}.html`);
  }
  const htmlHeaders = htmlPaths.map(route => `${route}\n  Cache-Control: public, max-age=0, must-revalidate, no-transform\n`).join('\n');
  return `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000

/_next/static/*
  Cache-Control: public, max-age=31536000, immutable

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/app/*
  Cache-Control: public, max-age=0, must-revalidate

/app-assets.json
  Cache-Control: public, max-age=0, must-revalidate

${htmlHeaders}
# Cloudflare joins matching header values. The /app/* rule already provides
# public, max-age=0, must-revalidate, so add only the missing directive here.
/app/
  Cache-Control: no-transform

/app/index.html
  Cache-Control: no-transform
`;
}
