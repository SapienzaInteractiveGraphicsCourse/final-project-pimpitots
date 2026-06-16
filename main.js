/**
 * main.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsibility: engine bootstrap — renderer, scene, camera, render loop.
 *
 * Currently implements the minimal setup plus the empty room. No game
 * logic, no table/balls/cue/lamp, no UI, no controls yet — those will be
 * layered on as the project grows.
 *
 * Execution flow:
 *   init() → createRoom(scene) → animate()
 * ─────────────────────────────────────────────────────────────────────────────
 */
import * as THREE from 'three';
import { createRoom } from './models.js';

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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
  renderer.outputEncoding    = THREE.sRGBEncoding;
  renderer.toneMapping       = THREE.ACESFilmicToneMapping;

  // ── Scene ──
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a22);

  // ── Camera ──
  // Positioned above the room's ceiling but within its X/Z footprint: this
  // makes the BackSide-rendered ceiling cull away (camera sits on the side
  // its outward normal points to) while all four walls stay back-facing
  // relative to the camera and render correctly — a "roof removed" overview
  // of the room. (Same trick the room box itself relies on — see models.js.)
  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(52, aspect, 0.1, 100);
  camera.position.set(0, 14, 5);
  camera.lookAt(0, 0, 0);

  // ── Lights ──
  // Assumption: placeholder lighting only, just enough to see the room
  // shell. Replaced/extended once the lamp (point light) is added in a
  // later step.
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambientLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.7);
  fillLight.position.set(-6, 10, 4);
  scene.add(fillLight);

  // ── Scene geometry ──
  createRoom(scene);

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
