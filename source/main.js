/**
 * main.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsibility: engine bootstrap — renderer, scene, cameras, cue/physics
 * gameplay loop, and the power-bar UI.
 *
 * Execution flow:
 *   init() → generateTextures() → createRoom → createTable → createLamp →
 *     createCueStick → Controls(canvas) → _spawnAllBalls() → animate()
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
 * A third camera (Side View) is independent of the toggle above: its own
 * button shows a fixed profile shot of the table and lamp from the right
 * wall, then restores whichever of the two cameras above was active when
 * pressed again.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import * as THREE from 'three';
import { createRoom, createTable, createLamp, createCueStick, createBallMesh, TABLE_SURFACE_Y, BALL_Y } from './models.js';
import { generateTextures } from './textures.js';
import { randomizeBalls, stepPhysics, isReadyForNextShot, snapToRest, TABLE_H, BALL_RADIUS } from './physics.js';
import { Controls } from './controls.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const LAMP_SWING_AMP   = 0.07;  // swing amplitude in radians (~4°)
const LAMP_SWING_SPEED = 0.7;   // swing frequency (rad/s) — ~9 s full cycle

const CAM_DIST_BEHIND = 4.5;    // distance behind cue ball for player-POV camera
const CAM_HEIGHT_POV  = 1.6;    // camera height above table for player POV

const STRIKE_FORWARD_TIME = 0.08; // seconds for the cue to snap forward into the ball
const STRIKE_SHOW_TIME    = 0.25; // seconds the cue stays visible after the strike begins

const DT_CAP = 0.05; // clamp on per-frame delta time, guards against huge dt after a tab stall

// Speed (units/s) above which a ball can travel further than its own radius
// within a single DT_CAP-length frame — i.e. fast enough to tunnel straight
// through a cushion or another ball without ever overlapping it on a frame
// boundary. Stepping physics in smaller sub-steps above this speed keeps
// each individual displacement under one ball radius.
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
  '#F5C518',  // 9  yellow stripe
  '#1565C0',  // 10 blue stripe
  '#C62828',  // 11 red stripe
  '#6A1EA0',  // 12 purple stripe
  '#E65100',  // 13 orange stripe
  '#2E7D32',  // 14 green stripe
  '#6D1B1B',  // 15 maroon stripe
];

// ─── Globals ──────────────────────────────────────────────────────────────────
let renderer, scene, clock, lamp, texMap;
let camera0, camera1, activeCamera;  // 0 = overview, 1 = player POV
let currentCameraIndex = 0;
let cue;                             // { root, group, tipMesh, shaftMesh, gripMesh }
let lampOn    = true;
let ballEnvMap;
let balls     = [];                  // [{ id, isCueBall, color, number, x, z, vx, vz, pocketed, mesh }]
let btnLampEl, btnCamEl;
let powerFillEl, powerBarWrapEl;
let controls;

// Mutable camera-distance for player-POV zoom (mouse wheel / touchpad scroll)
let camDistBehind = CAM_DIST_BEHIND; // initialized from constant, adjusted by _onWheel

const _ballScreenPos = new THREE.Vector3(); // scratch vector for cursor-targeted aiming

// ─── Gameplay State ───────────────────────────────────────────────────────────
const STATE = {
  WAITING:  'WAITING',
  STRIKING: 'STRIKING',
  ROLLING:  'ROLLING',
};
let gameState = STATE.WAITING;

let strikeTimer          = 0; // seconds elapsed since the current strike began
let strikeStartPullback  = 0; // cue.group.position.x at the moment the strike began
let strikeOriginX        = 0; // cue ball x position at the moment the strike began
let strikeOriginZ        = 0; // cue ball z position at the moment the strike began
let strikePendingPhi     = 0; // cue aim angle captured at shot-fire
let strikePendingPower   = 0; // shot power captured at shot-fire
let strikeHitApplied     = false; // true once cue-ball velocity has been applied this strike

// ─── Entry Point ──────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);

function init() {
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

  // ── Scene ──
  scene = new THREE.Scene();
  scene.background = _buildNightSkyBackground();
  // Fog color matches the deep night sky so far geometry fades naturally.
  scene.fog = new THREE.Fog(0x080d20, 8, 30);

  // ── Cameras ──
  const aspect = window.innerWidth / window.innerHeight;

  // Camera 0: overhead overview — sits above ceiling so the BackSide ceiling
  // culls away while all four walls stay visible (same trick as the room box).
  camera0 = new THREE.PerspectiveCamera(52, aspect, 0.1, 100);
  camera0.position.set(0, 14, 5);
  camera0.lookAt(0, TABLE_SURFACE_Y, 0);

  // Camera 1: player POV — low behind the cue ball, updated every frame.
  camera1 = new THREE.PerspectiveCamera(58, aspect, 0.05, 100);

  activeCamera = camera0;

  // ── Lights ──
  const ambientLight = new THREE.AmbientLight(0x404060, 0.25);
  scene.add(ambientLight);

  const fillLight = new THREE.DirectionalLight(0x8090ff, 0.05);
  fillLight.position.set(-8, 6, 4);
  scene.add(fillLight);

  // ── Textures ──
  texMap = generateTextures();

  // ── Scene geometry ──
  createRoom(scene, texMap);
  createTable(scene, texMap);
  lamp = createLamp(scene);

  // ── Cue stick ──
  cue = createCueStick(scene);

  // ── Controls (must exist before _spawnAllBalls, which reads controls.enabled) ──
  controls = new Controls(canvas);

  // ── Environment map (IBL for ball specular) ──
  ballEnvMap = _buildEnvMap();
  scene.environment = ballEnvMap;

  // ── Balls ──
  _spawnAllBalls();

  // ── Clock ──
  clock = new THREE.Clock();

  // ── UI ──
  btnLampEl      = document.getElementById('btn-lamp');
  btnCamEl       = document.getElementById('btn-cam');
  powerFillEl    = document.getElementById('power-fill');
  powerBarWrapEl = document.getElementById('power-bar-wrap');
  document.getElementById('btn-newconfig').addEventListener('click', _spawnAllBalls);
  document.getElementById('btn-reset').addEventListener('click', _spawnAllBalls);
  btnLampEl.addEventListener('click', _toggleLamp);
  btnCamEl.addEventListener('click', _switchCamera);
  canvas.addEventListener('wheel', _onWheel, { passive: false });

  // ── Events ──
  window.addEventListener('resize', _onResize);
  window.addEventListener('keydown', _onKeyDown);

  animate();
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
  const k = e.key.toUpperCase();
  if (k === 'L') _toggleLamp();
  if (k === 'C' || k === 'V') _switchCamera();
  if (k === 'R') _spawnAllBalls();
  if (k === 'N') _spawnAllBalls();
}

// ─── Lamp ─────────────────────────────────────────────────────────────────────
function _updateLamp(elapsedTime) {
  lamp.anchor.rotation.x = Math.sin(elapsedTime * LAMP_SWING_SPEED) * LAMP_SWING_AMP;
}

function _toggleLamp() {
  lampOn = !lampOn;
  for (const light of lamp.lights) {
    light.intensity = lampOn ? light.userData.onIntensity : 0;
  }
  for (const bulbMesh of lamp.bulbMeshes) {
    bulbMesh.material.emissiveIntensity = lampOn ? 2.0 : 0;
  }
  btnLampEl.textContent = lampOn ? '\u{1F311} Lamp OFF' : '\u{1F315} Lamp ON';
}

// ─── Camera ───────────────────────────────────────────────────────────────────

/**
 * Toggles between overview (camera0) and player-POV (camera1).
 */
