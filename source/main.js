/**
 * main.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsibility: engine bootstrap — renderer, scene, cameras, cue/physics
 * gameplay loop, level progression, and HUD.
 *
 * Execution flow:
 *   init() → generateTextures() → createRoom → createTable → createLamp →
 *     createCueStick → Controls(canvas) → _startLevel(0) → animate()
 *
 * Level progression:
 *   Level 1: 1 ball  |  Level 2: 3 balls  |  Level 3: 6 balls  |  Level 4: 10 balls
 *   Pocket all colored balls → level complete → after Level 4 → win screen.
 *
 * Gameplay state machine (gameState):
 *   WAITING  — cue follows the cursor, charge bar is live, a shot may fire
 *   STRIKING — cue snaps forward through its short strike animation
 *   ROLLING  — physics is stepping every frame; cue is hidden
 *
 * Camera views (toggle with C key or button):
 *   0 = Overview  — wide overhead shot of the whole table
 *   1 = Player POV — low angle behind the cue ball, updated every frame
 *
 * Loading overlay:
 *   renderer.compile() pre-links all shader programs so frame 0 has no stall.
 *   We count 2 actual renderer.render() calls; after the second the GPU has
 *   presented the first real frame and the overlay fades out.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import * as THREE from 'three';
import { createRoom, createTable, createLamp, createCueStick, createBallMesh, createLoungeCorner, createDartboard, createCabinet, createStools, createPainting, createFrame2, createPlant, createPlant2, createCoatRack, createPainting3, createPlant2Corner, createFloorLamp, createCeilingLight, CUE_REACH, CUE_CLEAR_R, TABLE_SURFACE_Y, BALL_Y } from './models.js';
import { generateTextures } from './textures.js';
import { randomizeBalls, stepPhysics, isReadyForNextShot, snapToRest, TABLE_H, BALL_RADIUS } from './physics.js';
import { Controls } from './controls.js';
import { initSounds, startBgMusic, stopBgMusic, setMusicRate, setMusicDifficulty, playHitSound, playBallHitSound, playBallWallSound, playBallDropSound, playErrorSound, playSuccessSound, playFailSound, playWinSound, playHeartBrokenSound, playClickSound } from './sounds.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const LEVELS_BALL_COUNT = [1, 2, 3, 4];  // colored balls per level (level N = index N-1)
const NUM_LEVELS        = LEVELS_BALL_COUNT.length; // 4

const LAMP_SWING_AMP   = 0.08;       // swing amplitude in radians
const LAMP_SWING_SPEED = 0.6;    // swing frequency (rad/s)

const CAM_DIST_BEHIND = 4.5;      // distance behind cue ball for player-POV camera
const CAM_HEIGHT_POV  = 1.6;      // camera height above table for player POV

const STRIKE_FORWARD_TIME = 0.08; // seconds for the cue to snap forward into the ball
const STRIKE_SHOW_TIME    = 0.25; // seconds the cue stays visible after the strike begins

// Aim easing rate (1/s) toward the collision-free target. Higher = snappier
// normal aiming; lower = smoother glide when gliding past a ball.
const AIM_SMOOTH_RATE = 30;

const DT_CAP = 0.05; // clamp on per-frame delta time

// Speed threshold below which a single physics step per frame is collision-safe
const SUBSTEP_SAFE_SPEED    = BALL_RADIUS / (2 * DT_CAP);
const SUBSTEP_SAFE_SPEED_SQ = SUBSTEP_SAFE_SPEED * SUBSTEP_SAFE_SPEED;

// ─── Ball Colors (index 0 = cue ball, 1–15 = standard pool palette) ──────────
const BALL_COLORS = [
  '#F5F5F5',  // 0  cue ball (white)
  '#F5C518',  // 1  yellow
  '#1565C0',  // 2  blue
  '#C62828',  // 3  red
  '#6A1EA0',  // 4  purple
  '#E65100',  // 5  orange
  '#2E7D32',  // 6  green
  '#6D1B1B',  // 7  maroon
  '#212121',  // 8  black (8-ball)
  // '#F5C518',  // 9  yellow stripe
  // '#1565C0',  // 10 blue stripe
  // '#C62828',  // 11 red stripe
  // '#6A1EA0',  // 12 purple stripe
  // '#E65100',  // 13 orange stripe
  // '#2E7D32',  // 14 green stripe
  // '#6D1B1B',  // 15 maroon stripe
];

// ─── Globals ──────────────────────────────────────────────────────────────────
let renderer, scene, clock, lamp, texMap;
let camera0, camera1, activeCamera;
let currentCameraIndex = 0;
let cue;
let lampOn    = true;
let ceiling;                         // { group, light, lensMesh, onIntensity }
let ceilingOn = false;               // starts off — only the table lamps are lit on load
let ballEnvMap;
let balls     = [];                  // [{ id, isCueBall, color, number, x, z, vx, vz, pocketed, mesh }]
let btnLampEl, btnCamEl, btnMusicEl, btnCeilingEl;
let musicOn = true;
let powerFillEl, powerBarWrapEl;
let controls;

// Mutable camera-distance for player-POV zoom (mouse wheel / touchpad scroll)
let camDistBehind = CAM_DIST_BEHIND;

const _ballScreenPos = new THREE.Vector3(); // scratch vector for cursor-targeted aiming

// ─── Gameplay State ───────────────────────────────────────────────────────────
const STATE = {
  WAITING:  'WAITING',
  STRIKING: 'STRIKING',
  ROLLING:  'ROLLING',
};
let gameState = STATE.WAITING;

let strikeTimer         = 0;
let strikeStartPullback = 0;
let strikeOriginX       = 0;
let strikeOriginZ       = 0;
let strikePendingPhi    = 0;    // cue aim angle captured at shot-fire
let strikePendingPower  = 0;    // shot power captured at shot-fire
let strikeHitApplied    = false; // true once cue-ball velocity has been applied this strike

// ─── Aim Collision State ──────────────────────────────────────────────────────
let _resolvedAim = 0;  // last frame's collision-filtered aim angle actually shown (eased)

// ─── Level State ──────────────────────────────────────────────────────────────
let currentLevel            = 0;     // 0-based index into LEVELS_BALL_COUNT
let ballsRemaining          = 0;     // colored balls still on table
let gameWon                 = false;
let _levelTransitionTimeout = null;  // handle so Reset can cancel a pending advance

// ─── Difficulty / Lives State ─────────────────────────────────────────────────
let difficulty               = 'normal';
let maxLives                 = 5;
let playerLives              = 5;
let gameOver                 = false;
let difficultyChosen         = false;
let _pocketedColoredThisShot = false;

// ─── HUD element refs (cached in _buildHUD) ───────────────────────────────────
let hudLevelEl, hudBallsEl, hudLivesEl, overlayEl, _lifeFlashEl;

// ─── Loading-overlay lifecycle state ─────────────────────────────────────────
// See _maybeDismissLoader() / _dismissLoader() below for how these gate the
// #loading-overlay dismissal.
let _resourcesReady  = false; // true once THREE.DefaultLoadingManager.onLoad has fired
let _framePainted    = false; // true once a frame has rendered after the render loop started
let _loaderDismissed = false; // guards against double-dismissal
let _loaderFallback  = null;  // setTimeout handle for the hard safety-net dismissal

// ─── Entry Point ──────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);

function init() {
  // ── Loading overlay: start tracking resource loads before any are kicked off ──
  // Every THREE.TextureLoader / THREE.GLTFLoader created below without an
  // explicit manager argument registers itself on this singleton, so onLoad
  // fires exactly once after every tracked item has finished or failed.
  THREE.DefaultLoadingManager.onLoad = function () {
    _resourcesReady = true;
    _maybeDismissLoader();
  };
  THREE.DefaultLoadingManager.onError = function (url) {
    console.error('[loading] failed to load resource:', url);
  };
  // Hard safety net: if onLoad somehow never fires, force the overlay closed
  // after 15s instead of hanging indefinitely.
  _loaderFallback = setTimeout(function () {
    console.warn('[loading] fallback timeout reached — dismissing loading overlay without confirmed resource completion');
    _resourcesReady = true;
    _framePainted   = true;
    _dismissLoader();
  }, 15000);

  // ── Sounds ──
  initSounds();

  // ── Renderer ──
  const canvas = document.getElementById('glCanvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled   = true;
  renderer.shadowMap.type      = THREE.PCFSoftShadowMap;
  renderer.outputEncoding      = THREE.sRGBEncoding;
  renderer.toneMapping         = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.75;
  // Pre-clear to night-sky colour so the loading overlay's backdrop-filter
  // blurs dark blue instead of WebGL's default black.
  renderer.setClearColor(0x080d20, 1);
  renderer.clear();

  // ── Scene ──
  scene = new THREE.Scene();
  // Instant procedural sky as placeholder; the HDR replaces it once decoded.
  scene.background = _buildNightSkyBackground();
  scene.fog = new THREE.Fog(0x080d20, 10, 35);


  // ── Cameras ──
  const aspect = window.innerWidth / window.innerHeight;

  camera0 = new THREE.PerspectiveCamera(52, aspect, 0.1, 100);
  camera0.position.set(0, 14, 5);
  camera0.lookAt(0, TABLE_SURFACE_Y, 0);

  camera1 = new THREE.PerspectiveCamera(58, aspect, 0.05, 100);

  activeCamera = camera0;

  // ── Lights ──
  // Dim hemisphere baseline (cool sky / warm floor) — just enough indirect-bounce
  // fill that the room is never pure black when the ceiling light is switched off.
  // General room brightness is carried by the toggleable ceiling light instead.
  const hemiLight = new THREE.HemisphereLight(0xb9c4e0, 0x3a2f28, 0.22);
  scene.add(hemiLight);

  // Low flat ambient keeps a touch of cool base under the hemisphere gradient.
  const ambientLight = new THREE.AmbientLight(0x404060, 0.10);
  scene.add(ambientLight);

  const fillLight = new THREE.DirectionalLight(0x8090ff, 0.0);
  fillLight.position.set(-8, 6, 4);
  scene.add(fillLight);

  // ── Textures ──
  texMap = generateTextures();

  // ── Scene geometry ──
  createRoom(scene, texMap);
  createTable(scene, texMap);
  lamp = createLamp(scene);
  createLoungeCorner(scene);
  createDartboard(scene);
  createCabinet(scene);
  createStools(scene);
  createPainting(scene);
  createFrame2(scene);
  createPlant(scene);
  createPlant2(scene);
  createCoatRack(scene);
  createPainting3(scene);
  createPlant2Corner(scene);
  createFloorLamp(scene);
  ceiling = createCeilingLight(scene);
  ceiling.fixture.visible = false; // game starts in overview — hide the fixture, keep its light
  // Start with the ceiling light off (only the table lamps lit on load).
  ceiling.light.intensity = 0;
  ceiling.lensMesh.material.emissiveIntensity = 0;

  // ── Cue stick ──
  cue = createCueStick(scene);

  // ── Controls ──
  controls = new Controls(canvas);

  // ── Environment map (IBL for ball specular) ──
  ballEnvMap = _buildEnvMap();
  scene.environment = ballEnvMap;

  // ── Clock ──
  clock = new THREE.Clock();

  // ── HUD & UI ──
  _buildHUD();
  _bindUIButtons();

  // ── Events ──
  window.addEventListener('resize', _onResize);
  window.addEventListener('keydown', _onKeyDown);
  canvas.addEventListener('wheel', _onWheel, { passive: false });

  // ── Start game at level 0 ──
  _startLevel(0);

  // ── Render loop ──
  animate();

  // One rAF after animate() starts confirms the GPU has actually painted a
  // frame. Combined with _resourcesReady (set by DefaultLoadingManager.onLoad
  // above), this is what _maybeDismissLoader() waits on before hiding the
  // overlay. The render loop keeps running, so by the time the last asset
  // finishes loading the very next frame will already show it — well within
  // the overlay's 0.6s fade-out.
  requestAnimationFrame(function () {
    _framePainted = true;
    _maybeDismissLoader();
  });
}

// ─── Loading Overlay ──────────────────────────────────────────────────────────

/**
 * Hides the loading overlay once both gating conditions are true:
 *   1. _resourcesReady — DefaultLoadingManager.onLoad has fired (every
 *      texture/model load initiated during init() has finished or failed).
 *   2. _framePainted   — at least one frame has rendered since the loop started.
 * Safe to call any number of times from any signal source.
 */
