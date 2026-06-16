/**
 * textures.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsibility: procedural canvas texture generation and PBR file-texture
 * loading for every surface used in the scene. No geometry or scene-graph
 * code lives here — purely textures.
 *
 * Exported:
 *   generateTextures() → TextureMap
 * ─────────────────────────────────────────────────────────────────────────────
 */
import * as THREE from 'three';

/**
 * Generates all textures used by the room and table surfaces.
 * Returns a plain object keyed by surface type. Each entry may have:
 * map, normalMap, roughnessMap, aoMap.
 * @returns {{ felt: {map, normalMap, roughnessMap}, wood: {map, normalMap, roughnessMap}, floor: {map, normalMap, roughnessMap, aoMap}, wall: {map} }}
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

  // ── Wall ────────────────────────────────────────────────────────────────
  const wallColorTex    = _createWallTexture(512);

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
  [wallColorTex].forEach(t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 2);
  });

  return {
    felt:  { map: feltColorTex,  normalMap: feltNormalTex,  roughnessMap: feltRoughTex  },
    wood:  { map: woodColorTex,  normalMap: woodNormalTex,  roughnessMap: woodRoughTex  },
    floor: { map: floorColorTex, normalMap: floorNormalTex, roughnessMap: floorRoughTex, aoMap: floorAOTex },
    wall:  { map: wallColorTex },
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

// ── Wall texture: light plaster with subtle variation ─────────────────────────
function _createWallTexture(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d   = img.data;
  for (let i = 0; i < size * size; i++) {
    const base = 55 + Math.floor(Math.random() * 12);
    d[i*4]   = base + 10;  // R
    d[i*4+1] = base + 8;   // G
    d[i*4+2] = base;        // B (slightly warm tone)
    d[i*4+3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(canvas);
}