function _switchCamera() {
  currentCameraIndex = (currentCameraIndex + 1) % 2;
  activeCamera = currentCameraIndex === 0 ? camera0 : camera1;
  // Button shows the destination (where you'll go on the next click)
  btnCamEl.textContent = currentCameraIndex === 0 ? '\u{1F441} Player POV' : '\u{1F4F7} Overview';
}

/**
 * Repositions camera1 each frame — behind the cue ball, aimed at it.
 * Uses cue.root.rotation.y (aim angle) so once aiming is wired up
 * the POV will automatically follow the shot direction.
 */
function _updatePlayerCamera() {
  const cueBall = balls.find(b => b.isCueBall);
  if (!cueBall) return;

  const cx  = cueBall.mesh.position.x;
  const cz  = cueBall.mesh.position.z;
  const phi = cue.root.rotation.y; // aim angle (0 = facing +X direction)

  // Place camera behind the ball in the cue direction (distance driven by scroll zoom)
  camera1.position.set(
    cx + Math.cos(phi) * camDistBehind,
    BALL_Y + CAM_HEIGHT_POV,
    cz - Math.sin(phi) * camDistBehind,
  );
  camera1.lookAt(cx, BALL_Y + 0.05, cz);
}

// ─── Player-POV Zoom (mouse wheel / touchpad) ─────────────────────────────────
/**
 * Adjusts camDistBehind when the user scrolls over the canvas.
 * Only active while the player-POV camera (camera1) is the active camera.
 * Normalises deltaY across deltaMode values so both mouse wheels (which
 * typically report deltaMode=1, ~3 lines per tick) and trackpads (deltaMode=0,
 * finer pixel-level increments) produce a comparable step size.
 *
 * Zoom range: 1.5 (tight close-up) – 10.0 (pulled far back).
 * Pinch-to-zoom on a touchpad fires as wheel events with ctrlKey=true;
 * the same delta normalisation handles it correctly.
 */