function _maybeDismissLoader() {
  if (_resourcesReady && _framePainted) _dismissLoader();
}

/**
 * Fades out and removes the loading overlay. Idempotent: clears the fallback
 * timer and unhooks DefaultLoadingManager callbacks so neither can fire again.
 */
function _dismissLoader() {
  if (_loaderDismissed) return;
  _loaderDismissed = true;

  clearTimeout(_loaderFallback);
  THREE.DefaultLoadingManager.onLoad  = undefined;
  THREE.DefaultLoadingManager.onError = undefined;

  var el = document.getElementById('loading-overlay');
  if (!el) return;
  el.classList.add('fade-out');
  setTimeout(function () {
    if (el.parentNode) el.parentNode.removeChild(el);
    _showDifficultyMenu();
  }, 700);
}

// ─── Resize ───────────────────────────────────────────────────────────────────
function _onResize() {
  const aspect = window.innerWidth / window.innerHeight;
  camera0.aspect = aspect; camera0.updateProjectionMatrix();
  camera1.aspect = aspect; camera1.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ─── Keyboard ─────────────────────────────────────────────────────────────────
function _onKeyDown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const k = e.key.toUpperCase();
  if (k === 'L') _toggleLamp();
  if (k === 'O') _toggleCeiling();
  if (k === 'C' || k === 'V') _switchCamera();
  if (k === 'R') _resetGame();
  if (k === 'N') _newConfiguration();
  if (k === 'M') _toggleMusic();
}

