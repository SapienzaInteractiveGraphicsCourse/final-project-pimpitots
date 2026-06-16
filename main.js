/**
 * main.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsibility: engine bootstrap — renderer, scene, camera, render loop.
 *
 * Execution flow:
 *   init() → generateTextures() → createRoom(scene, texMap) →
 *     createTable(scene, texMap) → createLamp(scene) → animate()
 * ─────────────────────────────────────────────────────────────────────────────
 */
import * as THREE from 'three';
import { createRoom, createTable, createLamp, createBallMesh, TABLE_SURFACE_Y, BALL_Y } from './models.js';
import { generateTextures } from './textures.js';
import { randomizeBalls } from './physics.js';

// Lamp swing animation — small, subtle sway like a hanging fixture gently
// disturbed by passing air, not a deliberately pushed pendulum. Amplitude is
// kept low so the motion reads as a natural idle drift; speed gives a calm
// ~9s full cycle (still slow/weighty, not a twitch).
const LAMP_SWING_AMP   = 0.07; // swing amplitude in radians (~4°)
const LAMP_SWING_SPEED = 0.7;  // swing frequency (radians/second) — ~9s full cycle

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
let renderer, scene, camera, clock, lamp, texMap;
let lampOn    = true;
let ballEnvMap;            // PMREM env map — applied only to ball materials
let balls     = [];        // [{ id, isCueBall, color, number, mesh }]
let btnLampEl, btnRerackEl;

// ─── Entry Point ──────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);

/**
 * Initialises Three.js, builds the empty room, and starts the render loop.
 */
function init() {
  // ── Renderer ──
  const canvas = document.getElementById('glCanvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled   = true;
  renderer.shadowMap.type      = THREE.PCFSoftShadowMap;
  renderer.outputEncoding      = THREE.sRGBEncoding; // correct gamma for CanvasTextures
  renderer.toneMapping         = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.75;

  // ── Scene ──
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a22);
  // Fog starts well within the room (8) so the back wall/corners visibly
  // recede into haze, blending toward the background color (30) — gives the
  // impression the space extends further than the room's actual bounds.
  scene.fog = new THREE.Fog(0x1a1a22, 8, 30);

  // ── Camera ──
  // Positioned above the room's ceiling but within its X/Z footprint: this
  // makes the BackSide-rendered ceiling cull away (camera sits on the side
  // its outward normal points to) while all four walls stay back-facing
  // relative to the camera and render correctly — a "roof removed" overview
  // of the room. (Same trick the room box itself relies on — see models.js.)
  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(52, aspect, 0.1, 100);
  camera.position.set(0, 14, 5);
  camera.lookAt(0, TABLE_SURFACE_Y, 0);

  // ── Lights ──
  const ambientLight = new THREE.AmbientLight(0x404060, 0.25); // TUNE: higher → softer/lighter shadows; lower → harsher/darker
  scene.add(ambientLight);

  const fillLight = new THREE.DirectionalLight(0x8090ff, 0.05); // soft blue fill from side
  fillLight.position.set(-8, 6, 4);
  scene.add(fillLight);

  // ── Textures ──
  texMap = generateTextures();

  // ── Scene geometry ──
  createRoom(scene, texMap);
  createTable(scene, texMap);
  lamp = createLamp(scene);

  // ── Environment map (IBL for ball materials only) ──
  ballEnvMap = _buildEnvMap();
  scene.environment = ballEnvMap;

  // ── Spawn all 15 balls + cue ball ──
  _spawnAllBalls();

  // ── Clock (drives the lamp swing) ──
  clock = new THREE.Clock();

  // ── UI ──
  btnLampEl   = document.getElementById('btn-lamp');
  btnRerackEl = document.getElementById('btn-rerack');
  btnLampEl.addEventListener('click', _toggleLamp);
  btnRerackEl.addEventListener('click', _spawnAllBalls);

  // ── Window resize ──
  window.addEventListener('resize', _onResize);

  // ── Keyboard shortcuts ──
  window.addEventListener('keydown', _onKeyDown);

  // ── Kick off render loop ──
  animate();
}

/**
 * Keeps the camera aspect ratio and renderer size in sync with the viewport.
 */
