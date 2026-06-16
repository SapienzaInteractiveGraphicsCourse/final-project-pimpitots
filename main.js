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

// ─── Globals ──────────────────────────────────────────────────────────────────
let renderer, scene, camera;

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
  createLamp(scene);

  // ── Window resize ──
  window.addEventListener('resize', _onResize);

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
 * Main render loop.
 */
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