// ─── Level Management ─────────────────────────────────────────────────────────

/**
 * Starts (or restarts) a level: clears old balls, spawns new ones,
 * resets physics state, and transitions to WAITING.
 * @param {number} levelIndex - 0-based index
 */
function _startLevel(levelIndex) {
  // Cancel any pending advance (e.g. Reset pressed mid-transition)
  if (_levelTransitionTimeout !== null) {
    clearTimeout(_levelTransitionTimeout);
    _levelTransitionTimeout = null;
  }

  currentLevel             = levelIndex;
  gameState                = STATE.WAITING;
  _pocketedColoredThisShot = false;
  controls.enabled         = true;

  const numColored = LEVELS_BALL_COUNT[levelIndex];
  ballsRemaining   = numColored;

  // Remove old ball meshes
  for (const b of balls) scene.remove(b.mesh);
  balls = [];

  // Spawn cue ball + colored balls at random positions
  const positions = randomizeBalls(numColored);
  _spawnBall(0, 0, positions[0].x, positions[0].z, true);
  for (let i = 1; i <= numColored; i++) {
    _spawnBall(i, i, positions[i].x, positions[i].z, false);
  }

  // Reset cue to default position
  const cueBall = balls.find(b => b.isCueBall);
  if (cueBall) {
    cue.root.position.set(cueBall.mesh.position.x, BALL_Y, cueBall.mesh.position.z);
  }
  cue.root.visible = true;
  cue.group.position.set(0, 0, 0);

  _updateHUD();
}

function _spawnBall(id, number, x, z, isCueBall) {
  const color = BALL_COLORS[Math.min(number, BALL_COLORS.length - 1)];
  const mesh  = createBallMesh(color, number, texMap.createBallTex, ballEnvMap, texMap.ball.roughnessMap);
  mesh.position.set(x, BALL_Y, z);
  mesh.castShadow = true;
  scene.add(mesh);
  balls.push({ id, isCueBall, color, number, x, z, vx: 0, vz: 0, pocketed: false, mesh });
}

/**
 * Respawn the current level with a new random ball layout.
 * Called by the "New Configuration" button and N key.
 */
function _newConfiguration() {
  if (!difficultyChosen || gameOver || gameWon) return;
  if (gameState === STATE.ROLLING || gameState === STATE.STRIKING) return;
  _startLevel(currentLevel);
}

/**
 * Reset back to Level 1.
 * Called by the "Reset" button and R key.
 */
function _resetGame() {
  if (_levelTransitionTimeout !== null) {
    clearTimeout(_levelTransitionTimeout);
    _levelTransitionTimeout = null;
  }
  gameOver = false;
  gameWon  = false;
  _showDifficultyMenu();
}

// ─── Cue Ball Respawn (after scratch) ────────────────────────────────────────
function _respawnCueBall() {
  const cueBall = balls.find(b => b.isCueBall);
  if (!cueBall) return;
  cueBall.x        = 0;
  cueBall.z        = TABLE_H / 4;
  cueBall.vx       = 0;
  cueBall.vz       = 0;
  cueBall.pocketed = false;
  cueBall.mesh.visible = true;
  cueBall.mesh.position.set(cueBall.x, BALL_Y, cueBall.z);
}

// ─── Shot Firing ──────────────────────────────────────────────────────────────
function _fireShot(power) {
  const cueBall = balls.find(b => b.isCueBall && !b.pocketed);
  if (!cueBall) return;

  _pocketedColoredThisShot = false;

  // Defer velocity — applied inside _updateCue once the cue tip visually
  // crosses the ball surface, so the ball doesn't fly away before the
  // stick is seen to make contact.
  strikePendingPhi    = cue.root.rotation.y;
  strikePendingPower  = power;
  strikeHitApplied    = false;

  strikeStartPullback = cue.group.position.x;
  strikeOriginX       = cueBall.x;
  strikeOriginZ       = cueBall.z;
  strikeTimer         = 0;
  gameState           = STATE.STRIKING;
  controls.enabled    = false;
}

