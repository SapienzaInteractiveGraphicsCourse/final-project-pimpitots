/**
 * textures.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsibility: procedural canvas texture generation and PBR file-texture
 * loading for every surface used in the scene. No geometry or scene-graph
 * code lives here — purely textures.
 *
 * Exported:
 *   generateTextures() → TextureMap
 *     .createBallTex(number, color) → THREE.CanvasTexture
 *     .ball.roughnessMap            → THREE.CanvasTexture (shared by all balls)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import * as THREE from 'three';

/**
 * Generates all textures used by the room and table surfaces.
 * Returns a plain object keyed by surface type. Each entry may have:
 * map, normalMap, roughnessMap, aoMap.
 * @returns {{ felt: {map, normalMap, roughnessMap}, wood: {map, normalMap, roughnessMap}, floor: {map, normalMap, roughnessMap, aoMap}, wall: {map, normalMap, roughnessMap}, ball: {roughnessMap}, createBallTex: Function }}
 */
export function generateTextures() {
  // ── Felt (table surface) ────────────────────────────────────────────────
  const feltColorTex    = _createFeltColorTexture(512);
  const feltNormalTex   = _createFeltNormalMap(512);
  const feltRoughTex    = _createFeltRoughnessMap(512);

  // ── Wood (rails/legs — real photographed PBR set "Wood026" from ambientCG) ──
  const woodLoader      = new THREE.TextureLoader();
  const woodColorTex    = woodLoader.load('./textures/wood/color.jpg');
  const woodNormalTex   = woodLoader.load('./textures/wood/normal.jpg');
  const woodRoughTex    = woodLoader.load('./textures/wood/roughness.jpg');
  woodColorTex.encoding = THREE.sRGBEncoding; // color map only — normal/roughness stay linear

  // ── Floor (real photographed PBR set — CC0 "WoodFloor051" from ambientCG) ──
  const floorLoader     = new THREE.TextureLoader();
  const floorColorTex   = floorLoader.load('./textures/floor/color.jpg');
  const floorNormalTex  = floorLoader.load('./textures/floor/normal.jpg');
  const floorRoughTex   = floorLoader.load('./textures/floor/roughness.jpg');
  const floorAOTex      = floorLoader.load('./textures/floor/ao.jpg');
  floorColorTex.encoding = THREE.sRGBEncoding; // color map only — normal/roughness/AO stay linear

  // ── Ball ─────────────────────────────────────────────────────────────────
  // createBallTex is a per-ball factory (called once per ball, not shared).
  // ballRoughTex is a single shared roughness map for all balls. 512px keeps
  // the number labels and stripe edges crisp at close camera distance.
  const createBallTex = (number, color) => _createBallTexture(number, color, 512);
  const ballRoughTex  = _createBallRoughnessMap(512);

  // ── Wall (PBR set "Plaster003" from ambientCG) ──────────────────────────
  const wallLoader   = new THREE.TextureLoader();
  const wallColorTex = wallLoader.load('./textures/wall/color.jpg');
  const wallNormTex  = wallLoader.load('./textures/wall/normalgl.jpg');
  const wallRoughTex = wallLoader.load('./textures/wall/roughness.jpg');
  wallColorTex.encoding = THREE.sRGBEncoding;

  // Apply repeat wrapping where needed
  [feltColorTex, feltNormalTex, feltRoughTex].forEach(t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 1);  // halved — reduces visible tiling seams
  });
  [woodColorTex, woodNormalTex, woodRoughTex].forEach(t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 1);
  });
  [floorColorTex, floorNormalTex, floorRoughTex, floorAOTex].forEach(t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(10, 8); // tile the 1m-ish photo plank texture across the 22x18 room floor
  });
  [wallColorTex, wallNormTex, wallRoughTex].forEach(t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 2);
  });

  return {
    felt:         { map: feltColorTex,  normalMap: feltNormalTex,  roughnessMap: feltRoughTex  },
    wood:         { map: woodColorTex,  normalMap: woodNormalTex,  roughnessMap: woodRoughTex  },
    floor:        { map: floorColorTex, normalMap: floorNormalTex, roughnessMap: floorRoughTex, aoMap: floorAOTex },
    wall:         { map: wallColorTex, normalMap: wallNormTex, roughnessMap: wallRoughTex },
    ball:         { roughnessMap: ballRoughTex },
    createBallTex,
  };
}