function _onWheel(e) {
  if (activeCamera !== camera1) return; // zoom only in player-POV mode
  e.preventDefault();

  // deltaMode 0 = pixels (trackpad), 1 = lines (mouse wheel), 2 = pages
  const step = e.deltaMode === 0 ? e.deltaY * 0.005 : e.deltaY * 0.15;
  // Max 6.0: with ball at table edge (±4.30 X, ±2.05 Z) and room walls at ±11 X / ±9 Z,
  // a 6-unit distance keeps the camera safely inside the room in all aim directions.
  camDistBehind = Math.max(1.5, Math.min(6.0, camDistBehind + step));
}

// ─── Ball Spawning ────────────────────────────────────────────────────────────

function _spawnAllBalls() {
  if (gameState === STATE.ROLLING || gameState === STATE.STRIKING) return; // never reset the table mid-shot

  for (const b of balls) scene.remove(b.mesh);
  balls = [];

  const positions = randomizeBalls(15); // pos[0]=cue, pos[1..15]=colored
  _spawnBall(0, 0, positions[0].x, positions[0].z, true);
  for (let i = 1; i <= 15; i++) {
    _spawnBall(i, i, positions[i].x, positions[i].z, false);
  }

  // Anchor the cue at the cue ball position
  const cueBall = balls.find(b => b.isCueBall);
  cue.root.position.set(cueBall.mesh.position.x, BALL_Y, cueBall.mesh.position.z);
  cue.root.visible = true;
  cue.group.position.set(0, 0, 0);

  gameState        = STATE.WAITING;
  controls.enabled = true;
}

function _spawnBall(id, number, x, z, isCueBall) {
  const color = BALL_COLORS[Math.min(number, BALL_COLORS.length - 1)];
  const mesh  = createBallMesh(color, number, texMap.createBallTex, ballEnvMap, texMap.ball.roughnessMap);
  mesh.position.set(x, BALL_Y, z);
  mesh.castShadow = true;
  scene.add(mesh);
  balls.push({ id, isCueBall, color, number, x, z, vx: 0, vz: 0, pocketed: false, mesh });
}

