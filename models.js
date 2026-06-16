/**
 * models.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsibility: Three.js mesh/hierarchy construction and procedural/PBR
 * texture generation. No game logic lives here — purely geometry & materials.
 *
 * Exported:
 *   generateTextures()             → TextureMap
 *   createRoom(scene, texMap)      → { group }
 *   createTable(scene, texMap)     → { group, surfaceMesh }
 *   createLamp(scene)              → { group, bulbMesh, light }
 *
 * Coordinate system: Y-up. Room floor at Y = 0. Table surface at Y = TABLE_SURFACE_Y.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import * as THREE from 'three';

// ─── Shared Scene-Geometry Constants ─────────────────────────────────────────
export const TABLE_SURFACE_Y = 0.76; // table felt surface height in world space (table "on the floor")

// Room dimensions
const ROOM_W = 22;
const ROOM_D = 18;
const ROOM_H = 7.0;

// Table dimensions
const TABLE_W     = 9.0;   // table playing surface long axis  (X)
const TABLE_H     = 4.5;   // table playing surface short axis (Z)
const TABLE_LEG_H = 0.72;  // table leg height (TABLE_SURFACE_Y - table panel thickness ~0.04)
const RAIL_H      = 0.10;  // cushion rail height above felt
const RAIL_W      = 0.30;  // cushion rail width (inward thickness)

// Pocket hole positions on the felt (4 corners + 2 middles)
const POCKET_POSITIONS = [
  [-TABLE_W / 2 + 0.22, -TABLE_H / 2 + 0.22],  // front-left corner  (toward -Z, -X)
  [ TABLE_W / 2 - 0.22, -TABLE_H / 2 + 0.22],  // front-right corner
  [-TABLE_W / 2 + 0.22,  TABLE_H / 2 - 0.22],  // back-left corner
  [ TABLE_W / 2 - 0.22,  TABLE_H / 2 - 0.22],  // back-right corner
  [ 0,                  -TABLE_H / 2 + 0.12],  // front-middle
  [ 0,                   TABLE_H / 2 - 0.12],  // back-middle
];

// ─── Procedural & PBR Texture Generation ─────────────────────────────────────

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

// ─── Room ─────────────────────────────────────────────────────────────────────
/**
 * Creates and adds the closed room (floor, ceiling, 4 walls) to the scene.
 * @param {THREE.Scene} scene
 * @param {Object} texMap - result of generateTextures()
 * @returns {{ group: THREE.Group }}
 */
export function createRoom(scene, texMap) {
  const group = new THREE.Group();
  group.name  = 'room';

  const wallMat = new THREE.MeshStandardMaterial({
    map:       texMap.wall.map,
    roughness: 0.85,
    metalness: 0.0,
    side:      THREE.BackSide, // render inside faces of the room box
  });

  const floorMat = new THREE.MeshStandardMaterial({
    map:          texMap.floor.map,
    normalMap:    texMap.floor.normalMap,
    roughnessMap: texMap.floor.roughnessMap,
    aoMap:        texMap.floor.aoMap,
    roughness:    0.8,
    metalness:    0.0,
  });

  // Room is a large box — we render its inside faces
  const roomGeo  = new THREE.BoxGeometry(ROOM_W, ROOM_H, ROOM_D);
  const roomMesh = new THREE.Mesh(roomGeo, wallMat);
  roomMesh.position.set(0, ROOM_H / 2, 0);
  roomMesh.name = 'roomBox';
  // NOTE: receiveShadow intentionally omitted — Three.js shadow bias is inverted
  // for BackSide faces, producing large black artifacts on the ceiling.
  // Wall shadow reception is handled by the separate floor plane instead.
  group.add(roomMesh);

  // Floor (separate plane so we can use the floor material)
  const floorGeo  = new THREE.PlaneGeometry(ROOM_W, ROOM_D);
  // aoMap requires a second UV channel — reuse the primary UVs (r128 has no auto-fallback)
  floorGeo.setAttribute('uv2', new THREE.BufferAttribute(floorGeo.attributes.uv.array, 2));
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;  // lie flat in XZ plane
  floorMesh.position.y = 0.001; // 1mm above room-box bottom face (both at Y=0 → Z-fight)
  floorMesh.receiveShadow = true;
  floorMesh.name = 'floor';
  group.add(floorMesh);

  scene.add(group);
  return { group };
}

// ─── Pool Table ───────────────────────────────────────────────────────────────
/**
 * Creates the pool table: playing surface (felt), 4 surrounding rail/cushion
 * sections (wood), 6 pocket holes, and 4 legs.
 * All meshes are added to the scene.
 *
 * @param {THREE.Scene} scene
 * @param {Object} texMap - result of generateTextures()
 * @returns {{ group: THREE.Group, surfaceMesh: THREE.Mesh }}
 */
