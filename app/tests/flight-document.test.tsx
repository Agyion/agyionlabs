import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import RootLayout from '../app/layout';

describe('flight document first paint', () => {
  it.each([
    ['app', () => renderToStaticMarkup(<RootLayout><main>Console</main></RootLayout>)],
    ['landing', () => readFileSync(new URL('../../landing/index.html', import.meta.url), 'utf8')],
  ] as const)('keeps the %s canvas dark before external CSS, body or JavaScript arrive', (_name, html) => {
    const markup = html();
    // Model the incoming document while only its head has arrived. No external
    // resources or scripts run, so neither the body nor the flight bridge can
    // supply the canvas color. Removing the inline root style regresses this.
    const documentStart = markup.slice(0, markup.indexOf('</head>') + 7);
    const dom = new JSDOM(documentStart);
    try {
      const { document } = dom.window;
      const root = dom.window.getComputedStyle(document.documentElement);
      expect(root.backgroundColor).toBe('rgb(7, 9, 13)');
      expect(root.colorScheme).toBe('dark');
      expect(document.querySelector('meta[name="color-scheme"]')?.getAttribute('content')).toBe('dark');
      expect(document.body.childElementCount).toBe(0);
    } finally {
      dom.window.close();
    }
  });
});