// ─── Cue Update ───────────────────────────────────────────────────────────────
// Wrap an angle to (−π, π].
function _wrapPi(a) {
  while (a >   Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Resolves the player's raw aim angle into one where the cue stick clears every
 * other ball. The stick points from the cue ball in world direction
 * (cos φ, −sin φ); a ball lying that way within CUE_REACH blocks a cone of
 * angles ±asin((BALL_RADIUS + CUE_CLEAR_R)/L) around its bearing.
 *
 * If the raw aim lands inside a cone, it snaps to the *nearer* edge: the cue
 * rides up to a ball and waits at its tangent (never penetrating), and only
 * once the raw aim sweeps past the ball's centre bearing does the target flip
 * to the far edge. The caller eases toward this target, so that flip reads as a
 * quick glide past the ball rather than a teleport. The returned angle is
 * always collision-free, so a resting aim can never sit inside a ball.
 *
 * @param {number} desired  raw aim angle this frame
 * @param {Object} cueBall  the active cue ball ({x, z})
 * @returns {number} a collision-free aim angle
 */
function _resolveAimAngle(desired, cueBall) {
  const cones = [];
  for (const b of balls) {
    if (b.pocketed || b.isCueBall) continue;
    const rx = b.x - cueBall.x;
    const rz = b.z - cueBall.z;
    const L  = Math.hypot(rx, rz);
    if (L < 1e-3 || L > CUE_REACH) continue;
    const s = (BALL_RADIUS + CUE_CLEAR_R) / L;
    if (s >= 1) continue; // ball effectively overlaps the cue ball — no valid cone
    cones.push({ center: Math.atan2(-rz, rx), delta: Math.asin(s) });
  }
  if (cones.length === 0) return desired;

  // Snap out of any cone to its nearer edge. Re-check after each push since the
  // new edge may land inside an adjacent cone.
  let result = desired;
  for (let iter = 0; iter <= cones.length; iter++) {
    let blocked = false;
    for (const c of cones) {
      const d = _wrapPi(result - c.center);
      if (Math.abs(d) < c.delta) {
        result  = c.center + (d >= 0 ? c.delta : -c.delta);
        blocked = true;
      }
    }
    if (!blocked) break;
  }
  return result;
}

function _updateCue(dt) {
  const cueBall = balls.find(b => b.isCueBall && !b.pocketed);
  if (gameState === STATE.ROLLING || !cueBall) {
    cue.root.visible = false;
    return;
  }

  if (gameState === STATE.STRIKING) {
    cue.root.position.set(strikeOriginX, BALL_Y, strikeOriginZ);
  } else {
    cue.root.position.set(cueBall.x, BALL_Y, cueBall.z);
  }

  if (gameState === STATE.WAITING) {
    cue.root.visible = true;

    // Cursor-targeted aiming in overview camera
    if (controls.isAiming && activeCamera === camera0) {
      _ballScreenPos.set(cueBall.x, BALL_Y, cueBall.z).project(camera0);
      const ballScreenX = (_ballScreenPos.x + 1) / 2 * window.innerWidth;
      const ballScreenY = (1 - _ballScreenPos.y) / 2 * window.innerHeight;
      const dx = controls.mouseX - ballScreenX;
      const dy = controls.mouseY - ballScreenY;
      if (Math.hypot(dx, dy) > 1e-4) {
        controls.aimAngle = Math.atan2(-dy, dx);
      }
    }

    // Keep the stick from piercing another ball: snap the aim out of any ball's
    // blocked cone (to its nearer edge), then ease toward that collision-free
    // target so gliding past a ball happens over a few frames, not a teleport.
    const targetAim = _resolveAimAngle(controls.aimAngle, cueBall);
    const tt = 1 - Math.exp(-AIM_SMOOTH_RATE * dt);
    _resolvedAim = _wrapPi(_resolvedAim + _wrapPi(targetAim - _resolvedAim) * tt);

    cue.root.rotation.y  = _resolvedAim;
    cue.group.position.x = controls.pullback;

  } else if (gameState === STATE.STRIKING) {
    strikeTimer += dt;
    const t = Math.min(strikeTimer / STRIKE_FORWARD_TIME, 1.0);
    // Drive the tip all the way to the ball centre for an unambiguous visual hit.
    // BALL_RADIUS = 0.18 → at targetX = -BALL_RADIUS the tip's near-face sits at
    // x = BALL_RADIUS + targetX = 0, i.e. the ball's centre.
    const targetX = -BALL_RADIUS;
    cue.group.position.x = strikeStartPullback + (targetX - strikeStartPullback) * t;

    // Apply cue-ball velocity the first frame the tip's near-face reaches the
    // ball surface: cueGroup.x ≤ 0  ⟺  tipFace ≤ BALL_RADIUS (ball surface).
    if (!strikeHitApplied && cue.group.position.x <= 0) {
      const hitBall = balls.find(b => b.isCueBall && !b.pocketed);
      if (hitBall) {
        hitBall.vx = -Math.cos(strikePendingPhi) * strikePendingPower;
        hitBall.vz =  Math.sin(strikePendingPhi) * strikePendingPower;
      }
      playHitSound(strikePendingPower, 14.0);
      strikeHitApplied = true;
    }

    if (strikeTimer >= STRIKE_SHOW_TIME) {
      cue.root.visible = false;
      gameState        = STATE.ROLLING;
    }
  }
}

// ─── Ball Rolling Rotation ────────────────────────────────────────────────────
const _deltaQ   = new THREE.Quaternion();
const _rollAxis = new THREE.Vector3();

function _updateBallRotation(ball, dt) {
  const speed = Math.sqrt(ball.vx * ball.vx + ball.vz * ball.vz);
  if (speed < 0.0001) return;
  _rollAxis.set(-ball.vz / speed, 0, ball.vx / speed);
  const angle = (speed * dt) / BALL_RADIUS;
  _deltaQ.setFromAxisAngle(_rollAxis, angle);
  ball.mesh.quaternion.premultiply(_deltaQ);
}

// ─── Lamp ─────────────────────────────────────────────────────────────────────
function _updateLamp(elapsedTime) {
  lamp.anchor.rotation.x = Math.sin(elapsedTime * LAMP_SWING_SPEED) * LAMP_SWING_AMP;
}

function _toggleMusic() {
  musicOn = !musicOn;
  if (musicOn) startBgMusic(); else stopBgMusic();
  _updateHUD();
}

function _toggleLamp() {
  lampOn = !lampOn;
  for (const light of lamp.lights) {
    light.intensity = lampOn ? light.userData.onIntensity : 0;
  }
  for (const bulbMesh of lamp.bulbMeshes) {
    bulbMesh.material.emissiveIntensity = lampOn ? 2.0 : 0;
  }
  for (const linerMesh of lamp.linerMeshes) {
    linerMesh.material.emissiveIntensity = lampOn ? 1.2 : 0;
  }
  _updateHUD();
}

function _toggleCeiling() {
  ceilingOn = !ceilingOn;
  ceiling.light.intensity = ceilingOn ? ceiling.onIntensity : 0;
  ceiling.lensMesh.material.emissiveIntensity = ceilingOn ? 1.2 : 0;
  _updateHUD();
}

// ─── Camera ───────────────────────────────────────────────────────────────────
function _switchCamera() {
  currentCameraIndex = (currentCameraIndex + 1) % 2;
  activeCamera = currentCameraIndex === 0 ? camera0 : camera1;
  // Hide the ceiling fixture in overview (the top-down camera looks through the
  // ceiling and would otherwise see the lit disc); its light stays on.
  ceiling.fixture.visible = activeCamera === camera1;
  _updateHUD();
}

function _updatePlayerCamera() {
  const cueBall = balls.find(b => b.isCueBall);
  if (!cueBall) return;

  const cx  = cueBall.mesh.position.x;
  const cz  = cueBall.mesh.position.z;
  const phi = cue.root.rotation.y;

  camera1.position.set(
    cx + Math.cos(phi) * camDistBehind,
    BALL_Y + CAM_HEIGHT_POV,
    cz - Math.sin(phi) * camDistBehind,
  );
  camera1.lookAt(cx, BALL_Y + 0.05, cz);
}

// ─── Player-POV Zoom ──────────────────────────────────────────────────────────
function _onWheel(e) {
  if (activeCamera !== camera1) return;
  e.preventDefault();
  const step = e.deltaMode === 0 ? e.deltaY * 0.005 : e.deltaY * 0.15;
  camDistBehind = Math.max(1.5, Math.min(6.0, camDistBehind + step));
}

// ─── Render Loop ──────────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);

  // ── 1. Frame timing ──
  const dt          = Math.min(clock.getDelta(), DT_CAP);
  const elapsedTime = clock.elapsedTime;

  // ── 2. Input ──
  controls.update();
  const shot = controls.consumeShot();
  if (shot && gameState === STATE.WAITING) _fireShot(shot.power);

  // ── 3. Physics ──
  if (gameState === STATE.ROLLING || gameState === STATE.STRIKING) {
    let maxSpeedSq = 0;
    for (const ball of balls) {
      if (ball.pocketed) continue;
      const speedSq = ball.vx * ball.vx + ball.vz * ball.vz;
      if (speedSq > maxSpeedSq) maxSpeedSq = speedSq;
    }

    const SUB_STEPS = maxSpeedSq < SUBSTEP_SAFE_SPEED_SQ ? 1 : 3;
    const subDt     = dt / SUB_STEPS;

    let newlyPocketed = [];
    for (let s = 0; s < SUB_STEPS; s++) {
      newlyPocketed = newlyPocketed.concat(stepPhysics(balls, subDt, playBallHitSound, playBallWallSound));
    }

    for (const b of newlyPocketed) {
      playBallDropSound();
      b.mesh.visible = false;
      if (b.isCueBall) {
        setTimeout(() => _respawnCueBall(), 800);
      } else {
        // Colored ball pocketed — decrement counter and check for level complete
        _pocketedColoredThisShot = true;
        ballsRemaining--;
        _updateHUD();
        if (ballsRemaining <= 0) {
          gameState        = STATE.WAITING;
          controls.enabled = false;
          setTimeout(_onLevelComplete, 700);
          return; // rAF already queued; skip rest of this frame
        }
      }
    }

    if (gameState === STATE.ROLLING && isReadyForNextShot(balls)) {
      const cueBall = balls.find(b => b.isCueBall);
      if (cueBall && !cueBall.pocketed) {
        snapToRest(balls);
        gameState        = STATE.WAITING;
        controls.enabled = true;
        cue.root.visible = true;
        cue.group.position.set(0, 0, 0);
        if (!_pocketedColoredThisShot) _loseLife();
      }
    }
  }

  // ── 4. Sync ball meshes to physics state ──
  for (const ball of balls) {
    if (ball.pocketed) continue;
    ball.mesh.position.set(ball.x, BALL_Y, ball.z);
    _updateBallRotation(ball, dt);
  }

  // ── 5. Cue ──
  _updateCue(dt);

  // ── 6. Lamp ──
  _updateLamp(elapsedTime);

  // ── 7. Camera ──
  if (activeCamera === camera1) _updatePlayerCamera();

  // ── 8. Render + UI ──
  renderer.render(scene, activeCamera);
  _updatePowerBar();
}

// ─── Level Completion ─────────────────────────────────────────────────────────
function _onLevelComplete() {
  gameState        = STATE.WAITING;
  controls.enabled = false;

  if (currentLevel + 1 >= NUM_LEVELS) {
    gameWon = true;
    _showWinScreen();
  } else {
    const nextLevel = currentLevel + 1;
    _showLevelComplete(nextLevel);
    _levelTransitionTimeout = setTimeout(function() {
      _levelTransitionTimeout = null;
      _startLevel(nextLevel);
    }, 3000);
  }
}

function _showLevelComplete(nextLevelIndex) {
  playSuccessSound();
  const quips = [
    "Warm-up's over. Things get serious. 😐",
    "Pool shark spotted in the wild! 🦈",
    "You're absolutely cooking! 🔥",
  ];
  const quip = quips[Math.min(currentLevel, quips.length - 1)];

  const starsHTML = Array.from({ length: NUM_LEVELS }, function(_, i) {
    return '<span style="' + (i <= currentLevel ? '' : 'opacity:0.18;filter:grayscale(1)') + '">⭐</span>';
  }).join('');

  overlayEl.style.display = 'flex';
  overlayEl.innerHTML = `
    <div class="overlay-card">
      <span class="overlay-emoji spin">🎱</span>
      <h2>Level ${currentLevel + 1} Complete!</h2>
      <div class="overlay-stars">${starsHTML}</div>
      <p class="overlay-quip">${quip}</p>
      <p class="overlay-sub">LEVEL ${nextLevelIndex + 1} INCOMING&hellip;</p>
    </div>`;

  setTimeout(function() { overlayEl.style.display = 'none'; }, 2900);
}

function _showWinScreen() {
  playWinSound();
  const confettiColors = [
    '#f5d76e','#6effa0','#ff6b6b','#74b9ff',
    '#a29bfe','#fd79a8','#ffeaa7','#00cec9',
  ];

  const confettiHTML = Array.from({ length: 40 }, function() {
    const color    = confettiColors[Math.floor(Math.random() * confettiColors.length)];
    const left     = (Math.random() * 100).toFixed(1);
    const size     = Math.round(8 + Math.random() * 10);
    const delay    = (Math.random() * 2.2).toFixed(2);
    const duration = (2.2 + Math.random() * 2.0).toFixed(2);
    const radius   = Math.random() > 0.45 ? '50%' : '3px';
    return `<div class="confetti-piece" style="left:${left}%;width:${size}px;height:${size}px;background:${color};border-radius:${radius};animation-delay:${delay}s;animation-duration:${duration}s;"></div>`;
  }).join('');

  const starsHTML = Array.from({ length: NUM_LEVELS }, function() {
    return '<span>⭐</span>';
  }).join('');

  overlayEl.style.display = 'flex';
  overlayEl.innerHTML = `
    ${confettiHTML}
    <div class="overlay-card win">
      <span class="overlay-emoji float">🏆</span>
      <h1>YOU WIN!</h1>
      <div class="overlay-stars">${starsHTML}</div>
      <p>All ${NUM_LEVELS} levels conquered!</p>
      <p class="overlay-sub-win">Time to rack 'em up again?</p>
      <button id="btn-restart">🎱&nbsp; Play Again</button>
    </div>`;

  document.getElementById('btn-restart').addEventListener('click', function() {
    overlayEl.style.display = 'none';
    gameWon = false;
    _showDifficultyMenu();
  });
}

// ─── Environment Map ──────────────────────────────────────────────────────────
function _buildEnvMap() {
  const canvas  = document.createElement('canvas');
  canvas.width  = 512;
  canvas.height = 256;
  const ctx  = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.00, '#2a2018');
  grad.addColorStop(0.30, '#10100e');
  grad.addColorStop(0.70, '#090810');
  grad.addColorStop(1.00, '#050408');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  const highlight = ctx.createRadialGradient(256, 40, 0, 256, 40, 140);
  highlight.addColorStop(0.0, 'rgba(255, 224, 170, 0.55)');
  highlight.addColorStop(1.0, 'rgba(255, 224, 170, 0)');
  ctx.fillStyle = highlight;
  ctx.fillRect(0, 0, 512, 256);

  const equiTex    = new THREE.CanvasTexture(canvas);
  equiTex.encoding = THREE.sRGBEncoding;
  equiTex.mapping  = THREE.EquirectangularReflectionMapping;

  const pmrem  = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envMap = pmrem.fromEquirectangular(equiTex).texture;
  pmrem.dispose();
  equiTex.dispose();
  return envMap;
}