export function createTable(scene, texMap) {
  const group = new THREE.Group();
  group.name  = 'table';

  // ── Felt playing surface ──────────────────────────────────────────────
  const feltMat = new THREE.MeshStandardMaterial({
    map:          texMap.felt.map,
    normalMap:    texMap.felt.normalMap,
    roughnessMap: texMap.felt.roughnessMap,
    roughness:    0.85,
    metalness:    0.0,
    normalScale:  new THREE.Vector2(0.15, 0.15), // TUNE: 0.05=barely visible · 0.15=subtle · 0.4+=grid returns
  });

  const feltGeo     = new THREE.PlaneGeometry(TABLE_W, TABLE_H);
  const surfaceMesh = new THREE.Mesh(feltGeo, feltMat);
  surfaceMesh.rotation.x    = -Math.PI / 2;
  surfaceMesh.position.y    = TABLE_SURFACE_Y;
  surfaceMesh.receiveShadow = true;
  surfaceMesh.name = 'felt';
  group.add(surfaceMesh);

  // ── Table body (dark wood box under the felt) ─────────────────────────
  const bodyMat = new THREE.MeshStandardMaterial({
    map:          texMap.wood.map,
    normalMap:    texMap.wood.normalMap,
    roughnessMap: texMap.wood.roughnessMap,
    roughness:    0.8,
    metalness:    0.1,
  });

  const bodyGeo  = new THREE.BoxGeometry(TABLE_W + RAIL_W * 2, 0.08, TABLE_H + RAIL_W * 2);
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  // Lowered by extra 0.004 so top face sits at TABLE_SURFACE_Y - 0.004, not TABLE_SURFACE_Y.
  // This breaks the coplanarity with the felt plane without moving the felt (which would
  // embed the balls 2mm into the felt and corrupt the shadow map under each ball).
  bodyMesh.position.set(0, TABLE_SURFACE_Y - 0.044, 0);
  bodyMesh.castShadow    = true;
  bodyMesh.receiveShadow = true;
  bodyMesh.name = 'tableBody';
  group.add(bodyMesh);

  // ── Cushion rails (4 sections — skip corners for pocket openings) ─────
  // Rails are BoxGeometry segments placed just outside the felt edge.
  // We split each long side into two segments (left, right) with a gap at
  // the middle pocket; short sides are single segments with gaps at ends.
  _buildRails(group, bodyMat);

  // ── Pocket holes (dark discs flush with the felt) ─────────────────────
  const pocketMat = new THREE.MeshStandardMaterial({
    color:     0x0a0a0a,
    roughness: 1.0,
    metalness: 0.0,
  });

  for (const [px, pz] of POCKET_POSITIONS) {
    const pGeo  = new THREE.CircleGeometry(0.30, 24);
    const pMesh = new THREE.Mesh(pGeo, pocketMat);
    pMesh.rotation.x = -Math.PI / 2;
    pMesh.position.set(px, TABLE_SURFACE_Y + 0.001, pz); // 1mm above felt to avoid Z-fighting
    pMesh.name = 'pocket';
    group.add(pMesh);
  }

  // ── Legs ──────────────────────────────────────────────────────────────
  const legMat = new THREE.MeshStandardMaterial({
    map:          texMap.wood.map,
    roughnessMap: texMap.wood.roughnessMap,
    roughness:    0.8,
    metalness:    0.0,
  });

  const legOffsets = [
    [-TABLE_W / 2 + 0.2,  TABLE_H / 2 - 0.2],
    [ TABLE_W / 2 - 0.2,  TABLE_H / 2 - 0.2],
    [-TABLE_W / 2 + 0.2, -TABLE_H / 2 + 0.2],
    [ TABLE_W / 2 - 0.2, -TABLE_H / 2 + 0.2],
  ];

  for (const [lx, lz] of legOffsets) {
    const legGeo  = new THREE.BoxGeometry(0.12, TABLE_LEG_H, 0.12);
    const legMesh = new THREE.Mesh(legGeo, legMat);
    legMesh.position.set(lx, TABLE_LEG_H / 2, lz);
    legMesh.castShadow = true;
    legMesh.name = 'leg';
    group.add(legMesh);
  }

  scene.add(group);
  return { group, surfaceMesh };
}

/**
 * Builds the 4-sided cushion rail assembly for the table.
 * Each long rail is split into two segments with a middle-pocket gap.
 * Each short rail is a single segment with corner gaps.
 * @param {THREE.Group} group
 * @param {THREE.Material} mat
 */
