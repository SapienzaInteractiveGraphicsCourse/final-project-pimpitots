/**
 * main.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsibility: engine bootstrap — renderer, scene, cameras, render loop.
 *
 * Execution flow:
 *   init() → generateTextures() → createRoom → createTable → createLamp →
 *     createCueStick → _spawnAllBalls() → animate()
 *
 * Camera views (toggle with C key or button):
 *   0 = Overview  — wide overhead shot of the whole table
 *   1 = Player POV — low angle behind the cue ball, updated every frame
 * ─────────────────────────────────────────────────────────────────────────────
 */
import * as THREE from 'three';
import { createRoom, createTable, createLamp, createCueStick, createBallMesh, TABLE_SURFACE_Y, BALL_Y } from './models.js';
import { generateTextures } from './textures.js';
import { randomizeBalls } from './physics.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const LAMP_SWING_AMP   = 0.07;  // swing amplitude in radians (~4°)
const LAMP_SWING_SPEED = 0.7;   // swing frequency (rad/s) — ~9 s full cycle

const CAM_DIST_BEHIND = 4.5;    // distance behind cue ball for player-POV camera
const CAM_HEIGHT_POV  = 1.6;    // camera height above table for player POV

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
let balls     = [];                  // [{ id, isCueBall, color, number, mesh }]
let btnLampEl, btnRerackEl, btnCamEl;

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

  // ── Environment map (IBL for ball specular) ──
  ballEnvMap = _buildEnvMap();
  scene.environment = ballEnvMap;

  // ── Balls ──
  _spawnAllBalls();

  // ── Clock ──
  clock = new THREE.Clock();

  // ── UI ──
  btnLampEl   = document.getElementById('btn-lamp');
  btnRerackEl = document.getElementById('btn-rerack');
  btnCamEl    = document.getElementById('btn-cam');
  btnLampEl.addEventListener('click', _toggleLamp);
  btnRerackEl.addEventListener('click', _spawnAllBalls);
  btnCamEl.addEventListener('click', _switchCamera);

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
  if (k === 'C') _switchCamera();
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
 * Toggles between the two camera views and updates the button label.
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

  // Place camera behind the ball in the cue direction
  camera1.position.set(
    cx + Math.cos(phi) * CAM_DIST_BEHIND,
    BALL_Y + CAM_HEIGHT_POV,
    cz - Math.sin(phi) * CAM_DIST_BEHIND,
  );
  camera1.lookAt(cx, BALL_Y + 0.05, cz);
}

// ─── Ball Spawning ────────────────────────────────────────────────────────────

function _spawnAllBalls() {
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
}

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
 * Builds a PMREM env map from a dark procedural gradient.
 * Gives balls subtle IBL highlights without washing out the moody room lighting.
 */
function _buildEnvMap() {
  const canvas  = document.createElement('canvas');
  canvas.width  = 256;
  canvas.height = 128;
  const ctx  = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0.00, '#2a2018');
  grad.addColorStop(0.30, '#10100e');
  grad.addColorStop(0.70, '#090810');
  grad.addColorStop(1.00, '#050408');
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
function animate() {
  requestAnimationFrame(animate);
  const elapsedTime = clock.getElapsedTime();
  _updateLamp(elapsedTime);
  if (currentCameraIndex === 1) _updatePlayerCamera();
  renderer.render(scene, activeCamera);
}