// ─── Night Sky Background ─────────────────────────────────────────────────────
function _buildNightSkyBackground() {
  const W = 2048, H = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#030510');
  grad.addColorStop(1, '#080d20');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 2000; i++) {
    const sx = Math.random() * W;
    const sy = Math.random() * H;
    const sr = Math.random() * 0.6 + 0.4;
    const a  = 0.5 + Math.random() * 0.5;
    const wb = Math.floor(Math.random() * 55);
    ctx.fillStyle = `rgba(${200 + wb}, ${200 + wb}, 255, ${a})`;
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 30; i++) {
    const sx = Math.random() * W;
    const sy = Math.random() * H;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.7 + Math.random() * 0.3})`;
    ctx.beginPath(); ctx.arc(sx, sy, 1.2, 0, Math.PI * 2); ctx.fill();
  }

  const MX = Math.round(0.75 * W), MY = Math.round((1 - 0.62) * H), MR = 42;
  const halo = ctx.createRadialGradient(MX, MY, MR * 0.8, MX, MY, MR * 3);
  halo.addColorStop(0, 'rgba(160, 185, 255, 0.22)');
  halo.addColorStop(1, 'rgba(100, 120, 200, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(MX, MY, MR * 3, 0, Math.PI * 2); ctx.fill();

  const disc = ctx.createRadialGradient(MX - 9, MY - 9, 0, MX, MY, MR);
  disc.addColorStop(0,   '#fff8e8');
  disc.addColorStop(0.6, '#e5dca8');
  disc.addColorStop(1,   '#bab07a');
  ctx.fillStyle = disc;
  ctx.beginPath(); ctx.arc(MX, MY, MR, 0, Math.PI * 2); ctx.fill();

  for (const [cx, cy, cr, a] of [[MX+11, MY+13, 6, 0.07], [MX-14, MY+5, 4, 0.05], [MX+17, MY-11, 5, 0.06]]) {
    ctx.fillStyle = `rgba(90, 80, 50, ${a})`;
    ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.encoding = THREE.sRGBEncoding;
  tex.mapping  = THREE.EquirectangularReflectionMapping;
  return tex;
}

// ─── HUD / UI ─────────────────────────────────────────────────────────────────

/**
 * Caches all DOM element references needed for the HUD.
 * The static HTML elements (bottom-ui, buttons, legend) are already in index.html.
 * We only create the HUD panel and overlay here.
 */
function _buildHUD() {
  hudLevelEl     = document.getElementById('hud-level');
  hudBallsEl     = document.getElementById('hud-balls');
  hudLivesEl     = document.getElementById('hud-lives');
  btnCamEl       = document.getElementById('btn-cam');
  btnLampEl      = document.getElementById('btn-lamp');
  btnCeilingEl   = document.getElementById('btn-ceiling');
  btnMusicEl     = document.getElementById('btn-music');
  powerFillEl    = document.getElementById('power-fill');
  powerBarWrapEl = document.getElementById('power-bar-wrap');
  overlayEl      = document.getElementById('overlay');

  _lifeFlashEl = document.createElement('div');
  _lifeFlashEl.id = 'life-lost-flash';
  document.body.appendChild(_lifeFlashEl);
}

function _bindUIButtons() {
  document.getElementById('btn-newconfig').addEventListener('click', _newConfiguration);
  document.getElementById('btn-reset').addEventListener('click', _resetGame);
  document.getElementById('btn-cam').addEventListener('click', _switchCamera);
  document.getElementById('btn-lamp').addEventListener('click', _toggleLamp);
  document.getElementById('btn-ceiling').addEventListener('click', _toggleCeiling);
  document.getElementById('btn-music').addEventListener('click', _toggleMusic);

  document.addEventListener('click', function(e) {
    if (e.target.closest('button')) playClickSound();
  });
}

function _updateHUD() {
  if (hudLevelEl) hudLevelEl.textContent = `Level ${currentLevel + 1} / ${NUM_LEVELS}`;
  if (hudBallsEl) hudBallsEl.textContent = `Balls remaining: ${ballsRemaining}`;
  if (btnCamEl)   btnCamEl.textContent   = currentCameraIndex === 0 ? '\u{1F441} Player POV' : '\u{1F4F7} Overview';
  if (btnLampEl)  btnLampEl.textContent  = lampOn   ? '\u{1F311} Lamp OFF'  : '\u{1F315} Lamp ON';
  if (btnCeilingEl) btnCeilingEl.textContent = ceilingOn ? '\u{1F4A1} Ceiling OFF' : '\u{1F4A1} Ceiling ON';
  if (btnMusicEl) btnMusicEl.textContent = musicOn  ? '\u{1F3B5} Music OFF' : '\u{1F3B5} Music ON';
  if (hudLivesEl && difficultyChosen) {
    hudLivesEl.innerHTML = '';
    for (let i = 0; i < maxLives; i++) {
      const span = document.createElement('span');
      span.className = 'heart';
      span.textContent = i < playerLives ? (difficulty === 'insane' ? '💜' : '❤️') : '🖤';
      hudLivesEl.appendChild(span);
    }
  }
}

function _updatePowerBar() {
  const pct = controls.chargeAmount * 100;
  powerFillEl.style.width = `${pct}%`;

  const hue = 120 - controls.chargeAmount * 120;
  powerFillEl.style.background = `hsl(${hue}, 90%, 50%)`;
  powerFillEl.style.boxShadow = controls.isCharging
    ? `0 0 ${6 + controls.chargeAmount * 14}px hsl(${hue}, 90%, 60%)`
    : 'none';

  const tremble = controls.isCharging ? controls.chargeAmount * 3 : 0;
  powerBarWrapEl.style.setProperty('--tremble', `${tremble}px`);
}

// ─── Difficulty Menu ──────────────────────────────────────────────────────────

function _showDifficultyMenu() {
  document.body.classList.remove('difficulty-insane');
  difficultyChosen = false;
  controls.enabled = false;
  if (musicOn) startBgMusic();

  const DIFFS = [
    { diff: 'normal', label: 'NORMAL', lives: 5 },
    { diff: 'hard',   label: 'HARD',   lives: 3 },
    { diff: 'insane', label: 'INSANE', lives: 1 },
  ];

  const faceSVG = [
    "<svg id='diff-face' viewBox='-50 -50 100 100' xmlns='http://www.w3.org/2000/svg' overflow='visible'>",
    "  <path id='dh-horn-l-bg' stroke='white' stroke-width='7' stroke-linejoin='round' opacity='0'/>",
    "  <path id='dh-horn-r-bg' stroke='white' stroke-width='7' stroke-linejoin='round' opacity='0'/>",
    "  <path id='dh-horn-l' stroke='#111' stroke-width='4' stroke-linejoin='round' opacity='0'/>",
    "  <path id='dh-horn-r' stroke='#111' stroke-width='4' stroke-linejoin='round' opacity='0'/>",
    "  <circle id='dh-bg' cx='0' cy='0' r='50'/>",
    "  <ellipse id='dh-cheek-l' cx='-28' cy='16' rx='13' ry='8' fill='rgba(255,100,80,0.30)'/>",
    "  <ellipse id='dh-cheek-r' cx=' 28' cy='16' rx='13' ry='8' fill='rgba(255,100,80,0.30)'/>",
    "  <path id='dh-brow-l' fill='none' stroke='#111' stroke-width='4.5' stroke-linecap='round'/>",
    "  <path id='dh-brow-r' fill='none' stroke='#111' stroke-width='4.5' stroke-linecap='round'/>",
    "  <ellipse id='dh-eye-l' cx='-17' cy='-4' rx='9' ry='8' fill='#111'/>",
    "  <ellipse id='dh-eye-r' cx=' 17' cy='-4' rx='9' ry='8' fill='#111'/>",
    "  <circle id='dh-shine-l' cx='-13' cy='-7' r='2.8' fill='white' opacity='0.75'/>",
    "  <circle id='dh-shine-r' cx=' 21' cy='-7' r='2.8' fill='white' opacity='0.75'/>",
    "  <path id='dh-mouth' fill='none' stroke='#111' stroke-width='4.5' stroke-linecap='round'/>",
    "</svg>",
  ].join('');

  overlayEl.style.display = 'flex';
  overlayEl.innerHTML =
    "<div class='overlay-card diff-card'>" +
      "<div class='diff-avatar' id='diff-avatar'>" + faceSVG + "</div>" +
      "<div class='diff-label' id='diff-label'>NORMAL</div>" +
      "<div class='diff-sub'   id='diff-sub'>5 lives</div>" +
      "<div class='diff-slider-wrap'>" +
        "<input type='range' id='diff-slider' class='diff-slider' min='0' max='2' step='0.01' value='0'>" +
      "</div>" +
      "<p class='diff-hint'>Slide to set difficulty</p>" +
      "<button id='btn-play-diff' class='btn-play-diff'>&#9654;&nbsp;&nbsp;PLAY</button>" +
    "</div>";

  const labelEl = document.getElementById('diff-label');
  const subEl   = document.getElementById('diff-sub');
  const slider  = document.getElementById('diff-slider');
  const playBtn = document.getElementById('btn-play-diff');

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function lerpColor(c1, c2, t) {
    const h = s => [parseInt(s.slice(1,3),16), parseInt(s.slice(3,5),16), parseInt(s.slice(5,7),16)];
    const [r1,g1,b1] = h(c1), [r2,g2,b2] = h(c2);
    return 'rgb(' + Math.round(lerp(r1,r2,t)) + ',' + Math.round(lerp(g1,g2,t)) + ',' + Math.round(lerp(b1,b2,t)) + ')';
  }
  function twoSeg(v0, v1, v2, t) {
    return t <= 0.5 ? lerp(v0, v1, t / 0.5) : lerp(v1, v2, (t - 0.5) / 0.5);
  }
  function twoSegColor(c0, c1, c2, t) {
    return t <= 0.5 ? lerpColor(c0, c1, t / 0.5) : lerpColor(c1, c2, (t - 0.5) / 0.5);
  }

  function updateFace(v) {
    const n = v / 2;  // 0 = normal, 1 = insane

    const faceColor = twoSegColor('#3aaa60', '#e08030', '#9b2dc7', n);
    const hornColor = twoSegColor('#1e6e38', '#7a3008', '#5a1080', n);

    // Horns grow starting at n = 0.55
    const hornGrow = clamp((n - 0.55) / 0.45, 0, 1);

    const g = function(id) { return document.getElementById(id); };

    g('dh-bg').setAttribute('fill', faceColor);

    if (hornGrow > 0.001) {
      const tipY  = (-50 - hornGrow * 44).toFixed(1);
      const ctrlY = (-42 - hornGrow * 22).toFixed(1);
      const hornD_L = 'M -18 -47 L -38 ' + tipY + ' Q -58 ' + ctrlY + ' -32 -34 Z';
      const hornD_R = 'M 18 -47 L 38 '  + tipY + ' Q 58 '  + ctrlY + ' 32 -34 Z';

      g('dh-horn-l-bg').setAttribute('d', hornD_L);
      g('dh-horn-r-bg').setAttribute('d', hornD_R);
      g('dh-horn-l-bg').setAttribute('fill', hornColor);
      g('dh-horn-r-bg').setAttribute('fill', hornColor);
      g('dh-horn-l').setAttribute('d', hornD_L);
      g('dh-horn-r').setAttribute('d', hornD_R);
      g('dh-horn-l').setAttribute('fill', hornColor);
      g('dh-horn-r').setAttribute('fill', hornColor);
    }
    g('dh-horn-l-bg').setAttribute('opacity', hornGrow.toFixed(3));
    g('dh-horn-r-bg').setAttribute('opacity', hornGrow.toFixed(3));
    g('dh-horn-l').setAttribute('opacity', hornGrow.toFixed(3));
    g('dh-horn-r').setAttribute('opacity', hornGrow.toFixed(3));

    // Eyes squint: ry 8 -> 2.5
    var eyeRy = twoSeg(8, 5, 2.5, n).toFixed(2);
    g('dh-eye-l').setAttribute('ry', eyeRy);
    g('dh-eye-r').setAttribute('ry', eyeRy);

    // Shine scales proportionally with eye height; cy stays in upper portion of iris
    var eyeRyNum = parseFloat(eyeRy);
    var shineR  = (eyeRyNum * 0.35).toFixed(2);
    var shineCy = (-4 - eyeRyNum * 0.60).toFixed(2);
    g('dh-shine-l').setAttribute('r',  shineR);
    g('dh-shine-r').setAttribute('r',  shineR);
    g('dh-shine-l').setAttribute('cy', shineCy);
    g('dh-shine-r').setAttribute('cy', shineCy);

    // Eyebrows: outer stays, inner drops for angry V
    var browOutY = twoSeg(-32, -30, -27, n).toFixed(1);
    var browInnY = twoSeg(-32, -22, -13, n).toFixed(1);
    g('dh-brow-l').setAttribute('d', 'M -27 ' + browOutY + ' L -8 ' + browInnY);
    g('dh-brow-r').setAttribute('d', 'M  27 ' + browOutY + ' L  8 ' + browInnY);

    // Mouth: gentle smile -> flat (angry mid) -> wide evil grin
    var mouthCtrl = twoSeg(30, 14, 48, n).toFixed(1);
    var mouthX    = twoSeg(24, 24, 36, n).toFixed(1);
    g('dh-mouth').setAttribute('d', 'M -' + mouthX + ' 16 Q 0 ' + mouthCtrl + ' ' + mouthX + ' 16');

    // Blush cheeks fade out as anger rises
    var cheekOp = clamp(1 - n / 0.35, 0, 1).toFixed(3);
    g('dh-cheek-l').setAttribute('opacity', cheekOp);
    g('dh-cheek-r').setAttribute('opacity', cheekOp);

    // Slider track fill
    var pct = (v / 2) * 100;
    slider.style.background =
      'linear-gradient(to right, ' + faceColor + ' 0%, ' + faceColor + ' ' + pct + '%, rgba(255,255,255,0.12) ' + pct + '%, rgba(255,255,255,0.12) 100%)';

    // Label / sub / button color
    labelEl.style.color      = faceColor;
    playBtn.style.background = faceColor;
    var idx = Math.min(2, Math.round(v));
    labelEl.textContent = DIFFS[idx].label;
    var lives = DIFFS[idx].lives;
    subEl.textContent = lives + (lives === 1 ? ' life' : ' lives');
  }

  updateFace(0);

  slider.addEventListener('input', function() {
    const v = parseFloat(slider.value);
    updateFace(v);
    // Ramp playback rate from 1.0× (hard, v=1) up to 1.4× (insane, v=2); flat below v=1
    setMusicRate(v <= 1 ? 1.0 : 1.0 + (v - 1) * 0.4);
  });

  function snapSlider() {
    slider.value = Math.round(parseFloat(slider.value));
    updateFace(parseFloat(slider.value));
  }
  slider.addEventListener('mouseup',  snapSlider);
  slider.addEventListener('touchend', snapSlider);

  playBtn.addEventListener('click', function() {
    const d = DIFFS[Math.round(parseFloat(slider.value))];
    _selectDifficulty(d.diff, d.lives);
  });
}

function _selectDifficulty(diff, lives) {
  difficulty       = diff;
  maxLives         = lives;
  playerLives      = lives;
  difficultyChosen = true;
  gameOver         = false;
  setMusicDifficulty(diff);
  document.body.classList.toggle('difficulty-insane', diff === 'insane');
  overlayEl.style.display = 'none';
  _startLevel(0);
}

// ─── Life System ─────────────────────────────────────────────────────────────

function _loseLife() {
  const heartSpans  = hudLivesEl ? hudLivesEl.querySelectorAll('.heart') : [];
  const losingHeart = heartSpans[playerLives - 1];

  if (losingHeart) {
    const isInsane = difficulty === 'insane';

    if (isInsane) {
      // Insane: purple heart flies to screen centre and explodes
      const rect   = losingHeart.getBoundingClientRect();
      const startX = rect.left + rect.width  / 2;
      const startY = rect.top  + rect.height / 2;
      const endX   = window.innerWidth  / 2;
      const endY   = window.innerHeight / 2;

      losingHeart.style.visibility = 'hidden';

      const flyHeart = document.createElement('span');
      flyHeart.className   = 'heart-flying';
      flyHeart.textContent = '💜';
      flyHeart.style.left      = startX + 'px';
      flyHeart.style.top       = startY + 'px';
      flyHeart.style.fontSize  = window.getComputedStyle(losingHeart).fontSize;
      flyHeart.style.animation = 'heartFlyAndExplode 1700ms linear forwards';
      flyHeart.style.setProperty('--tx', (endX - startX).toFixed(1) + 'px');
      flyHeart.style.setProperty('--ty', (endY - startY).toFixed(1) + 'px');
      document.body.appendChild(flyHeart);

      setTimeout(() => {
        _lifeFlashEl.classList.remove('flash');
        void _lifeFlashEl.offsetWidth;
        _lifeFlashEl.classList.add('flash');

        const hudEl = document.getElementById('hud');
        hudEl.classList.remove('hud-shake');
        void hudEl.offsetWidth;
        hudEl.classList.add('hud-shake');
        hudEl.addEventListener('animationend', () => hudEl.classList.remove('hud-shake'), { once: true });

        _spawnHeartFragments(endX, endY);

        document.body.classList.add('screen-tremble');
        setTimeout(() => document.body.classList.remove('screen-tremble'), 1000);
      }, 850);

      // 65% of the 1700ms animation — heart starts rapidly expanding and fading
      setTimeout(playHeartBrokenSound, 1105);

      setTimeout(() => {
        if (flyHeart.parentNode) flyHeart.parentNode.removeChild(flyHeart);
        playerLives = Math.max(0, playerLives - 1);
        _updateHUD();
        if (playerLives <= 0) _showGameOver();
      }, 1820);

    } else {
      // Normal / hard: instant buzz then heart breaks in place
      playErrorSound();
      losingHeart.classList.add('heart-lose');

      _lifeFlashEl.classList.remove('flash');
      void _lifeFlashEl.offsetWidth;
      _lifeFlashEl.classList.add('flash');

      const hudEl = document.getElementById('hud');
      hudEl.classList.remove('hud-shake');
      void hudEl.offsetWidth;
      hudEl.classList.add('hud-shake');
      hudEl.addEventListener('animationend', () => hudEl.classList.remove('hud-shake'), { once: true });

      const rect = losingHeart.getBoundingClientRect();
      _spawnHeartFragments(rect.left + rect.width / 2, rect.top + rect.height / 2);

      setTimeout(() => {
        playerLives = Math.max(0, playerLives - 1);
        _updateHUD();
        if (playerLives <= 0) _showGameOver();
      }, 600);
    }

  } else {
    playerLives = Math.max(0, playerLives - 1);
    _updateHUD();
    if (playerLives <= 0) _showGameOver();
  }
}

function _spawnHeartFragments(cx, cy) {
  const isInsane = difficulty === 'insane';
  const emojis = isInsane
    ? ['💜', '💜', '✨', '💜', '✨', '💜', '💜', '💜', '✨', '💜']
    : ['💔', '💔', '✨', '💔', '✨', '💔', '💔'];
  for (let i = 0; i < emojis.length; i++) {
    const angle = (i / emojis.length) * Math.PI * 2 - Math.PI / 2 + (isInsane ? (Math.random() - 0.5) * 0.4 : 0);
    const dist  = isInsane ? 90 + Math.random() * 110 : 38 + Math.random() * 44;
    const frag  = document.createElement('span');
    frag.className    = 'heart-fragment';
    frag.textContent  = emojis[i];
    frag.style.left   = cx + 'px';
    frag.style.top    = cy + 'px';
    if (isInsane) frag.style.fontSize = '20px';
    frag.style.setProperty('--fx', (Math.cos(angle) * dist).toFixed(1) + 'px');
    frag.style.setProperty('--fy', (Math.sin(angle) * dist).toFixed(1) + 'px');
    frag.style.animationDelay = (Math.random() * 0.08).toFixed(3) + 's';
    document.body.appendChild(frag);
    setTimeout(() => { if (frag.parentNode) frag.parentNode.removeChild(frag); }, isInsane ? 1400 : 850);
  }
}

function _showGameOver() {
  playFailSound();
  gameOver         = true;
  gameState        = STATE.WAITING;
  controls.enabled = false;
  cue.root.visible = false;
  stopBgMusic();

  overlayEl.style.display = 'flex';
  overlayEl.innerHTML =
    "<div class='overlay-card game-over'>" +
      "<span class='overlay-emoji'>&#128128;</span>" +
      "<h1>GAME OVER</h1>" +
      "<p>You ran out of lives!</p>" +
      "<p class='overlay-sub-win'>Think you can do better?</p>" +
      "<button class='btn-try-again' id='btn-try-again'>&#9654;&nbsp;&nbsp;Try Again</button>" +
    "</div>";

  document.getElementById('btn-try-again').addEventListener('click', function() {
    overlayEl.style.display = 'none';
    gameOver = false;
    _showDifficultyMenu();
  });
}
