# Pontoon brand assets

| File | Size | Use |
| --- | --- | --- |
| `pontoon-logo-1000.png` | 1000×1000 (1:1) | Profile picture / token logo (X, DexScreener, wallets) |
| `pontoon-logo-500.png` | 500×500 (1:1) | Same, smaller file |
| `pontoon-banner-1500x500.png` | 1500×500 (3:1) | X header and DexScreener banner |

All files are PNG and well under 4.5 MB.

- The logo keeps the boat inside the center circle, so circular crops (X, DexScreener) never cut it.
- The banner leaves the bottom-left corner empty because the X profile picture overlaps it there.

## Editing

`source/` holds the HTML/SVG the images are rendered from (`pontoon-glyph.svg` is the boat mark).
Open a file in Chromium at its exact size (1000×1000 or 1500×500) and take a screenshot, or render it
with Playwright.
