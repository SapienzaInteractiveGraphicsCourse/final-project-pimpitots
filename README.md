# 3D Pool Game — Interactive Graphics Project

Sapienza University of Rome, Interactive Graphics course (Prof. Marco Schaerf), a.y. 2025/2026.

**Live demo (GitHub Pages):** https://sapienzainteractivegraphicscourse.github.io/final-project-pimpitots/

## Running locally

The project is a static site with no build step. Three.js (r128) is vendored locally in `libs/`, so no network access is required.

Serve the repo root with any static file server, e.g.:

```
npx http-server .
```

Then open the printed URL in a browser. Opening `index.html` directly via `file://` will not work — ES module imports require an HTTP origin.

## Project structure

- `index.html` — entry point; canvas element and `three` import map.
- `main.js` — engine bootstrap: renderer, scene, camera, render loop.
- `models.js` — Three.js geometry/material construction.
- `libs/` — vendored third-party libraries (Three.js).
