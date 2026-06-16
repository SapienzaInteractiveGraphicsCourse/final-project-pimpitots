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
import { createRoom, createTable, createLamp, TABLE_SURFACE_Y } from './models.js';
import { generateTextures } from './textures.js';

// Lamp swing animation — small, subtle sway like a hanging fixture gently
// disturbed by passing air, not a deliberately pushed pendulum. Amplitude is
// kept low so the motion reads as a natural idle drift; speed gives a calm
// ~9s full cycle (still slow/weighty, not a twitch).
const LAMP_SWING_AMP   = 0.07; // swing amplitude in radians (~4°)
const LAMP_SWING_SPEED = 0.7;  // swing frequency (radians/second) — ~9s full cycle

// ─── Globals ──────────────────────────────────────────────────────────────────
let renderer, scene, camera, clock, lamp;
let lampOn = true;
let btnLampEl;

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
  const texMap = generateTextures();

  // ── Scene geometry ──
  createRoom(scene, texMap);
  createTable(scene, texMap);
  lamp = createLamp(scene);

  // ── Clock (drives the lamp swing) ──
  clock = new THREE.Clock();

  // ── UI ──
  btnLampEl = document.getElementById('btn-lamp');
  btnLampEl.addEventListener('click', _toggleLamp);

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

/**
 * Main render loop.
 */
function animate() {
  requestAnimationFrame(animate);
  const elapsedTime = clock.getElapsedTime();
  _updateLamp(elapsedTime);
  renderer.render(scene, camera);
}