function _buildRails(group, mat) {
  const RH  = RAIL_H;
  const RW  = RAIL_W;
  const TY  = TABLE_SURFACE_Y + RH / 2;  // rail center Y (sits on top of felt level)
  const HW  = TABLE_W / 2;               // half table width  (X axis)
  const HH  = TABLE_H / 2;               // half table height (Z axis)
  const GAP = 0.55;                      // clearance per pocket opening (per side)

  // Helper: create one rail BoxGeometry segment and add it to the table group.
  // px,py,pz = center position;  sx,sy,sz = box dimensions
  function addRail(px, py, pz, sx, sy, sz) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set(px, py, pz);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    mesh.name          = 'rail';
    group.add(mesh);
  }

  // ── Long rails (run parallel to X, placed at z = ±(HH + RW/2)) ──────────
  // Each long rail is split into TWO segments by a middle-pocket gap at x = 0.
  // Left segment  covers x from -(HW - GAP) to -GAP  → length = HW - 2*GAP, center = -(HW/2)
  // Right segment covers x from  +GAP to  (HW - GAP) → length = HW - 2*GAP, center = +(HW/2)
  const longLen = HW - 2 * GAP;  // = 4.5 - 1.1 = 3.4 units
  const cx_L    = -(HW / 2);     // = -2.25
  const cx_R    =  (HW / 2);     // = +2.25

  // Front long rails (z = -HH - RW/2 = -2.4)
  addRail(cx_L, TY, -(HH + RW / 2), longLen, RH, RW);
  addRail(cx_R, TY, -(HH + RW / 2), longLen, RH, RW);
  // Back long rails  (z = +HH + RW/2 = +2.4)
  addRail(cx_L, TY,  (HH + RW / 2), longLen, RH, RW);
  addRail(cx_R, TY,  (HH + RW / 2), longLen, RH, RW);

  // ── Short rails (run parallel to Z, placed at x = ±(HW + RW/2)) ─────────
  // Each short rail (head/foot cushion) is a single segment with corner gaps.
  // z from -(HH - GAP) to +(HH - GAP) → length = TABLE_H - 2*GAP, center = 0
  const shortLen = TABLE_H - 2 * GAP;  // = 4.5 - 1.1 = 3.4 units

  // Left short rail  (x = -HW - RW/2 = -4.65)
  addRail(-(HW + RW / 2), TY, 0, RW, RH, shortLen);
  // Right short rail (x = +HW + RW/2 = +4.65)
  addRail( (HW + RW / 2), TY, 0, RW, RH, shortLen);
}

// ─── Lamp dimensions ──────────────────────────────────────────────────────
const LAMP_CORD_L = 0.7;  // cord length (short — lamp hangs close to ceiling)
const LAMP_BULB_R = 0.3;  // bulb radius

// ─── Lamp ─────────────────────────────────────────────────────────────────────
/**
 * Creates a single overhead bulb hanging from the ceiling on a short cord,
 * with a point light at the bulb's position, and adds it to the scene.
 * @param {THREE.Scene} scene
 * @returns {{ group: THREE.Group, bulbMesh: THREE.Mesh, light: THREE.PointLight }}
 */
export function createLamp(scene) {
  const group = new THREE.Group();
  group.name  = 'lamp';

  const cordMat = new THREE.MeshStandardMaterial({
    color:     0x222222,
    roughness: 1.0,
    metalness: 0.0,
  });

  // Emissive material — the bulb glows on its own regardless of incoming light.
  const bulbMat = new THREE.MeshStandardMaterial({
    color:             0xfffde8,
    emissive:          new THREE.Color(0xffffcc),
    emissiveIntensity: 2.0,
    roughness:         0.9,
    metalness:         0.0,
  });

  const bulbY = ROOM_H - LAMP_CORD_L - LAMP_BULB_R; // bulb center, hung below the ceiling

  const cordGeo  = new THREE.CylinderGeometry(0.012, 0.012, LAMP_CORD_L, 8);
  const cordMesh = new THREE.Mesh(cordGeo, cordMat);
  cordMesh.position.set(0, ROOM_H - LAMP_CORD_L / 2, 0); // spans from the ceiling down to the bulb
  cordMesh.name = 'lampCord';
  group.add(cordMesh);

  const bulbGeo  = new THREE.SphereGeometry(LAMP_BULB_R, 16, 16);
  const bulbMesh = new THREE.Mesh(bulbGeo, bulbMat);
  bulbMesh.position.set(0, bulbY, 0);
  bulbMesh.name = 'lampBulb';
  group.add(bulbMesh);

  const light = new THREE.PointLight(0xfff5e0, 2.5, 0); // warm white
  light.position.set(0, bulbY, 0);
  group.add(light);

  scene.add(group);
  return { group, bulbMesh, light };
}