// ─── Cue Ball Respawn (after a scratch) ──────────────────────────────────────
/**
 * Restores the cue ball to its standard re-spot position after it has been
 * pocketed. Called from animate() on a short delay after a scratch.
 */
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
/**
 * Launches the cue ball along the current aim direction at the given speed,
 * and starts the cue's forward strike animation.
 * @param {number} power - shot speed in scene units/s
 */
function _fireShot(power) {
  const cueBall = balls.find(b => b.isCueBall && !b.pocketed);
  if (!cueBall) return;

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
/**
 * Drives the cue's position, aim rotation, pullback, visibility, and strike
 * animation according to the current gameplay state.
 * @param {number} dt - delta time in seconds
 */
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

    // Cursor-targeted aiming: while dragging in the overview camera, point
    // the cue at wherever the cursor is relative to the cue ball on screen,
    // rather than only accumulating relative drag motion.
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

    cue.root.rotation.y  = controls.aimAngle;
    cue.group.position.x = controls.pullback;
  } else if (gameState === STATE.STRIKING) {
    strikeTimer += dt;
    const t = Math.min(strikeTimer / STRIKE_FORWARD_TIME, 1.0);
    // Drive the tip all the way to the ball centre for an unambiguous visual hit.
    // BALL_RADIUS = 0.18 → at targetX = -BALL_RADIUS the tip's near-face sits at
    // x = BALL_RADIUS + targetX = 0, i.e. the ball's centre.
    const targetX = -BALL_RADIUS;
    cue.group.position.x = strikeStartPullback + (targetX - strikeStartPullback) * t;

    // Apply cue-ball velocity the first frame the cue tip's near-face reaches
    // the ball surface: cueGroup.x ≤ 0  ⟺  tipFace ≤ BALL_RADIUS (ball surface).
    // Keeping the velocity deferred until this moment prevents the ball from
    // flying away while the cue stick is still mid-approach.
    if (!strikeHitApplied && cue.group.position.x <= 0) {
      const cueBall = balls.find(b => b.isCueBall && !b.pocketed);
      if (cueBall) {
        cueBall.vx = -Math.cos(strikePendingPhi) * strikePendingPower;
        cueBall.vz =  Math.sin(strikePendingPhi) * strikePendingPower;
      }
      strikeHitApplied = true;
    }

    if (strikeTimer >= STRIKE_SHOW_TIME) {
      cue.root.visible = false;
      gameState        = STATE.ROLLING;
    }
  }
}

// ─── Ball Rolling Rotation ────────────────────────────────────────────────────
const _deltaQ   = new THREE.Quaternion(); // scratch quaternion reused every call
const _rollAxis = new THREE.Vector3();    // scratch axis vector reused every call

/**
 * Spins a ball's mesh to visually match its rolling motion: the roll axis is
 * perpendicular to its velocity (in the XZ plane), and the roll angle is
 * derived from the distance travelled this frame divided by the ball radius.
 * @param {{ vx: number, vz: number, mesh: THREE.Object3D }} ball
 * @param {number} dt - delta time in seconds
 */
function _updateBallRotation(ball, dt) {
  const speed = Math.sqrt(ball.vx * ball.vx + ball.vz * ball.vz);
  if (speed < 0.0001) return;

  _rollAxis.set(-ball.vz / speed, 0, ball.vx / speed);
  const angle = (speed * dt) / BALL_RADIUS;
  _deltaQ.setFromAxisAngle(_rollAxis, angle);
  ball.mesh.quaternion.premultiply(_deltaQ);
}

// ─── Power Bar UI ─────────────────────────────────────────────────────────────
/**
 * Reflects the current charge level in the power-bar fill width, color
 * (green at low charge, shifting to red at full charge), glow, and tremble.
 */
