# 3D Pool Game - Interactive Graphics Project

Sapienza University of Rome, Interactive Graphics course (Prof. Marco Schaerf), a.y. 2025/2026.

By Francesco Pimpinelli & Leonardo Pitotti.

---
**Live demo (GitHub Pages):** 🎱[Play Here](https://sapienzainteractivegraphicscourse.github.io/final-project-pimpitots/)


## How to Play

The goal is to pocket every colored ball in four progressively harder levels (1 ball → 2 → 3 → 4). Pocket them all on Level 4 and you win.

**Shooting:** press and hold on the canvas to charge power, release to fire. Drag while holding to aim instead while drag cancels the charge, so releasing after a drag won't accidentally shoot. 

**Lives:** choose a difficulty before the match starts. You lose a heart whenever a shot pockets no colored ball. Run out of hearts and it's game over. Lives don't reset between levels.

| Difficulty | Lives |
|---|---|
| Normal | 5 |
| Hard | 3 |
| Insane | 1 |

If the cue (white) ball is accidentally pocketed it respawns after a brief moment. The **Rearrange Balls** button reshuffles the current level without counting as a shot.

### Controls

**Mouse / keyboard**

| Input | Action |
|---|---|
| Drag on canvas | Aim |
| Press and hold | Charge power |
| Release | Shoot |
| Scroll wheel | Zoom (Player POV only) |
| `C` / `V` | Switch camera (Overview or Player POV) |
| `L` | Toggle table lamps |
| `O` | Toggle ceiling light |
| `M` | Toggle music |
| `N` | Rearrange balls |
| `R` | Reset game |

**Touch**

| Gesture | Action |
|---|---|
| Tap and hold | Charge power |
| Drag | Aim |
| Lift | Shoot |
| Pinch | Zoom (Player POV only) |

All controls are also available as on-screen buttons.


---

## Libraries and external assets

| Asset | Description |
|---|---|
| [Three.js r128](https://threejs.org) | WebGL rendering engine - integrated in `libs/three.module.js` |
| [GLTFLoader](https://threejs.org/docs/#examples/en/loaders/GLTFLoader) | Three.js addon for loading GLB/glTF models - integrated in `libs/GLTFLoader.js` |
| PBR texture sets | Floor, wall, wood, wood020 - loaded from `textures/` |
| GLB scene assets | Lounge corner, coat rack, paintings, plant, door — authored in Blender, stored in `blender_assets/` |
| Audio | MP3 effects and background music track - stored in `sounds/` |

Three.js and GLTFLoader are the only code dependencies. Everything else is static assets; no package manager or build step is needed.

---