function _onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * Handles keyboard shortcuts. 'L' toggles the lamp on/off.
 * @param {KeyboardEvent} e
 */
function _onKeyDown(e) {
  if (e.key.toUpperCase() === 'L') _toggleLamp();
}

// ─── Lamp Animation & Toggle ───────────────────────────────────────────────────

/**
 * Updates the lamp swing idle animation.
 * lamp.anchor.rotation.x oscillates sinusoidally (sin is the natural simple-
 * harmonic pendulum motion: fastest through center, slowest at the
 * extremes) — the cord, bulb, and point light all swing together since they
 * are children of lamp.anchor. This visibly exploits the parent-child
 * hierarchy.
 * @param {number} elapsedTime - total elapsed time in seconds
 */
function _updateLamp(elapsedTime) {
  lamp.anchor.rotation.x = Math.sin(elapsedTime * LAMP_SWING_SPEED) * LAMP_SWING_AMP;
}

/**
 * Toggles the lamp on/off. Affects both the PointLight intensity and the
 * bulb's emissive intensity, and updates the toggle button's label.
 */
function _toggleLamp() {
  lampOn = !lampOn;
  lamp.light.intensity = lampOn ? lamp.light.userData.onIntensity : 0;
  lamp.bulbMesh.material.emissiveIntensity = lampOn ? 2.0 : 0; // 2.0 matches bulbMat's initial value in models.js
  btnLampEl.textContent = lampOn ? '\u{1F311} Lamp OFF' : '\u{1F315} Lamp ON';
}

// ─── Ball Spawning ─────────────────────────────────────────────────────────────

/**
 * Spawns all 15 numbered balls + cue ball (16 total) at randomised positions.
 * The cue ball lands in the positive-Z half; colored balls are scattered
 * across the full table, collision-free and clear of pockets.
 */
function _spawnAllBalls() {
  for (const b of balls) scene.remove(b.mesh);
  balls = [];

  const positions = randomizeBalls(15); // pos[0]=cue, pos[1..15]=colored

  _spawnBall(0, 0, positions[0].x, positions[0].z, true);

  for (let i = 1; i <= 15; i++) {
    _spawnBall(i, i, positions[i].x, positions[i].z, false);
  }
}

/**
 * Creates a single ball: builds the Three.js mesh and adds it to the scene,
 * then pushes a physics-state entry to the `balls` array.
 * @param {number}  id        - unique ball identifier
 * @param {number}  number    - ball number (0 = cue, 1–15 = colored)
 * @param {number}  x         - initial X position on the table
 * @param {number}  z         - initial Z position on the table
 * @param {boolean} isCueBall
 */
function _spawnBall(id, number, x, z, isCueBall) {
  const color = BALL_COLORS[Math.min(number, BALL_COLORS.length - 1)];
  const mesh  = createBallMesh(color, number, texMap.createBallTex, ballEnvMap, texMap.ball.roughnessMap);
  mesh.position.set(x, BALL_Y, z);
  mesh.castShadow = true;
  scene.add(mesh);
  balls.push({ id, isCueBall, color, number, mesh });
}

// ─── Environment Map ──────────────────────────────────────────────────────────

/**
 * Builds a small PMREM env map from a procedural canvas gradient.
 * Keeps the scene mood dark (billiard room). IBL is subtle — the PointLight
 * does the primary work; this just prevents ball specular highlights from
 * going pitch-black in unlit directions.
 * @returns {THREE.Texture}
 */
function _buildEnvMap() {
  const canvas  = document.createElement('canvas');
  canvas.width  = 256;
  canvas.height = 128;
  const ctx  = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0.00, '#2a2018');  // ceiling: faint warm glow from lamp above
  grad.addColorStop(0.30, '#10100e');  // upper walls: near-black
  grad.addColorStop(0.70, '#090810');  // lower walls: cool dark
  grad.addColorStop(1.00, '#050408');  // floor: almost black
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 128);

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

/**
 * Main render loop.
 */
function animate() {
  requestAnimationFrame(animate);
  const elapsedTime = clock.getElapsedTime();
  _updateLamp(elapsedTime);
  renderer.render(scene, camera);
}