// ── Felt color: dark green baize with random fiber noise ──────────────────────
function _createFeltColorTexture(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Base coat
  ctx.fillStyle = '#1d6b35';
  ctx.fillRect(0, 0, size, size);

  // Fiber-like speckling
  const imgData = ctx.getImageData(0, 0, size, size);
  const d = imgData.data;
  for (let i = 0; i < size * size * 4; i += 4) {
    // Small random brightness variation to simulate baize fiber texture
    const noise = (Math.random() - 0.5) * 28;
    d[i]   = Math.max(0, Math.min(255, 29  + noise));   // R
    d[i+1] = Math.max(0, Math.min(255, 107 + noise));   // G
    d[i+2] = Math.max(0, Math.min(255, 53  + noise));   // B
    d[i+3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);

  // Fine grain lines in both directions (felt weave)
  ctx.globalAlpha = 0.06;
  for (let x = 0; x < size; x += 4) {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
  }
  ctx.globalAlpha = 1.0;

  return new THREE.CanvasTexture(canvas);
}

// ── Felt normal map: height-field-derived normals from a soft noise ───────────
function _createFeltNormalMap(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d   = img.data;

  // Build height field using only high-frequency components. Periods under
  // 3px keep the surface from reading as a regular tiled grid once the
  // texture is repeated across the felt, while still giving the surface a
  // micro-bumpy felt-weave character.
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      h[y * size + x] =
        0.45 * Math.sin(x * 3.1 + y * 1.7) +   // horizontal grain (~2px period)
        0.35 * Math.sin(x * 2.0 - y * 2.9) +   // diagonal weave
        0.20 * (Math.random() - 0.5);            // fine noise
    }
  }

  // Derive normal from height gradients (Sobel-like)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const x0 = x > 0      ? h[y * size + (x-1)] : h[y * size + x];
      const x1 = x < size-1 ? h[y * size + (x+1)] : h[y * size + x];
      const y0 = y > 0      ? h[(y-1) * size + x]  : h[y * size + x];
      const y1 = y < size-1 ? h[(y+1) * size + x]  : h[y * size + x];

      // Tangent-space normal: dX and dY encode slope, Z = "up" strength
      const scale = 3.0; // bump intensity
      const nx = (x0 - x1) * scale;
      const ny = (y0 - y1) * scale;
      const nz = 1.0;
      const len = Math.sqrt(nx*nx + ny*ny + nz*nz);

      const idx = (y * size + x) * 4;
      d[idx]   = Math.round(((nx / len) * 0.5 + 0.5) * 255); // R = X
      d[idx+1] = Math.round(((ny / len) * 0.5 + 0.5) * 255); // G = Y
      d[idx+2] = Math.round(((nz / len) * 0.5 + 0.5) * 255); // B = Z
      d[idx+3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

// ── Felt roughness map: mostly rough, slight variation ────────────────────────
function _createFeltRoughnessMap(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d   = img.data;
  for (let i = 0; i < size * size; i++) {
    const v = Math.floor(200 + Math.random() * 40); // rough: 0.78–0.94
    d[i*4]   = v;
    d[i*4+1] = v;
    d[i*4+2] = v;
    d[i*4+3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

// ── Ball texture: solid color + number label + stripe for balls 9–15 ─────────
/**
 * Creates a canvas texture for one pool ball.
 * Balls 9–15 get a white stripe band across the equator.
 * Ball 0 (cue ball) gets no number label.
 *
 * @param {number} number  - 0 = cue ball, 1–15 = numbered balls
 * @param {string} color   - CSS color for the ball's base
 * @param {number} size    - canvas side length in pixels
 */
function _createBallTexture(number, color, size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Base color fill
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  // Stripe band for striped balls (9–15): white horizontal band in the middle third
  if (number >= 9 && number <= 15) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, Math.floor(size * 0.33), size, Math.floor(size * 0.34));
  }

  // Number label (skip cue ball)
  if (number > 0) {
    const EQUATOR_U_STRETCH = 2;               // u covers 2x the arc length of v at the equator (phiLength=2π vs thetaLength=π)
    const badgeSqueeze      = 1 / EQUATOR_U_STRETCH;
    const fontSize          = Math.floor(size * 0.25);
    const badgeRadius       = size * 0.20;

    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.scale(badgeSqueeze, 1); // pre-squeeze horizontally; the sphere's u-stretch restores true proportions

    // White circle background behind number for readability on dark balls
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, badgeRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.font         = `bold ${fontSize}px Arial, sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = '#111111';
    ctx.fillText(String(number), 0, 0);

    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

// ── Ball roughness map: shiny resin base with subtle scuff variation ──────────
/**
 * Shared roughness map for all balls: mostly low roughness (shiny phenolic
 * resin) with tiny random scuff specks. One texture shared to save VRAM.
 * @param {number} size
 */
function _createBallRoughnessMap(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d   = img.data;
  for (let i = 0; i < size * size; i++) {
    // Base roughness ~56 (≈0.22 in [0,1]) — shiny. Rare pixels spike to ~128 (scuff specks).
    const isScuff = Math.random() < 0.015;
    const v = isScuff ? Math.floor(80 + Math.random() * 80) : Math.floor(50 + Math.random() * 18);
    d[i*4]   = v;
    d[i*4+1] = v;
    d[i*4+2] = v;
    d[i*4+3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

