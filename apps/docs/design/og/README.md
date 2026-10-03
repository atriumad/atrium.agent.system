# Social preview images

`static/img/og-en.png` and `og-es.png` (1200×630) and `apple-touch-icon.png` (180×180).
The avatars are rendered from the same Blobatar seeds, palettes and expressions as the home page.

1. `bun design/og/generate.ts` writes `og-en.html`, `og-es.html` and `apple-touch-icon.html`.
2. Open each at its size (1200×630, 1200×630, 180×180) and capture it at 2× into `design/og/_raw/`.
3. Downscale into `static/img/` (macOS): `sips -z 630 1200 _raw/og-en.png --out ../../static/img/og-en.png`, the same for `og-es`, and `sips -z 180 180` for the touch icon.

Change a headline or an agent in `generate.ts` or `src/data/agents.ts`, then repeat.
