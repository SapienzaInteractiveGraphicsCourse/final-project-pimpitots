/**
 * models.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsibility: Three.js mesh/hierarchy construction and procedural/PBR
 * texture generation. No game logic lives here — purely geometry & materials.
 *
 * Exported:
 *   createRoom(scene, texMap)      → { group }
 *   createTable(scene, texMap)     → { group, surfaceMesh }
 *   createLamp(scene)              → { anchor, bulbMesh, light }
 *
 * Textures consumed here (texMap) are generated in textures.js.
 *
 * Coordinate system: Y-up. Room floor at Y = 0. Table surface at Y = TABLE_SURFACE_Y.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import * as THREE from 'three';
import { TABLE_W, TABLE_H, BALL_RADIUS, POCKET_POSITIONS } from './physics.js';

// ─── Shared Scene-Geometry Constants ─────────────────────────────────────────
export const TABLE_SURFACE_Y = 0.76; // table felt surface height in world space (table "on the floor")
export const BALL_Y          = TABLE_SURFACE_Y + BALL_RADIUS; // ball center Y when resting on felt

// Room dimensions
const ROOM_W = 22;
const ROOM_D = 18;
const ROOM_H = 7.0;

// Table-model-only dimensions (physics.js owns TABLE_W / TABLE_H)
const TABLE_LEG_H = 0.72;  // table leg height (TABLE_SURFACE_Y - table panel thickness ~0.04)
const RAIL_H      = 0.10;  // cushion rail height above felt
const RAIL_W      = 0.30;  // cushion rail width (inward thickness)

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

// ─── Ball Mesh Factory ────────────────────────────────────────────────────────
/**
 * Creates a pool ball Mesh with MeshStandardMaterial.
 * Uses a CanvasTexture for the color/diffuse map and a shared roughness map
 * for subtle specular variation (scuff specks under highlights).
 *
 * @param {string}         color         - CSS color string (e.g. '#e8d96c')
 * @param {number}         number        - ball number (0 = cue ball)
 * @param {Function}       createBallTex - texture factory from textures.js
 * @param {THREE.Texture}  envMap        - optional PMREM env map for reflections
 * @param {THREE.Texture}  roughnessMap  - shared ball roughness map
 * @returns {THREE.Mesh}
 */
export function createBallMesh(color, number, createBallTex, envMap, roughnessMap) {
  const colorTex = createBallTex(number, color);

  const mat = new THREE.MeshStandardMaterial({
    map:             colorTex,
    roughnessMap:    roughnessMap || null,
    roughness:       0.22,   // phenolic resin — shiny but not mirror
    metalness:       0.0,
    envMap:          envMap || null,
    envMapIntensity: 0.6,
  });

  const geo  = new THREE.SphereGeometry(BALL_RADIUS, 32, 32);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow    = true;
  mesh.receiveShadow = false;
  mesh.name = `ball_${number}`;
  return mesh;
}

// ─── Lamp dimensions ──────────────────────────────────────────────────────
const LAMP_CORD_L = 0.7;  // cord length (short — lamp hangs close to ceiling)
const LAMP_BULB_R = 0.3;  // bulb radius

// ─── Lamp ─────────────────────────────────────────────────────────────────────
/**
 * Creates a single overhead bulb hanging from the ceiling on a short cord,
 * with a point light at the bulb's position, and adds it to the scene.
 * The cord and bulb hang from an anchor pivoted at the ceiling attachment
 * point, so rotating the anchor swings the whole fixture as one rigid body.
 * @param {THREE.Scene} scene
 * @returns {{ anchor: THREE.Group, bulbMesh: THREE.Mesh, light: THREE.PointLight }}
 */
export function createLamp(scene) {
  const anchor = new THREE.Group();
  anchor.name  = 'lampAnchor';
  anchor.position.set(0, ROOM_H, 0); // pivot at the ceiling — rotating this swings the fixture

  const cordMat = new THREE.MeshStandardMaterial({
    color:     0x222222,
    roughness: 1.0,
    metalness: 0.0,
  });

  // Emissive material — the bulb glows on its own regardless of incoming light.
  const bulbMat = new THREE.MeshStandardMaterial({
    color:             0xfffde8,
    emissive:          new THREE.Color(0xffffcc),
    emissiveIntensity: 2.0, // matches the value the lamp toggle restores on lamp-on
    roughness:         0.9,
    metalness:         0.0,
  });

  const bulbY = -(LAMP_CORD_L + LAMP_BULB_R); // bulb center, relative to the ceiling anchor

  const cordGeo  = new THREE.CylinderGeometry(0.012, 0.012, LAMP_CORD_L, 8);
  const cordMesh = new THREE.Mesh(cordGeo, cordMat);
  cordMesh.position.set(0, -LAMP_CORD_L / 2, 0); // spans down from the ceiling anchor to the bulb
  cordMesh.name = 'lampCord';
  anchor.add(cordMesh);

  const bulbGeo  = new THREE.SphereGeometry(LAMP_BULB_R, 16, 16);
  const bulbMesh = new THREE.Mesh(bulbGeo, bulbMat);
  bulbMesh.position.set(0, bulbY, 0);
  bulbMesh.name = 'lampBulb';
  anchor.add(bulbMesh);

  const light = new THREE.PointLight(0xfff5e0, 2.5, 0); // warm white
  light.position.set(0, bulbY, 0);
  light.userData.onIntensity = light.intensity; // remembered so the lamp toggle can restore it
  anchor.add(light);

  scene.add(anchor);
  return { anchor, bulbMesh, light };
}
