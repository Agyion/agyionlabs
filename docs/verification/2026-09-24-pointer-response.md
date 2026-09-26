# Pointer response verification

The final combined site at `http://127.0.0.1:4192` passed **14 interaction checks** at 1440×1000. The isolated browser closed after the run. Raw evidence and 21 screenshots are in `artifacts/verification/pointer-response-final/`.

The diagnostic reads `modelViewMatrix` from the fixed star mesh, whose world transform is identity. It compares the matrix's rotation entries and ignores translation. This separates camera response from ring rotation, gas animation and the ship's small vertical bob. Rendering, clocks and input damping remain unmodified.

| Mode | Camera-basis change while stationary | Change after mouse-only movement | Difference after leaving the canvas |
| --- | ---: | ---: | ---: |
| Landing, normal motion | 0 | 0.026861 | 0.000109 |
| App, normal motion | 0.00000073 | 0.029072 | 0.0000178 |
| Landing, reduced motion | 0 | 0 | 0 |
| App, reduced motion | 0 | 0 | 0 |

Values are maximum absolute differences between rotation-matrix elements, not angles or frame-rate measurements. Deliberate drag changed the camera in every mode, and Home returned it to its starting orientation. Passive movement and dock preview preserved the URL, selected instrument and closed workspace.

Both normal-motion before/after image pairs were visually inspected: the space background responds while the page typography remains stationary. The screenshots also contain ordinary world animation; the matrix measurements establish that the pointer moves the camera.

Dock hover and keyboard focus illuminated the same bay without moving the camera or opening a form. With reduced motion and all interface controls outside the screenshot crop, both changed 19 scene pixels, with a maximum color-channel difference of 234. The illumination is real but visually subtle at this viewport.

One read-only POST to `https://soroban-testnet.stellar.org/` failed with `net::ERR_NETWORK_CHANGED` during app-normal drag/reset, accompanied by its console error. The report retains both diagnostics. There were no JavaScript page errors or HTTP error responses. The run therefore reports `interaction_passed_with_runtime_diagnostics`, not clean network operation.

This used headless Chromium with SwiftShader. It verifies interaction correctness; it does not establish native GPU performance, animation smoothness, live deployment or wallet/transaction execution.
