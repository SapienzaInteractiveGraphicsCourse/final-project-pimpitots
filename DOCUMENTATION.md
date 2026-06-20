# 3D Pool Game — Complete Documentation

Single document in two macro-sections: **Game Presentation** (for the end user) and **Technical Report** (for developers). All content is derived exclusively from a direct reading of the code present in the `final-project-pimpitots` folder. Wherever a required aspect is not implemented in the code, this is stated explicitly.

---

## Table of Contents

- [SECTION 1 — Game Presentation](#section-1--game-presentation)
  - [1.1 How to launch the game](#11-how-to-launch-the-game)
  - [1.2 How to play](#12-how-to-play)
  - [1.3 Controls](#13-controls)
  - [1.4 Difficulty levels](#14-difficulty-levels)
  - [1.5 Win conditions and level progression](#15-win-conditions-and-level-progression)
  - [1.6 Lives system](#16-lives-system)
- [SECTION 2 — Technical Report](#section-2--technical-report)
  - [2.0 File overview and inter-script dependencies](#20-file-overview-and-inter-script-dependencies)
  - [2.1 index.html](#21-indexhtml)
  - [2.2 source/main.js](#22-sourcemainjs)
  - [2.3 source/physics.js](#23-sourcephysicsjs)
  - [2.4 source/controls.js](#24-sourcecontrolsjs)
  - [2.5 source/textures.js](#25-sourcetexturesjs)
  - [2.6 source/sounds.js](#26-sourcesoundsjs)
  - [2.7 source/models.js](#27-sourcemodelsjs)
  - [2.8 3D models loaded from files (glTF/GLB)](#28-3d-models-loaded-from-files-gltfglb)
  - [2.9 libs/ (third-party libraries)](#29-libs-third-party-libraries)
  - [2.10 Code-fidelity notes](#210-code-fidelity-notes)

---

# SECTION 1 — Game Presentation

This is a 3D pool (billiards) game played entirely in the browser. The scene depicts a pool table in a furnished night-time room, lit by a three-shade pendant lamp. The goal is to pocket every colored ball by striking them with the white cue ball.

## 1.1 How to launch the game

**Online version (GitHub Pages).** According to the `README.md`, the demo is published at:

> https://sapienzainteractivegraphicscourse.github.io/final-project-pimpitots/

Simply open this URL in a browser to play; nothing needs to be installed.

**Running locally.** The `README.md` states that the project is a static site with no build step. Three.js (r128) is vendored locally in the `libs/` folder, so no internet access is required. To run it locally you serve the repository root with any static file server, for example:

```
npx http-server .
```

then open the URL printed in the terminal. The README notes that opening `index.html` directly via `file://` does **not** work, because ES module imports require an HTTP origin.

No automated build/deploy scripts or configuration (e.g. a GitHub Actions workflow) are present in the repository: publishing to GitHub Pages happens by directly serving the static files from the repository root.

On startup a loading screen ("Loading scene…") appears; as soon as the scene is ready the difficulty-selection menu is shown, after which the match begins.

## 1.2 How to play

The mechanic is that of pool: strike the white cue ball to pocket the colored balls into the table's six pockets.

A shot is performed with a single **press-and-release** gesture on the table:

- **Aiming:** press and drag to rotate the cue stick around the cue ball and choose the shot direction. In the overhead view, the cue points toward the cursor position. The cue cannot pass through another ball: the aim automatically "glides" until it just grazes it.
- **Charging power:** press and hold still to charge the "Power" bar at the bottom. The longer you hold, the greater the power (up to a maximum after about 2.5 seconds). The bar shifts color from green to red and trembles while charging.
- **Shooting:** release to fire the ball with the accumulated power. The cue snaps forward and strikes the ball.

Note: if you drag (to aim), that gesture's charge is canceled, so a release after a drag does not fire a shot.

When you accidentally pocket the cue ball (a "scratch"), it automatically respawns on the table after a brief moment.

The interface shows: top-left, the current level, the balls remaining, and the lives; bottom-center, the power bar and buttons; bottom-right, the controls legend. The available buttons let you: rearrange the balls ("Rearrange Balls"), reset the game ("Reset Game"), switch view ("Player POV"/"Overview"), turn the table lamp on/off, turn the ceiling light on/off, and toggle the music.

## 1.3 Controls

The controls are summarized in the legend at the bottom-right of the screen. From the code (`index.html` and the handlers in `main.js`/`controls.js`):

| Control | Action |
|---|---|
| Drag | Aim the cue |
| Hold (press and hold) | Charge power |
| Release | Take the shot |
| Mouse wheel / scroll | Zoom (only in Player POV view) |
| `L` | Turn the table lamp on/off |
| `M` | Toggle music on/off |
| `C` or `V` | Switch view (Overview ↔ Player POV) |
| `R` | Reset the game (returns to the difficulty menu) |
| `N` | New ball arrangement |
| `O` | Turn the ceiling light on/off |

Note: the `O` key (ceiling light) is handled by the code but is **not** listed in the on-screen legend. The same commands for lights, music, camera, reset, and new arrangement are also available via the UI buttons.

The controls also work via **touch** (touchscreen): touch-and-hold to charge, drag to aim, release to shoot.

## 1.4 Difficulty levels

Before starting, a menu lets you choose the difficulty via a slider with a face icon that morphs (from smiling to "angry/demonic" with horns) as you raise the difficulty. The three difficulties defined in the code differ **solely in the number of lives** and in some audiovisual effects:

| Difficulty | Lives | Specific effects |
|---|---|---|
| **NORMAL** | 5 lives | Red heart (❤️); music at normal speed |
| **HARD** | 3 lives | Red heart (❤️); music at normal speed |
| **INSANE** | 1 life | Purple heart (💜); purple UI theme; music sped up to 1.4×; more dramatic life-loss animation (the heart "flies" to the center of the screen and explodes, with a screen tremble) |

While using the slider, the music playback rate ramps up progressively from 1.0× (up to "hard") to 1.4× (at "insane"). The number and arrangement of balls per level do **not** depend on the difficulty: they are the same across all difficulties.

## 1.5 Win conditions and level progression

The game is structured into **4 levels**. To clear a level you must **pocket every colored ball** on the table. The number of colored balls per level, per the code (`LEVELS_BALL_COUNT = [1, 2, 3, 4]`), is:

| Level | Colored balls to pocket |
|---|---|
| Level 1 | 1 |
| Level 2 | 2 |
| Level 3 | 3 |
| Level 4 | 4 |

When a level is cleared, a "Level Complete" screen appears with stars and a message; after about 3 seconds the next level starts automatically. After clearing **Level 4**, the final **"YOU WIN!"** screen appears with confetti and a "Play Again" button (which returns to the difficulty-selection menu). This is the win condition.

Fidelity note: the descriptive comment at the top of `main.js` states a different progression (1 / 3 / 6 / 10 balls), but the code actually executed uses the sequence 1 / 2 / 3 / 4. What the code does is authoritative.

## 1.6 Lives system

Lives represent the available attempts and are shown as hearts in the top-left HUD.

- **How many lives you have:** depends on the chosen difficulty — 5 (Normal), 3 (Hard), or 1 (Insane).
- **How you lose a life:** you lose **one life for every shot that fails to pocket at least one colored ball**. In practice, after the balls come to rest, if no colored ball was pocketed during that shot, one heart is removed (with a heart-break animation, red flash, and HUD shake). Accidentally pocketing only the cue ball does not count as a colored ball and therefore still costs a life.
- **What happens when they run out:** when lives reach zero, the **"GAME OVER"** screen appears ("You ran out of lives!"), the music stops, and you can restart with the "Try Again" button, which returns to the difficulty-selection menu.

The lives system does **not** reset level progress when a life is lost: you continue the same level as long as lives remain. Pressing "Reset" (or `R`) during a match returns to the difficulty menu and therefore restarts from Level 1.

---

# SECTION 2 — Technical Report

## 2.0 File overview and inter-script dependencies

The project is a WebGL application built on **Three.js r128** (vendored locally). The HTML entry point is `index.html`, which loads `source/main.js` as an ES module. All application scripts live in `source/`.

```
index.html
  └─ <script type="module" src="source/main.js">
        main.js  ── imports ──► models.js    (mesh/hierarchy construction + glTF/GLB loading)
                 ── imports ──► textures.js  (procedural texture generation + PBR texture loading)
                 ── imports ──► physics.js   (pure physics simulation, no Three.js)
                 ── imports ──► controls.js  (mouse/touch input: aim, charge, shoot)
                 ── imports ──► sounds.js    (audio management: music and effects)

        models.js ── imports ──► physics.js  (constants TABLE_W, TABLE_H, BALL_RADIUS, POCKET_POSITIONS)
                  ── imports ──► three/addons/loaders/GLTFLoader.js
```

Concise dependency map (who imports what):

| Script | Imports from | Imported by |
|---|---|---|
| `main.js` | `models.js`, `textures.js`, `physics.js`, `controls.js`, `sounds.js`, `three` | (entry point, none) |
| `models.js` | `three`, `GLTFLoader`, `physics.js` | `main.js` |
| `physics.js` | (none) | `main.js`, `models.js` |
| `controls.js` | (none) | `main.js` |
| `textures.js` | `three` | `main.js` |
| `sounds.js` | (none) | `main.js` |

`physics.js` and `controls.js` are deliberately decoupled from Three.js: they operate on plain data objects (the ball state and the input state) that `main.js` reads every frame.

The `importmap` in `index.html` resolves `three` to `./libs/three.module.js` and `three/addons/loaders/GLTFLoader.js` to `./libs/GLTFLoader.js`.

---

## 2.1 index.html

Entry page. It contains the full-viewport `<canvas id="glCanvas">`, the Three.js module `importmap`, all of the UI's CSS (HUD, overlays, power bar, buttons, legend, life-loss animations), and the static UI elements. It loads `source/main.js` as an ES module.

Logical sub-sections of the file:

- **Importmap:** maps `three` → `./libs/three.module.js` and the `GLTFLoader` → `./libs/GLTFLoader.js`.
- **Styles / CSS animations:** keyframes for overlays (`bounceIn`, `spinBall`, `floatTrophy`, `pulseGlow`, `starPop`, `confettiFall`), for life loss (`heartLose`, `hudShake`, `screenTremble`, `lifeFlash`, `heartFragment`, `heartFlyAndExplode`, `heartPulse`), and for the power-bar tremble (`tremble`). Dedicated overrides for the "insane" theme (`body.difficulty-insane …`).
- **Static DOM elements:** `#glCanvas`, `#loading-overlay`, `#hud` (with `#hud-level`, `#hud-balls`, `#hud-lives`), `#overlay`, `#bottom-ui` (with `#power-bar`/`#power-fill` and the button bar `#btn-newconfig`, `#btn-reset`, `#btn-cam`, `#btn-lamp`, `#btn-ceiling`, `#btn-music`), `#legend`.

A comment in the CSS specifies that the loading overlay is dismissed exclusively by `main.js` (not by a CSS timer), once resource loading is confirmed and a frame has been rendered.

---

## 2.2 source/main.js

This is the main script: engine bootstrap (renderer, scene, cameras), render loop, game loop, state machine, level management, lives, difficulty, HUD, and overlays.

### Initialization order (`init`)

`init()` is registered on `DOMContentLoaded` and executes, in this exact order:

1. **Loading manager:** registers `THREE.DefaultLoadingManager.onLoad`/`onError` to track the loading of all textures/models; sets a 15 s safety-net timeout that force-closes the loading overlay.
2. **Audio:** `initSounds()`.
3. **Renderer:** creates the `THREE.WebGLRenderer` (antialias, `PCFSoftShadowMap` shadows, `sRGBEncoding`, `ACESFilmic` tone mapping, exposure 0.75, night-sky clear color) and performs an initial `clear()`.
4. **Scene:** creates the `Scene`, sets a procedural night-sky background (`_buildNightSkyBackground`) and fog (`Fog`).
5. **Cameras:** `camera0` (Overview, 52° FOV) and `camera1` (Player POV, 58° FOV); `activeCamera = camera0`.
6. **Lights:** `HemisphereLight`, `AmbientLight`, `DirectionalLight` (intensity 0).
7. **Textures:** `texMap = generateTextures()`.
8. **Scene geometry:** in order — `createRoom`, `createTable`, `createLamp`, `createLoungeCorner`, `createDartboard`, `createCabinet`, `createStools`, `createPainting`, `createFrame2`, `createPlant`, `createPlant2`, `createCoatRack`, `createPainting3`, `createPlant2Corner`, `createFloorLamp`, `createCeilingLight`. The ceiling light is initialized off (intensity 0, fixture hidden).
9. **Cue stick:** `createCueStick`.
10. **Controls:** `new Controls(canvas)`.
11. **Environment map:** `_buildEnvMap()` (PMREM) and `scene.environment`.
12. **Clock:** `new THREE.Clock()`.
13. **HUD/UI:** `_buildHUD()`, `_bindUIButtons()`.
14. **Events:** `resize`, `keydown`, `wheel`.
15. **Level start:** `_startLevel(0)`.
16. **Render loop:** `animate()`; a subsequent `requestAnimationFrame` sets `_framePainted = true` and attempts to dismiss the loading overlay.

The loading overlay is dismissed by `_dismissLoader()` when both `_resourcesReady` (onLoad fired) and `_framePainted` (one frame rendered) are true; on dismissal it shows the difficulty menu (`_showDifficultyMenu`).

### Runtime-managed elements (`animate` loop), in order

Each frame `animate()` performs: (1) delta-time computation (capped at `DT_CAP`); (2) **input** (`controls.update()`, `consumeShot()` → possible `_fireShot`); (3) **physics** (only in the ROLLING/STRIKING states: adaptive sub-stepping of 1 or 3 steps via `stepPhysics`, handling of pocketed balls, cue-ball respawn, counter decrement, level-complete check, and when the table is at rest `snapToRest` + possible `_loseLife`); (4) **synchronization** of the ball meshes with the physics state plus rolling-rotation computation; (5) **cue** (`_updateCue`); (6) **lamp** (swing, `_updateLamp`); (7) **camera** (Player POV update if active); (8) **render** + power-bar update.

### State machine (`gameState`)

The `STATE` object defines three states:

| State | Meaning | What happens |
|---|---|---|
| `WAITING` | Waiting for the shot | The cue follows the cursor/aim, the charge bar is live, a shot may fire. Controls are enabled. |
| `STRIKING` | Strike in progress | The cue snaps forward through its short animation (`STRIKE_FORWARD_TIME`); when the tip reaches the ball surface the cue-ball velocity is applied and the impact sound plays; controls are disabled. |
| `ROLLING` | Balls in motion | Physics is integrated every frame, the cue is hidden; once all balls "look stopped" it returns to `WAITING`. |

Transitions:

- `WAITING → STRIKING`: in `animate`, when `consumeShot()` returns a shot (`_fireShot` sets `gameState = STRIKING`, disables controls, records the pending angle/power).
- `STRIKING → ROLLING`: in `_updateCue`, when `strikeTimer ≥ STRIKE_SHOW_TIME` (hides the cue).
- `ROLLING → WAITING`: in `animate`, when `isReadyForNextShot(balls)` is true and the cue ball is not pocketed (`snapToRest`, re-enables controls, re-shows the cue; if no colored ball was pocketed that shot it calls `_loseLife`).
- Early `ROLLING/STRIKING → WAITING`: when the last colored ball is pocketed (`ballsRemaining ≤ 0`), it sets `WAITING` and schedules `_onLevelComplete`.

Additional states not represented in `gameState` but handled via flags: `gameWon`, `gameOver`, `difficultyChosen` (they control the win overlay, game over, and the difficulty menu).

### Main functions of main.js

| Name | Description (brief) |
|---|---|
| `init` | Full bootstrap: renderer, scene, cameras, lights, geometry, controls, HUD, events, loop start. |
| `_maybeDismissLoader` / `_dismissLoader` | Dismiss the loading overlay once resources and the first frame are ready; idempotent. |
| `_buildNightSkyBackground` | Generates, via canvas, the equirectangular night-sky texture (stars, moon, halo) used as the background. |
| `_buildEnvMap` | Creates a PMREM environment map from a canvas gradient for the balls' specular reflections. |
| `_onResize` | Updates the cameras' aspect ratio and the renderer size on window resize. |
| `_onKeyDown` | Maps the keys L/O/C/V/R/N/M to their actions (lights, camera, reset, new config, music). |
| `_onWheel` | Zooms the Player POV camera by varying `camDistBehind` (clamped 1.5–6.0). |
| `_startLevel` | Starts/restarts a level: removes the old balls, spawns new ones, resets the cue and state → WAITING. |
| `_spawnBall` | Creates a ball mesh (color/number) and registers its physics state in the `balls` array. |
| `_newConfiguration` | Re-arranges the current level's balls ("Rearrange" button / N key), if the state allows. |
| `_resetGame` | Cancels pending transitions and returns to the difficulty menu ("Reset" button / R key). |
| `_respawnCueBall` | Repositions the cue ball after a "scratch" (accidental pocketing). |
| `_fireShot` | Starts the strike: records the pending angle and power and switches to the STRIKING state. |
| `_wrapPi` | Wraps an angle to the (−π, π] range. |
| `_resolveAimAngle` | Computes a collision-free aim angle, making the cue "glide" around the other balls. |
| `_updateCue` | Updates the cue's position/rotation per state; in STRIKING applies the velocity to the cue ball on contact. |
| `_updateBallRotation` | Applies rolling rotation to a ball's mesh based on its velocity. |
| `_updateLamp` | Swings the pendant lamp (sinusoidal rotation of the anchor). |
| `_toggleMusic` / `_toggleLamp` / `_toggleCeiling` | Toggle music, the table lamp, and the ceiling light respectively, updating the HUD. |
| `_switchCamera` | Alternates between the Overview and Player POV cameras; shows/hides the ceiling fixture accordingly. |
| `_updatePlayerCamera` | Positions the Player POV camera behind the cue ball, based on the cue's angle. |
| `animate` | Main render loop: timing, input, physics, mesh sync, cue, lamp, camera, render. |
| `_onLevelComplete` | Decides whether to show the level-complete screen (and advance) or the final win screen. |
| `_showLevelComplete` | Shows the "Level Complete" overlay with stars and a quip; plays the success sound. |
| `_showWinScreen` | Shows the final "YOU WIN!" overlay with confetti and a "Play Again" button. |
| `_buildHUD` | Caches the HUD's DOM references and creates the life-loss flash element. |
| `_bindUIButtons` | Binds the UI buttons to their actions and the click sound. |
| `_updateHUD` | Updates the level text, balls remaining, button labels, and the lives hearts. |
| `_updatePowerBar` | Updates the power bar's width/color/glow based on the charge. |
| `_showDifficultyMenu` | Builds and shows the difficulty-selection menu with the slider and animated SVG face. |
| `_selectDifficulty` | Applies the chosen difficulty (lives, theme, music rate) and starts Level 1. |
| `_loseLife` | Handles losing a life with animations (different for "insane") and the eventual game over. |
| `_spawnHeartFragments` | Spawns the animated fragments (💔/💜/✨) when the heart explodes. |
| `_showGameOver` | Shows the "GAME OVER" overlay, stops the music, and offers "Try Again". |

### Notable constants

`LEVELS_BALL_COUNT = [1,2,3,4]` (balls per level), `NUM_LEVELS = 4`, lamp swing parameters, POV camera distance/height, strike timings, `BALL_COLORS` (palette with the cue ball + 8 solid colors; the 9–15 entries for the striped balls are present but **commented out**, hence inactive).

---

## 2.3 source/physics.js

Pure-JavaScript physics simulation, with **no Three.js dependency**. It operates on ball-state objects `{ id, isCueBall, x, z, vx, vz, pocketed, mesh }` in the XZ plane.

Logical sub-sections:

- **Tunable constants:** table dimensions (`TABLE_W = 9.0`, `TABLE_H = 4.5`), `BALL_RADIUS = 0.18`, `POCKET_RADIUS = 0.32`, friction (`FRICTION_60FPS`), cushion/ball restitution, the minimum-speed and "ready for next shot" thresholds.
- **Game geometry:** the cushions' inner edges, the positions of the 6 pockets (`POCKET_POSITIONS`: 4 corners + 2 sides), the exclusion zones around the pockets.
- **Pocket / cushion / ball-ball collision detection.**
- **Main step and state utilities.**

| Name | Description (brief) |
|---|---|
| `_isInPocket` | Tells whether a ball center is inside a pocket's capture zone (direct capture or "throat" capture). |
| `_nearPocketOpening` | Tells whether a ball is close enough to a pocket to suppress the cushion bounce. |
| `_resolveCushion` | Reflects velocity off the rectangular boundaries and clamps the ball's position; skips the check near pockets. |
| `_resolveBallBall` | Resolves the elastic collision between two equal-mass balls (overlap correction + impulse). |
| `stepPhysics` | Advances the simulation by one dt: integrates positions, applies friction, resolves collisions, detects pocketing; returns the newly pocketed balls. |
| `isAllStopped` | True once every non-pocketed ball has exactly zero velocity. |
| `isReadyForNextShot` | True once every ball is below the perceptual "looks stopped" floor (looser than `isAllStopped`). |
| `snapToRest` | Zeroes vx/vz on every non-pocketed ball (called when leaving ROLLING). |
| `randomizeBalls` | Generates valid, non-overlapping start positions (index 0 = cue ball on the player side; the rest = colored). |

`stepPhysics` takes optional callbacks (`onBallBall`, `onCushion`) used by `main.js` to play impact sounds based on velocity. Ball-ball collision is O(n²), which is adequate for the small number of balls.

---

## 2.4 source/controls.js

Mouse/touch input management for aiming, charging, and shooting. No Three.js dependency: it exposes public state that `main.js` reads every frame.

Gesture model (one press-and-release on the canvas): holding still charges power (release = shot); dragging past a tolerance switches the gesture into "aim" and cancels the charge.

Public state exposed by the `Controls` class: `aimAngle`, `mouseX`/`mouseY`, `chargeAmount` (0–1), `pullback`, `enabled`, and the getters `isCharging`/`isAiming`.

| Name | Description (brief) |
|---|---|
| `constructor` | Initializes the public and internal state and binds the listeners to the canvas. |
| `_bindEvents` | Registers the mouse (down/move/up/leave) and touch (start/move/end) listeners and disables the context menu. |
| `_onMouseDown` | Begins a press: starts charging and records the start point of the possible drag. |
| `_onMouseMove` | Updates the cursor position; past the drag tolerance it switches into aim mode and rotates `aimAngle`. |
| `_onMouseUp` | Ends the press: if it was still charging it computes power from the hold duration and queues the shot. |
| `_onMouseLeave` | Aborts the current press without firing (the cursor leaves the canvas). |
| `_onTouchStart` / `_onTouchMove` / `_onTouchEnd` | Touch versions of the mouse handlers, with `preventDefault`. |
| `update` | Recomputes `chargeAmount` and `pullback` from the press duration (called every frame). |
| `consumeShot` | Returns the pending shot and clears it, so each shot is consumed exactly once. |

Constants: `AIM_SENSITIVITY`, `MAX_CHARGE_TIME = 2.5 s`, `MAX_POWER = 14.0`, `MIN_POWER = 0.5`, `MAX_PULLBACK = 1.4`, the mouse/touch drag tolerances. Shot power is `MIN_POWER + (charge fraction) × (MAX_POWER − MIN_POWER)`.

---

## 2.5 source/textures.js

Procedural (canvas) texture generation and loading of PBR texture sets from files. No geometry or scene code.

Sub-sections / surfaces handled:

- **Felt (table surface) — procedural:** color (green baize with fiber noise), normal map (high-frequency, Sobel-like height field), roughness map.
- **Wood (rails/legs) — PBR files:** `textures/wood/color.jpg`, `normal.jpg`, `roughness.jpg` (repeat 6×1).
- **Leg (table legs) — PBR files:** loads `textures/wood/color.jpg` and `roughness.jpg` separately with a 1×2 repeat.
- **Floor — PBR files:** `textures/floor/color.jpg`, `normal.jpg`, `roughness.jpg`, `ao.jpg` (repeat 10×8).
- **Wall — PBR files:** `textures/wall/color.jpg`, `normalgl.jpg`, `roughness.jpg` (repeat 4×2).
- **Wood020 (window frame + skirting boards) — PBR files:** `textures/wood020/color.jpg`, `normal.jpg`, `roughness.jpg` (repeat 3×1).
- **Ball — procedural:** a per-ball texture factory + one shared roughness map.

| Name | Description (brief) |
|---|---|
| `generateTextures` | Creates/loads every texture and returns the `texMap` object with the felt, wood, leg, wood020, floor, wall, ball entries and the `createBallTex` factory. |
| `_createFeltColorTexture` | Generates the felt color texture (green base + fiber speckling + fine weave grain). |
| `_createFeltNormalMap` | Generates the felt normal map from a high-frequency height field. |
| `_createFeltRoughnessMap` | Generates a mostly-rough felt roughness map with slight variation. |
| `_createBallTexture` | Generates a ball's texture: base color, optional white band (balls 9–15), and a number label (cue ball excluded). |
| `_createBallRoughnessMap` | Generates the shared ball roughness map (glossy resin with rare "scuff" specks). |

Note: the band for the striped balls (numbers 9–15) is implemented in `_createBallTexture`, but the game only uses balls 0–4 (see `BALL_COLORS` and `LEVELS_BALL_COUNT`), so that branch is never triggered during play.

---

## 2.6 source/sounds.js

Audio management: one background music track (an `Audio` element) and the sound effects played through the Web Audio API (`AudioContext` + decoded buffers). The file paths are resolved relative to the module (`../sounds/`).

Effects loaded: `hitEffect.mp3`, `ballHit.mp3`, `ballWall.mp3`, `ballDrop.mp3`, `success.mp3`, `fail.mp3`, `win.mp3`, `error.mp3`, `heartBroken.mp3`, `click.mp3`; music: `background.mp3` (looped, volume 0.15).

| Name | Description (brief) |
|---|---|
| `initSounds` | Initializes the music and the `AudioContext`, sets up audio "unlocking" on the first user gesture, and loads all buffers. |
| `_loadBuffer` | Fetches and decodes an audio file into an AudioBuffer (returns null on error). |
| `startBgMusic` / `stopBgMusic` | Start/stop the background music (with resume on user gesture if blocked). |
| `setMusicRate` | Sets the music playback rate. |
| `setMusicDifficulty` | Sets the music rate based on difficulty (1.4× for "insane", otherwise 1.0×). |
| `_playBuffer` | Plays a buffer with gain proportional to the passed speed, waiting for the context to be running. |
| `playBallHitSound` / `playBallWallSound` / `playBallDropSound` | Effects for ball-ball collision, ball-cushion, and pocketing. |
| `playErrorSound` / `playSuccessSound` / `playFailSound` / `playWinSound` / `playHeartBrokenSound` / `playClickSound` | Effects for error, level cleared, game over, win, heart break, and button clicks. |
| `playHitSound` | The cue-strike effect, with gain proportional to the shot power. |

---

## 2.7 source/models.js

Construction of Three.js meshes, hierarchies, and materials, plus the loading of the glTF/GLB models. No game logic. It imports from `physics.js` the constants `TABLE_W`, `TABLE_H`, `BALL_RADIUS`, `POCKET_POSITIONS`. Y-up coordinate system: floor at Y=0, table surface at `TABLE_SURFACE_Y = 0.76`.

Exported constants: `TABLE_SURFACE_Y`, `BALL_Y` (resting ball center), `CUE_REACH` (cue length, used by `main.js` for the aim collision), `CUE_CLEAR_R` (the cue's effective half-thickness).

| Name (export) | Description (brief) |
|---|---|
| `createRoom` | Builds the closed room: floor, ceiling, 4 walls (box rendered from the inside), skirting boards, a window with hole/glass/frame/moonlight, and loads the door (`door.glb`). |
| `createTable` | Builds the table: felt, wooden body, rails/cushions, 6 pockets, 4 turned-wood legs (LatheGeometry). |
| `_buildRails` | Builds the four rail/cushion segments, leaving gaps for the pockets. |
| `_buildPockets` | Builds, for each pocket, the dark disc, the tapered open cylinder, and the bottom cap. |
| `createCueStick` | Creates the cue stick as a parent-child hierarchy (root → group → tip/shaft/grip). |
| `createBallMesh` | Creates a ball mesh with `MeshPhysicalMaterial` (glossy clearcoat) and a per-ball texture. |
| `createLamp` | Creates the pendant lamp: a horizontal bar on two chains with three shades, emissive bulbs, and shadow-casting SpotLights. |
| `_createChainLinks` | Builds a vertical chain as a stack of alternating links (torus rings). |
| `createFloorLamp` | Creates a floor lamp in the lounge corner (base, pole, conical shade, bulb, warm PointLight). |
| `createCeilingLight` | Creates the toggleable ceiling fixture (emissive lens + ring + shadow-casting PointLight). |
| `createLoungeCorner` | Loads `lounge_corner.glb` (couch + coffee table) in the back-left corner. |
| `createPainting` | Loads `painting1.glb` (framed painting) on the front wall, above the couch. |
| `createDartboard` | Loads the dartboard (`dartboard_1k.gltf`) on the back wall. |
| `createCabinet` | Loads the vintage cabinet (`vintage_cabinet_01_1k.gltf`) against the front wall. |
| `createStools` | Loads the metal stool (`metal_stool_01_1k.gltf`) and arranges 4 clones along the back wall. |
| `createFrame2` | Loads the fancy picture frame (`fancy_picture_frame_01_1k.gltf`) on the back wall. |
| `createPlant` | Loads `potted_plant_01_1k.gltf` on the floor against the front wall. |
| `createPlant2` | Loads `potted_plant_02_1k.gltf` on the floor against the front wall, to the right of the cabinet. |
| `createCoatRack` | Loads `coat_rack.glb` and fixes 2 side-by-side clones on the back wall. |
| `createPainting3` | Loads `painting4.glb` (see note below) on the right wall, beside the door. |
| `createPlant2Corner` | Loads `potted_plant_02_1k.gltf` in the back-right corner. |

Fidelity note: the `createPainting3` function loads the file `./blender_assets/painting4.glb` (not `painting3.glb`). The file `painting3.glb` is present in the folder but is **not loaded by any function** of the project.

### Hierarchies built procedurally in models.js

**Cue stick (`createCueStick`)** — parent-child hierarchy:

```
cueRoot (Object3D, pivot at the cue-ball center; Y rotation = aim)
└─ cueGroup (Object3D, local X translation for pullback/strike)
   ├─ tipMesh   (cylinder, reddish-brown leather tip 0xcc4400)
   ├─ shaftMesh (tapered cylinder, blonde wood 0xf5e8c0)
   └─ gripMesh  (tapered cylinder, dark mahogany 0x3b1a0a)
```

All sections extend along the local +X axis; there are no keyframe animations (the cue's "snap" is animated procedurally in `main.js`, not with animation clips).

**Pendant lamp (`createLamp`)** — hierarchy (everything a child of the `anchor`, which rotates to swing):

```
anchor (Group, pivot at the ceiling)
├─ 2 × mount (cylinder, brass)           — on the rotation axis
├─ 2 × chain (Group of 8 alternating torus links)
├─ bar (horizontal cylinder, brass)
├─ 2 × finial (decorative sphere at the ends)
└─ for each of the 3 shades (x = −, 0, +):
   ├─ socket (cylinder)
   ├─ shade  (outer green hemisphere)
   ├─ liner  (inner emissive white hemisphere)
   ├─ trim   (gold torus ring)
   ├─ bulb   (emissive sphere)
   ├─ SpotLight (downward cone, shadow-casting)
   └─ target (Object3D, the SpotLight's target)
```

Lamp materials: `goldMat` (brass), `shadeOuterMat` (baize green), `shadeInnerMat` (emissive white), `bulbMat` (emissive amber). `createLamp` returns `{ anchor, bulbMeshes, linerMeshes, lights }`, used by the lamp toggle in `main.js`.

**Table (`createTable`)**: felt (`PlaneGeometry`), body (`BoxGeometry`), rails (4 boxes via `_buildRails`), pockets (disc + cylinder + cap via `_buildPockets`), 4 legs (`LatheGeometry` from a turned profile). Materials from `texMap`: felt, wood (body/rails), leg (legs).

**Room (`createRoom`)**: room box with inward-facing faces, a separate floor (`PlaneGeometry` with `uv2` for AO), skirting boards, a window rebuilt with 4 holed panels + 4 "reveal" faces + glass (`MeshPhysicalMaterial`) + wooden frame, a `PointLight` of moonlight; it also loads the door from `door.glb`.

**Balls (`createBallMesh`)**: `SphereGeometry(BALL_RADIUS, 32, 32)` with `MeshPhysicalMaterial` (roughness 0.15, clearcoat 1.0, envMap). The color/number texture is generated per-instance by `createBallTex`.

---

## 2.8 3D models loaded from files (glTF/GLB)

For each loaded model, the following are reported **exactly as present in the files**: the node/mesh hierarchy, the materials, and the associated textures. **None of the models contain animations** (empty `animations` array in every file).

### door.glb — Door (in `createRoom`)
```
Door classic (empty node)
└─ dors6  → mesh Mesh.090
            ├─ material "vray Wod1.001"
            └─ material "vray HR1.002"
```
Textures (embedded images): `k_715_t_cherry_0000` (cherry wood). In `createRoom` the materials are brightened (color ×1.8, envMapIntensity 2.0, slight self-illumination from the map). No animation.

### lounge_corner.glb — Lounge corner (couch + coffee table) (in `createLoungeCorner`)
```
round_wooden_table_01 → mesh Cylinder        (mat round_wooden_table_01)
espaldar sofa         → mesh Plane.003        (mat Material)
sofa-base             → mesh Cube.007         (mat Material, Material.001, negro)
sofa-brazos           → mesh Plane.002        (mat Material)
sofa-cojin            → mesh Plane.001        (mat Material)
```
Coffee-table textures: `round_wooden_table_01_diff_1k`, `round_wooden_table_01_nor_gl`, `round_wooden_table_01_metal-…_rough` (embedded). No animation.

### painting1.glb — Framed painting (in `createPainting`)
```
Historical Painting in Wooden Frame (empty node)
└─ Bfx.Painting.img.001  → mesh Bfx.Painting.img.001 (mat "Black wood.002")
   ├─ Bfx.Painting.img.002 → mesh (mat "Bfx.Painting.img.001" — the painting image)
   └─ Bfx.Painting.img.003 → mesh (mat "Bfx.Mat.glass.001" — glass)
```
Textures: `Bfx.Painting.img.001` (painting image), `wood03_diffuse`, `wood03_normal_opengl`, `wood03_roughness` (frame). In `createPainting` the glass mesh (material "glass") is hidden and `polygonOffset` is applied to the image to avoid z-fighting. No animation.

### dartboard/dartboard_1k.gltf — Dartboard (in `createDartboard`)
```
dartboard → mesh Circle.002 (mat "dartboard")
```
Textures (separate files in `dartboard/textures/`): `dartboard_diff_1k.jpg`, `dartboard_nor_gl_1k.jpg`, `dartboard_arm_1k.jpg` (ARM = AO/Roughness/Metalness). No animation.

### cabinet/vintage_cabinet_01_1k.gltf — Vintage cabinet (in `createCabinet`)
```
vintage_cabinet_01_body    → mesh Plane.056 (mat vintage_cabinet_01_a, vintage_cabinet_01_b)
vintage_cabinet_01_door_01 → mesh Plane.001 (mat vintage_cabinet_01_a, vintage_cabinet_01_glass)
vintage_cabinet_01_door_02 → mesh Plane.004 (mat vintage_cabinet_01_a)
vintage_cabinet_01_door_03 → mesh Plane.002 (mat vintage_cabinet_01_a, vintage_cabinet_01_glass)
vintage_cabinet_01_door_04 → mesh Plane.003 (mat vintage_cabinet_01_a, vintage_cabinet_01_glass)
vintage_cabinet_01_door_05 → mesh Plane.005 (mat vintage_cabinet_01_a)
vintage_cabinet_01_door_06 → mesh Plane.006 (mat vintage_cabinet_01_a)
vintage_cabinet_01_door_07 → mesh Plane.007 (mat vintage_cabinet_01_a)
```
Materials: `vintage_cabinet_01_a`, `vintage_cabinet_01_b`, `vintage_cabinet_01_glass`. Textures (in `cabinet/textures/`): set "a" (`_a_diff_1k`, `_a_nor_gl_1k`, `_a_arm_1k`, `_a_rough_1k`) and set "b" (`_b_diff_1k`, `_b_nor_gl_1k`, `_b_rough_1k`). The nodes/doors are siblings (no internal parent-child hierarchy). No animation.

### stool/metal_stool_01_1k.gltf — Metal stool (in `createStools`, 4 clones)
```
metal_stool_01 → mesh Cylinder.010 (mat "metal_stool_01")
```
Textures (in `stool/textures/`): `metal_stool_01_diff_1k.jpg`, `_nor_gl_1k.jpg`, `_arm_1k.jpg`. In `createStools` the `envMapIntensity` is raised to 2.0. No animation.

### frame2/fancy_picture_frame_01_1k.gltf — Fancy picture frame (in `createFrame2`)
```
fancy_picture_frame_01        → mesh Plane.004 (mat fancy_picture_frame_01)
fancy_picture_frame_01_canvas → mesh Plane.005 (mat fancy_picture_frame_01_canvas)
```
Textures (in `frame2/textures/`): frame (`_diff_1k`, `_nor_gl_1k`, `_rough_1k`) and canvas (`_canvas_diff_1k`, `_canvas_nor_gl_1k`, `_canvas_rough_1k`). No animation.

### plant/potted_plant_01_1k.gltf — Potted plant 1 (in `createPlant`)
```
potted_plant_01_stem    → mesh potted_plant_01_base_low (mat potted_plant_01_pot)
potted_plant_01_pebbles → mesh Circle.008                (mat potted_plant_01_pot)
potted_plant_01_pot     → mesh Circle.002                (mat potted_plant_01_pot)
potted_plant_01_leaves  → mesh Plane.070                 (mat potted_plant_01_leaves)
```
Textures (in `plant/textures/`): pot (`_pot_diff_1k`, `_pot_nor_gl_1k`, `_pot_rough_1k`) and leaves (`_leaves_diff_1k`, `_leaves_nor_gl_1k`, `_leaves_rough_1k`). No animation.

### plant2/potted_plant_02_1k.gltf — Potted plant 2 (in `createPlant2` and `createPlant2Corner`)
```
potted_plant_02_pot    → mesh Circle      (mat potted_plant_02_pot)
potted_plant_02_leaves → mesh Circle.001  (mat potted_plant_02_leaves)
potted_plant_02_dirt   → mesh low.008     (mat potted_plant_02_pot)
```
Textures (in `plant2/textures/`): pot (`_pot_diff_1k`, `_pot_nor_gl_1k`, `_pot_rough_1k`) and leaves (`_leaves_diff_1k`, `_leaves_nor_gl_1k`, `_leaves_rough_1k`). The same file is used for two distinct placements. No animation.

### coat_rack.glb — Coat rack (in `createCoatRack`, 2 clones)
```
Coat rack (empty node)
├─ Bolt 014.003   → mesh Bolt 014    (mat Material.003)
├─ Cube           → mesh Cube.001    (mat Material.002)
└─ Cylinder.003   → mesh Cylinder.002 (mat Material.001)
```
Embedded textures: `vrb32f3`, `vrb32f3000`. No animation.

### painting4.glb — "Mona Lisa" painting (loaded by `createPainting3`)
```
Mona Lisa (empty node)
├─ Backing  → mesh Cube.001  (mat Plywood_Backing_Material)
├─ Frame    → mesh Cube.002  (mat Wood_Material)
├─ Glass    → mesh Plane.001 (mat Glass_Material)
└─ Painting → mesh Plane     (mat Mona_Lisa)
```
Textures: backing `Chipboard006_4K-JPG_Color/_NormalGL/_Roughness`; frame `Wood026_4K-JPG_Color/_NormalGL/_Roughness`; image `370775_poster`. In `createPainting3` the "Glass" mesh is hidden, the "Painting" is enlarged (×1.09) with `polygonOffset`, and the backing is replaced with an enlarged black material. No animation.

### painting3.glb — (PRESENT BUT UNUSED)
The file exists in `blender_assets/` with hierarchy `Fancy Picture Frame 01 → { fancy_picture_frame_01 (Plane.062), fancy_picture_frame_01_canvas (Plane.063) }` and 8k textures of the `fancy_picture_frame_01` family, but it is **not referenced by any function** of the code and is therefore not loaded into the scene.

---

## 2.9 libs/ (third-party libraries)

The `libs/` folder contains the third-party dependencies vendored locally, which are **not written as part of the project**:

- `three.module.js` — the Three.js library (r128), the WebGL rendering engine used by all scripts.
- `GLTFLoader.js` — Three.js's official glTF/GLB loader, used in `models.js` to import the `.glb`/`.gltf` models.

These files are not documented function by function because they are external code; their use within the project is described in the previous sections (importmap in `index.html`, imports in `main.js`/`models.js`).

---

## 2.10 Code-fidelity notes

Points where this documentation follows the **executed code** rather than any misleading comments or names:

- **Balls per level:** the code uses `LEVELS_BALL_COUNT = [1, 2, 3, 4]`. The opening comment of `main.js` instead cites "1 / 3 / 6 / 10" balls: that progression does **not** match the code and is not what runs.
- **`createPainting3` loads `painting4.glb`**, not `painting3.glb`. The `painting3.glb` file is present but unused.
- **Striped balls (9–15):** the `BALL_COLORS` palette has the 9–15 entries commented out, and the white-band logic in `textures.js` is never triggered during play (only balls 0–4 are used).
- **The `O` key** (ceiling light): handled in the code but absent from the on-screen legend.
- **3D model animations:** none of the glTF/GLB files contain animation clips. The scene's only animated motion is procedural (the lamp swing in `_updateLamp`, the cue snap in `_updateCue`, the balls' rolling rotation in `_updateBallRotation`), and the UI effects are CSS animations in `index.html`.
