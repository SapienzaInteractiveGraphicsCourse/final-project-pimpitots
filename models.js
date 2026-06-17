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
    map:          texMap.wall.map,
    normalMap:    texMap.wall.normalMap,
    roughnessMap: texMap.wall.roughnessMap,
    roughness:    0.85,
    metalness:    0.0,
    side:         THREE.BackSide, // render inside faces of the room box
  });

  const floorMat = new THREE.MeshStandardMaterial({
    map:          texMap.floor.map,
    normalMap:    texMap.floor.normalMap,
    roughnessMap: texMap.floor.roughnessMap,
    aoMap:        texMap.floor.aoMap,
    roughness:    0.8,
    metalness:    0.0,
  });

  // Room is a large box — we render its inside faces.
  // Face index 1 (-X, left wall) uses an invisible material so the background
  // shows through the window hole cut into the replacement left-wall planes below.
  const invisMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
  const roomGeo  = new THREE.BoxGeometry(ROOM_W, ROOM_H, ROOM_D);
  // BoxGeometry face order: 0=+X, 1=-X, 2=+Y, 3=-Y, 4=+Z, 5=-Z
  const roomMesh = new THREE.Mesh(roomGeo, [wallMat, invisMat, wallMat, wallMat, wallMat, wallMat]);
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

  // ── Skirting boards ──────────────────────────────────────────────────────
  // Dark wood strip running around the base of all four walls.
  const SK_H = 0.20;  // height
  const SK_D = 0.04;  // protrusion from wall

  const skirtMat = new THREE.MeshStandardMaterial({
    color:     0x1a1008,  // near-black dark mahogany
    roughness: 0.6,
    metalness: 0.0,
  });

  // Each entry: [boxWidth, boxDepth, centerX, centerZ, rotationY]
  const skirtDefs = [
    [ROOM_W,              SK_D, 0,                     -(ROOM_D / 2 - SK_D / 2), 0           ],  // front  (−Z)
    [ROOM_W,              SK_D, 0,                      (ROOM_D / 2 - SK_D / 2), 0           ],  // back   (+Z)
    [ROOM_D - SK_D * 2,   SK_D, -(ROOM_W / 2 - SK_D / 2), 0,                    Math.PI / 2 ],  // left   (−X)
    [ROOM_D - SK_D * 2,   SK_D,  (ROOM_W / 2 - SK_D / 2), 0,                    Math.PI / 2 ],  // right  (+X)
  ];

  for (const [w, d, x, z, ry] of skirtDefs) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, SK_H, d), skirtMat);
    mesh.position.set(x, SK_H / 2, z);
    mesh.rotation.y    = ry;
    mesh.receiveShadow = true;
    mesh.castShadow    = true;
    mesh.name          = 'skirting';
    group.add(mesh);
  }

  // ── Window on left wall (x = -ROOM_W/2) ────────────────────────────────
  const WIN_W  = 4.4;   // frame opening width  (Z-axis)
  const WIN_H  = 2.4;   // frame opening height (Y-axis)
  const WIN_CY = 3.4;   // center height above floor
  const WIN_CZ = 1.5;   // center Z along the left wall

  const WALL_X = -(ROOM_W / 2);

  // Left wall rebuilt as 4 planes with a window-sized hole so scene.background
  // (the night sky) shows through naturally with real parallax.
  const FT      = 0.06;   // frame bar thickness — also used for hole sizing below
  const HOLE_W  = WIN_W + FT * 2 + 0.04;   // hole slightly wider than outer frame
  const HOLE_H  = WIN_H + FT * 2 + 0.04;
  const zL = WIN_CZ - HOLE_W / 2;           // hole left  Z edge
  const zR = WIN_CZ + HOLE_W / 2;           // hole right Z edge
  const yB = WIN_CY - HOLE_H / 2;           // hole bottom Y
  const yT = WIN_CY + HOLE_H / 2;           // hole top    Y

  const leftWallMat = wallMat.clone();
  leftWallMat.side = THREE.FrontSide;  // planes face +X (into room)

  // [planeWidth(Z), planeHeight(Y), centerZ, centerY]
  const wallPieces = [
    [zL + ROOM_D / 2,      ROOM_H,           (-ROOM_D / 2 + zL) / 2, ROOM_H / 2],  // left of hole
    [ROOM_D / 2 - zR,      ROOM_H,           (zR + ROOM_D / 2) / 2,  ROOM_H / 2],  // right of hole
    [HOLE_W,               ROOM_H - yT,      WIN_CZ,                  (yT + ROOM_H) / 2], // above hole
    [HOLE_W,               yB,               WIN_CZ,                  yB / 2],            // below hole
  ];
  wallPieces.forEach(([w, h, cz, cy]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), leftWallMat);
    m.rotation.y = Math.PI / 2;
    m.position.set(WALL_X + 0.001, cy, cz);
    m.receiveShadow = true;
    m.name = 'leftWallPane';
    group.add(m);
  });

  // ── Window reveal — 4 inner faces of the wall tunnel ────────────────────
  const REVEAL_D = 0.22;  // wall thickness shown (depth of tunnel in X)
  const revealMat = leftWallMat.clone();
  revealMat.side = THREE.DoubleSide;

  [
    // [geo_w, geo_h, rx, ry, px, py, pz]
    [REVEAL_D, HOLE_W,  Math.PI / 2,  0, WALL_X + REVEAL_D / 2, yT, WIN_CZ],   // top face
    [REVEAL_D, HOLE_W, -Math.PI / 2,  0, WALL_X + REVEAL_D / 2, yB, WIN_CZ],   // bottom face
    [REVEAL_D, HOLE_H,  0,            0, WALL_X + REVEAL_D / 2, WIN_CY, zL],    // left side
    [REVEAL_D, HOLE_H,  0,  Math.PI,   WALL_X + REVEAL_D / 2, WIN_CY, zR],     // right side
  ].forEach(([gw, gh, rx, ry, px, py, pz]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), revealMat);
    m.rotation.x = rx;
    m.rotation.y = ry;
    m.position.set(px, py, pz);
    m.receiveShadow = true;
    m.name = 'windowReveal';
    group.add(m);
  });

  // Glass pane — MeshPhysicalMaterial for Fresnel reflections via scene.environment
  const glassMat = new THREE.MeshPhysicalMaterial({
    color:           0xaaccee,
    transparent:     true,
    opacity:         0.15,
    roughness:       0.0,
    metalness:       0.0,
    reflectivity:    0.9,
    envMapIntensity: 1.5,
    side:            THREE.DoubleSide,
  });
  const glassMesh = new THREE.Mesh(new THREE.PlaneGeometry(WIN_W, WIN_H), glassMat);
  glassMesh.rotation.y = Math.PI / 2;
  glassMesh.position.set(WALL_X + 0.03, WIN_CY, WIN_CZ);
  glassMesh.name = 'windowGlass';
  group.add(glassMesh);

  // Frame — same wood PBR texture as the table rails
  const frameMat = new THREE.MeshStandardMaterial({
    map:          texMap.wood.map,
    normalMap:    texMap.wood.normalMap,
    roughnessMap: texMap.wood.roughnessMap,
    roughness:    0.8,
    metalness:    0.0,
  });
  const FD = 0.07;   // depth protruding from wall in +X
  const FX = WALL_X + FD / 2;
  [
    [FD, FT,           WIN_W + FT*2, FX, WIN_CY + WIN_H/2 + FT/2, WIN_CZ],  // top
    [FD, FT,           WIN_W + FT*2, FX, WIN_CY - WIN_H/2 - FT/2, WIN_CZ],  // bottom
    [FD, WIN_H + FT*2, FT,           FX, WIN_CY, WIN_CZ - WIN_W/2 - FT/2],  // left side
    [FD, WIN_H + FT*2, FT,           FX, WIN_CY, WIN_CZ + WIN_W/2 + FT/2],  // right side
    [FD, FT,           WIN_W,        FX, WIN_CY, WIN_CZ],                    // horizontal divider
    [FD, WIN_H,        FT,           FX, WIN_CY, WIN_CZ],                    // vertical divider
  ].forEach(([gx, gy, gz, px, py, pz]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(gx, gy, gz), frameMat);
    m.position.set(px, py, pz);
    m.receiveShadow = true;
    m.name = 'windowFrame';
    group.add(m);
  });

  // Diffuse moonlight coming through the window
  const moonLight = new THREE.PointLight(0x8899cc, 0.12, 18);
  moonLight.position.set(WALL_X + 0.6, WIN_CY + 0.2, WIN_CZ);
  group.add(moonLight);

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

