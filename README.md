# brap.fun 2.0 static shell

This directory contains a static-first shell for `brap.fun`.

## Local usage

- Open `index.html` directly in a browser, or
- Serve the folder with any static file host.

## GitHub Pages deployment

1. Keep all assets referenced with relative paths (already set with `./` imports).
2. Publish from the repository root or from this folder depending on your Pages setup.
3. If using repository root Pages, ensure `2.0/index.html` is the published entry for this version.

## Notes

- No backend required.
- No API dependencies.
- No build tool required.
- JavaScript only manages client-side UI state and optional local oscillator UI sounds.
