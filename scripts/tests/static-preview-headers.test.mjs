import test from 'node:test';
import assert from 'node:assert/strict';
import { staticPreviewHeaders } from '../static-preview-headers.mjs';
import { buildSiteHeaders } from '../site-headers.mjs';
import { assertHtmlCacheControl } from '../release-integrity.mjs';

test('preview joins every matching header field case-insensitively like Cloudflare', () => {
  const document = `/*
  Content-Security-Policy: script-src 'self'
/app/*
  Cache-Control: public, max-age=0, must-revalidate
/app/
  cache-control: no-transform
`;
  assert.deepEqual(staticPreviewHeaders(document, '/app/'), {
    'content-security-policy': "script-src 'self'",
    'cache-control': 'public, max-age=0, must-revalidate, no-transform',
  });
  assert.equal(staticPreviewHeaders(document, '/app/index.txt')['cache-control'], 'public, max-age=0, must-revalidate');
});

test('comments and blank lines do not change the active rule or become headers', () => {
  const document = `/app/
# comment between a pattern and its fields
  Cache-Control: no-transform
  # comment: not a header

  X-Test: yes
/other
  X-Test: no
`;
  assert.deepEqual(staticPreviewHeaders(document, '/app/'), { 'cache-control': 'no-transform', 'x-test': 'yes' });
  assert.deepEqual(staticPreviewHeaders(document, '/unmatched'), {});
});

test('generated app HTML passes strict cache check while hashed assets remain immutable', () => {
  const csp = "script-src 'self'; frame-ancestors 'none'";
  const document = buildSiteHeaders(csp);
  for (const pathname of ['/', '/app', '/app/', '/app/index.html', '/instruments', '/pod/']) {
    const headers = staticPreviewHeaders(document, pathname);
    assertHtmlCacheControl(headers['cache-control']);
    assert.equal(headers['content-security-policy'], csp);
  }
  for (const pathname of ['/_next/static/chunks/app.js', '/assets/landing.css']) {
    assert.equal(staticPreviewHeaders(document, pathname)['cache-control'], 'public, max-age=31536000, immutable');
  }
});