// ─── Cue Stick ────────────────────────────────────────────────────────────────

// Cue dimensions (scene units)
const CUE_TIP_R   = 0.025;  // tip radius (narrow end)
const CUE_TIP_L   = 0.08;   // tip section length
const CUE_SHAFT_R = 0.028;  // shaft radius
const CUE_SHAFT_L = 2.8;    // shaft section length
const CUE_GRIP_R  = 0.040;  // grip radius (wider end)
const CUE_GRIP_L  = 1.4;    // grip section length

/**
 * Creates the cue stick as a parent-child hierarchy and adds it to the scene.
 *
 * Scene graph:
 *   cueRoot  (Object3D — pivot at cue ball centre; rotate Y to aim)
 *     └─ cueGroup (Object3D — reserved for charge/strike slide along local X)
 *          ├─ tipMesh   (reddish-brown leather tip)
 *          ├─ shaftMesh (blonde tapered shaft)
 *          └─ gripMesh  (dark mahogany grip)
 *
 * All three sections extend along cueRoot's local +X axis.
 * Tip is just touching the ball surface at X = BALL_RADIUS.
 *
 * @param {THREE.Scene} scene
 * @returns {{ root: THREE.Object3D, group: THREE.Object3D, tipMesh: THREE.Mesh, shaftMesh: THREE.Mesh, gripMesh: THREE.Mesh }}
 */
