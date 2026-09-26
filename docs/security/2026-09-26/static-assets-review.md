# Authored CSS, public SVG and research-board static review

Date: 2026-09-26. Read every line of **21 files, 6,780 lines, 243,747 bytes**, separated by activation status below. The [manifest](static-assets-review.json) records exact paths, SHA-256 hashes, byte and line counts. These source files were not edited. The long landing orbital stylesheet's truncated first output was followed by a separate read of the omitted middle range.

| Classification | Manually reviewed scope | Files | Lines | Bytes |
| --- | --- | ---: | ---: | ---: |
| Active production source | Nine imported authored CSS files; sole SVG under `app/public/` and `landing/public/` | 10 | 3,091 | 151,605 |
| Dormant scaffold, not imported | `about.css`, `blog.css`, `contact.css`, `cursor.css`, `home-hero.css`, `home.css`, `lab.css`, `nav.css`, `work.css` under `landing/src/styles/` | 9 | 3,657 | 75,850 |
| Archival research board, not deployed | `docs/research/2026-09-25-crypto-design/index.html` and `board.css` | 2 | 32 | 16,292 |

Activation was checked through `app/app/layout.tsx`, `landing/src/main.tsx`, `landing/src/components/DetailWorld.tsx` and `PodConditionTrial.tsx`. Active CSS contains no further imports. The combined-site assembler copies built landing/app output; it does not include the research-board directory. All ten previously recorded active-source hashes were unchanged when the coverage extension was recorded. The nine dormant styles are now reviewed, but are not represented as deployed code.

## Findings

No actionable script/content-injection or external-exfiltration mechanism was found in these static files:

- Active CSS resource loads are nine fixed same-origin font URLs and two `url(#mechanism-light)` same-document SVG paint references. Dormant scaffold CSS introduces no resource loads; the research-board CSS adds two fixed relative font URLs into the repository's landing font directory. There are no remote imports, data URLs, JavaScript URLs, legacy executable CSS expressions/bindings or conditional selectors that load attacker endpoints from form values.
- Generated text is empty decoration, fixed symbols, the 404 heading's `content: attr(data-text)` or dormant cursor text from `attr(data-cursor-label)`. Those attributes are displayed as text; they are not interpreted as markup or used as resource URLs by these rules.
- The favicon is a single static SVG containing a rectangle, group, circle and ellipse. It has no script, event handler, external link/resource, embedded image, `foreignObject`, animation or XML entity declaration. Its `http://www.w3.org/2000/svg` namespace is an identifier, not a fetched asset.
- Form status/control states use classes, ARIA attributes and fixed declarations. Hidden panels have explicit hidden/display rules; reduced-motion rules and focus outlines exist. These source observations do not certify keyboard behavior, contrast, layout or the absence of visual overlays in a running browser.
- The research-board HTML has one fixed relative stylesheet and one fixed relative deferred script (`board.js`). It contains no inline executable code, event-handler attributes, frames, external executable resources or forms. Its report links and fragment navigation are fixed. The script-populated card containers do not establish a new input source in the HTML itself. `board.js` was separately read by the parent reviewer; it is not included in this subreview's manual-file count or manifest.
- The board is dated 2026-09-25 and retains historical screenshots, proposal language and then-open UI bug labels. Those archival labels are not a claim that the bugs remain present after later fixes. No archival text was silently rewritten. The dormant contact stylesheet's honeypot visibility rule is presentation only and is not evidence of server-side abuse prevention.

## Limits

This covers the hash-listed authored static assets only. It does not inspect binary font/image/video payloads, generated Tailwind/vendor CSS, runtime-created styles/SVG, renderer shaders, browser engine vulnerabilities or server/edge-injected resources. No browser, GPU, build or network request ran for this review. Previous visual/browser evidence is separate and must not be inferred from this result. Changing these files requires updating their hashes and reviewing the changed bytes.
