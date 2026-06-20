# 🎱 3D Pool Game: Interactive Graphics Project

Sapienza University of Rome, Interactive Graphics course (Prof. Marco Schaerf), a.y. 2025/2026.

**Live demo (GitHub Pages):** https://sapienzainteractivegraphicscourse.github.io/final-project-pimpitots/

## Running locally

The project is a static site with no build step. Three.js (r128) is vendored locally in `libs/`, so no network access is required.

Serve the repo root with any static file server, e.g.:

```
python -m http.server 7777
```

Then open the printed URL in a browser. Opening `index.html` directly via `file://` won't work: ES module imports need an HTTP origin.

## 🎮 How to Play

Drag to aim the cue, hold still to charge your shot, release to fire! 💥 Sink a ball by accident? No worries, the cue ball respawns if you scratch.

Pocket every colored ball to clear a level. There are 4 levels, each one a bit tougher than the last. Beat them all and confetti rains down on your "YOU WIN!" screen 🎉

Pick your difficulty before you start: Normal, Hard, or the dreaded Insane 😈 (one life, faster music, no mercy). Lose a heart ❤️ every time a shot doesn't pocket a colored ball. Run out of hearts and it's game over, but you can always jump back in.

### Controls 🕹️

| Key | Action |
|---|---|
| Drag | Aim |
| Hold | Charge power |
| Release | Shoot |
| Scroll | Zoom (Player POV) |
| `L` | Table lamp 💡 |
| `O` | Ceiling light |
| `M` | Music 🎵 |
| `C` / `V` | Switch camera |
| `N` | New ball setup |
| `R` | Reset |

Touch works too: tap and hold to charge, drag to aim, lift to shoot.

## Project structure

- `index.html`: entry point, canvas element and `three` import map.
- `main.js`: engine bootstrap (renderer, scene, camera, render loop).
- `models.js`: Three.js geometry/material construction.
- `libs/`: vendored third-party libraries (Three.js).