export function createCueStick(scene) {
  // ── Materials ──
  const tipMat = new THREE.MeshStandardMaterial({
    color:     0xcc4400,  // leather tip — reddish-brown
    roughness: 0.7,
    metalness: 0.0,
  });
  const shaftMat = new THREE.MeshStandardMaterial({
    color:     0xf5e8c0,  // blonde wood shaft
    roughness: 0.35,
    metalness: 0.0,
  });
  const gripMat = new THREE.MeshStandardMaterial({
    color:     0x3b1a0a,  // dark mahogany grip
    roughness: 0.65,
    metalness: 0.0,
  });

  // ── Geometries ──
  // CylinderGeometry is built along local Y; rotation.z = π/2 lays it along X.
  const tipGeo   = new THREE.CylinderGeometry(CUE_TIP_R,   CUE_TIP_R,   CUE_TIP_L,   12);
  const shaftGeo = new THREE.CylinderGeometry(CUE_SHAFT_R, CUE_TIP_R,   CUE_SHAFT_L, 12); // tapers tip→shaft
  const gripGeo  = new THREE.CylinderGeometry(CUE_GRIP_R,  CUE_SHAFT_R, CUE_GRIP_L,  12); // tapers shaft→grip

  // ── Meshes ──
  const tipMesh   = new THREE.Mesh(tipGeo,   tipMat);
  const shaftMesh = new THREE.Mesh(shaftGeo, shaftMat);
  const gripMesh  = new THREE.Mesh(gripGeo,  gripMat);

  // Rotate to lie along +X
  const R90 = Math.PI / 2;
  tipMesh.rotation.z   = R90;
  shaftMesh.rotation.z = R90;
  gripMesh.rotation.z  = R90;

  // Position along X — each section's centre offset from origin
  tipMesh.position.x   = BALL_RADIUS + CUE_TIP_L / 2;
  shaftMesh.position.x = BALL_RADIUS + CUE_TIP_L + CUE_SHAFT_L / 2;
  gripMesh.position.x  = BALL_RADIUS + CUE_TIP_L + CUE_SHAFT_L + CUE_GRIP_L / 2;

  tipMesh.castShadow   = true;
  shaftMesh.castShadow = true;
  gripMesh.castShadow  = true;

  // ── Hierarchy ──
  const cueGroup = new THREE.Object3D();
  cueGroup.name  = 'cueGroup';
  cueGroup.add(tipMesh, shaftMesh, gripMesh);

  const cueRoot = new THREE.Object3D();
  cueRoot.name  = 'cueRoot';
  cueRoot.add(cueGroup);

  cueRoot.visible = false; // shown once balls are spawned
  scene.add(cueRoot);

  return { root: cueRoot, group: cueGroup, tipMesh, shaftMesh, gripMesh };
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
