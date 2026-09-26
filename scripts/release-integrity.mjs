/** Pure release-evidence checks. Never fetches or evaluates received content. */
import { createHash } from 'node:crypto';

const digest = value => createHash('sha256').update(value).digest('hex');
// Pinned to the bootstrap observed in the 2026-09-26 saved production HTML.
// Any other shape needs manual review; only its public challenge values vary.
const jsdTemplate = `<script>(function(){function c(){var b=a.contentDocument||(a.contentWindow&&a.contentWindow.document);if(b){var d=b.createElement('script');d.innerHTML="window.__CF$cv$params={r:'@@RAY@@',t:'@@TIME@@'};var a=document.createElement('script');a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';document.getElementsByTagName('head')[0].appendChild(a);";b.getElementsByTagName('head')[0].appendChild(d)}}if(document.body){var a=document.createElement('iframe');a.height=1;a.width=1;a.style.position='absolute';a.style.top=0;a.style.left=0;a.style.border='none';a.style.visibility='hidden';document.body.appendChild(a);if('loading'!==document.readyState)c();else if(window.addEventListener)document.addEventListener('DOMContentLoaded',c);else{var e=document.onreadystatechange||function(){};document.onreadystatechange=function(b){e(b);'loading'!==document.readyState&&(document.onreadystatechange=e,c())}}}})();</script>`;
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const jsdPattern = new RegExp(escapeRegex(jsdTemplate).replace('@@RAY@@', '([0-9a-f]{16})').replace('@@TIME@@', '([A-Za-z0-9+/]{14}==)'), 'g');

export function compareReleaseBody(actual, expected, html = false) {
  if (actual.equals(expected)) return { applicationBody: actual, edgeInjection: null };
  const mismatch = () => { throw new Error('Deployed application artifact mismatch: unreviewed bytes or edge injection.'); };
  if (!html) mismatch();
  const text = actual.toString('utf8');
  // Avoid normalizing invalid UTF-8 into a different byte sequence.
  if (!Buffer.from(text, 'utf8').equals(actual)) mismatch();
  const matches = [...text.matchAll(jsdPattern)];
  if (matches.length !== 1) mismatch();
  const [raw, rayId, encodedTimestamp] = matches[0];
  const timestampBytes = Buffer.from(encodedTimestamp, 'base64');
  if (timestampBytes.toString('base64') !== encodedTimestamp || !/^[1-9][0-9]{9}$/.test(timestampBytes.toString('utf8'))) mismatch();
  const applicationBody = Buffer.from(text.slice(0, matches[0].index) + text.slice(matches[0].index + raw.length));
  if (!applicationBody.equals(expected)) mismatch();
  return { applicationBody, edgeInjection: { kind: 'Cloudflare JavaScript Detection bootstrap', sha256: digest(raw), rayId, encodedTimestamp, raw } };
}

export function assertReleaseCsp(header) {
  if (typeof header !== 'string' || !header.trim() || /[\r\n,]/.test(header)) throw new Error('Missing or unsupported release CSP.');
  const directives = new Map();
  for (const part of header.split(';')) {
    const tokens = part.trim().split(/[\t ]+/);
    if (!tokens[0]) continue;
    const name = tokens.shift().toLowerCase();
    if (!/^[a-z][a-z0-9-]*$/.test(name) || directives.has(name)) throw new Error('Malformed or duplicate release CSP directive.');
    directives.set(name, tokens);
    if (name === 'default-src' || name === 'script-src' || name.startsWith('script-src-')) {
      if (tokens.some(token => ["'unsafe-inline'", "'unsafe-eval'", "'wasm-unsafe-eval'"].includes(token.toLowerCase()))) throw new Error(`Unsafe script permission in ${name}.`);
    }
  }
  if (!directives.get('script-src')?.length) throw new Error('Release CSP requires an explicit script-src.');
  const ancestors = directives.get('frame-ancestors');
  if (ancestors?.length !== 1 || ancestors[0].toLowerCase() !== "'none'") throw new Error('Release CSP must forbid framing.');
}