function _updatePowerBar() {
  const pct = controls.chargeAmount * 100;
  powerFillEl.style.width = `${pct}%`;

  const hue = 120 - controls.chargeAmount * 120; // green (120°) → red (0°)
  powerFillEl.style.background = `hsl(${hue}, 90%, 50%)`;
  powerFillEl.style.boxShadow = controls.isCharging
    ? `0 0 ${6 + controls.chargeAmount * 14}px hsl(${hue}, 90%, 60%)`
    : 'none';

  const tremble = controls.isCharging ? controls.chargeAmount * 3 : 0;
  powerBarWrapEl.style.setProperty('--tremble', `${tremble}px`);
}

// ─── Environment Map ──────────────────────────────────────────────────────────

/**
 * Builds a PMREM env map from a dark procedural gradient.
 * Gives balls subtle IBL highlights without washing out the moody room lighting.
 * A soft warm highlight near the top stands in for the overhead lamp bar, so
 * the balls' clearcoat layer picks up a directional glint instead of just a
 * flat gradient reflection.
 */
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

/**
 * Builds a 2048×1024 equirectangular canvas texture used as scene.background.
 * Shows through the window hole in the left wall, giving a parallax night sky.
 */
function _buildNightSkyBackground() {
  const W = 2048, H = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0,   '#030510');
  grad.addColorStop(1,   '#080d20');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Stars — crisp point-like dots
  for (let i = 0; i < 2000; i++) {
    const sx = Math.random() * W;
    const sy = Math.random() * H;
    const sr = Math.random() * 0.6 + 0.4;
    const a  = 0.5 + Math.random() * 0.5;
    const wb = Math.floor(Math.random() * 55);
    ctx.fillStyle = `rgba(${200 + wb}, ${200 + wb}, 255, ${a})`;
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
  }
  // Brighter foreground stars
  for (let i = 0; i < 30; i++) {
    const sx = Math.random() * W;
    const sy = Math.random() * H;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.7 + Math.random() * 0.3})`;
    ctx.beginPath(); ctx.arc(sx, sy, 1.2, 0, Math.PI * 2); ctx.fill();
  }

  // Moon — positioned for the -X direction (U=0.75 → x=1536, V=0.62 → y=386)
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

// ─── Render Loop ──────────────────────────────────────────────────────────────
/**
 * Per-frame update, in order:
 *   1. Frame timing      — capped delta time, elapsed time for the lamp swing
 *   2. Input             — controls.update(), consume a fired shot if any
 *   3. Physics           — sub-stepped stepPhysics() while STRIKING/ROLLING,
 *                           newly-pocketed handling, ROLLING → WAITING transition
 *   4. Sync              — ball meshes follow physics state, rolling rotation
 *   5. Cue               — position/aim/pullback/strike animation
 *   6. Lamp swing
 *   7. Player-POV camera (only when active)
 *   8. Render + power-bar UI
 */
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

    // Sub-step at high speed so a fast ball can't tunnel through a cushion
    // or another ball within a single frame.
    const SUB_STEPS = maxSpeedSq < SUBSTEP_SAFE_SPEED_SQ ? 1 : 3;
    const subDt     = dt / SUB_STEPS;

    let newlyPocketed = [];
    for (let s = 0; s < SUB_STEPS; s++) {
      newlyPocketed = newlyPocketed.concat(stepPhysics(balls, subDt));
    }

    for (const b of newlyPocketed) {
      b.mesh.visible = false;
      if (b.isCueBall) {
        setTimeout(() => _respawnCueBall(), 800);
      }
    }

    if (gameState === STATE.ROLLING && isReadyForNextShot(balls)) {
      const cueBall = balls.find(b => b.isCueBall);
      if (cueBall && !cueBall.pocketed) {
        snapToRest(balls);
        gameState         = STATE.WAITING;
        controls.enabled  = true;
        cue.root.visible  = true;
        cue.group.position.set(0, 0, 0);
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
