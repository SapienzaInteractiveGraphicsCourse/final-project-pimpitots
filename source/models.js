/**
 * models.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsibility: Three.js mesh/hierarchy construction and procedural/PBR
 * texture generation. No game logic lives here — purely geometry & materials.
 *
 * Exported:
 *   createRoom(scene, texMap)      → { group }
 *   createTable(scene, texMap)     → { group, surfaceMesh }
 *   createLamp(scene)              → { anchor, bulbMeshes, lights }
 *
 * Textures consumed here (texMap) are generated in textures.js.
 *
 * Coordinate system: Y-up. Room floor at Y = 0. Table surface at Y = TABLE_SURFACE_Y.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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
const RAIL_H      = 0.18;  // cushion rail height above felt
const RAIL_W      = 0.52;  // cushion rail width (inward thickness)
const POCKET_GAP  = 0.45;  // clearance per pocket opening (per rail side)

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
  // Face index 1 (-X, left wall) uses invisMat so the window hole shows through.
  const invisMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
  const roomGeo  = new THREE.BoxGeometry(ROOM_W, ROOM_H, ROOM_D);
  // BoxGeometry face order: 0=+X, 1=-X, 2=+Y, 3=-Y, 4=+Z, 5=-Z
  const roomMesh = new THREE.Mesh(roomGeo, [wallMat, invisMat, wallMat, wallMat, wallMat, wallMat]);
  roomMesh.position.set(0, ROOM_H / 2, 0);
  roomMesh.name = 'roomBox';
  // Three.js shadow bias is inverted
  // for BackSide faces, producing large black artifacts on the ceiling.
  // Wall shadow reception is handled by the separate floor plane instead.
  group.add(roomMesh);
  roomMesh.receiveShadow = true;

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
    map:          texMap.wood020.map,
    normalMap:    texMap.wood020.normalMap,
    roughnessMap: texMap.wood020.roughnessMap,
    roughness:    0.8,
    metalness:    0.0,
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
    [zL + ROOM_D / 2,      ROOM_H,           (-ROOM_D / 2 + zL) / 2, ROOM_H / 2],         // left of hole
    [ROOM_D / 2 - zR,      ROOM_H,           (zR + ROOM_D / 2) / 2,  ROOM_H / 2],         // right of hole
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
    opacity:         0.1,
    roughness:       0.0,
    metalness:       0.1,
    reflectivity:    0.9,
    envMapIntensity: 1.5,
    side:            THREE.DoubleSide,
  });
  const glassMesh = new THREE.Mesh(new THREE.PlaneGeometry(WIN_W, WIN_H), glassMat);
  glassMesh.rotation.y = Math.PI / 2;
  glassMesh.position.set(WALL_X + 0.03, WIN_CY, WIN_CZ);
  glassMesh.name = 'windowGlass';
  group.add(glassMesh);

  const frameMat = new THREE.MeshStandardMaterial({
    map:          texMap.wood020.map,
    normalMap:    texMap.wood020.normalMap,
    roughnessMap: texMap.wood020.roughnessMap,
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
  const moonLight = new THREE.PointLight(0x8899cc, 0.12, 0, 0);
  moonLight.position.set(WALL_X + 0.6, WIN_CY + 0.2, WIN_CZ);
  group.add(moonLight);

  // ── Door on right wall (x = +ROOM_W/2) ────────────────────────────────
  const DOOR_CZ = 1.5;   // centre Z — mirrors the window on the opposite wall
  const RIGHT_X = ROOM_W / 2;

  const doorLoader = new GLTFLoader();
  doorLoader.load('./blender_assets/door.glb', (gltf) => {
    const model = gltf.scene;

    const box  = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());

    const TARGET_H = 4.4;          // height in scene units (~4.4 m — fits the room)
    const TARGET_W = TARGET_H / 1.8; // door ratio: ~1.8:1 height-to-width ≈ 2.4 units wide

    // Scale height uniformly, then independently widen the horizontal axis
    // (local X is the door's width axis for a standard glTF door export)
    model.scale.set(TARGET_W / size.x, TARGET_H / size.y, TARGET_H / size.y);

    // Drop flush to floor
    const scaledBox = new THREE.Box3().setFromObject(model);
    model.position.y -= scaledBox.min.y;

    model.traverse((child) => {
      if (child.isMesh && child.material) {
        child.castShadow    = true;
        child.receiveShadow = true;

        // Brighten the dark-stained wood so it reads in the dim room:
        // lift the base color, boost environment response, and add a faint
        // self-illumination from its own texture so it never falls to black.
        for (const mat of Array.isArray(child.material) ? child.material : [child.material]) {
          mat.color?.multiplyScalar(1.8);
          mat.envMapIntensity = 2.0;
          if (mat.map) {
            mat.emissiveMap       = mat.map;
            mat.emissive          = new THREE.Color(0xffffff);
            mat.emissiveIntensity = 0.18;
          }
          mat.needsUpdate = true;
        }
      }
    });

    // Face into the room (toward -X), flush against right wall
    model.rotation.y = Math.PI / 2;
    const rotBox = new THREE.Box3().setFromObject(model);
    model.position.x = RIGHT_X - rotBox.getSize(new THREE.Vector3()).x / 2;
    model.position.z = DOOR_CZ;

    group.add(model);
  }, undefined, (err) => {
    console.error('[door.glb] load error:', err);
  });

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
  _buildRails(group, bodyMat);

  // ── Pocket holes (depth cylinders + corner/side structure) ──────────
  _buildPockets(group, bodyMat);


  // ── Legs — turned wood profile (LatheGeometry) ───────────────────────
  // Clone wood texture so we can set a leg-specific UV repeat without
  // affecting the rail/body material that shares the same texture object.
  const legDiffTex = texMap.wood.map.clone();
  legDiffTex.repeat.set(1, 2);
  legDiffTex.needsUpdate = true;
  const legRoughTex = texMap.wood.roughnessMap.clone();
  legRoughTex.repeat.set(1, 2);
  legRoughTex.needsUpdate = true;

  const legMat = new THREE.MeshStandardMaterial({
    map:          legDiffTex,
    normalMap:    texMap.wood.normalMap,
    roughnessMap: legRoughTex,
    roughness:    0.65,
    metalness:         0.05,
  });

  // Classic billiard-table turned leg: wide foot pad → tapered ankle → straight
  // shaft → decorative upper swell → flared capital connecting to frame apron.
  const legProfile = [
    new THREE.Vector2(0.136, 0.000),  // foot pad — widest point at floor
    new THREE.Vector2(0.120, 0.028),  // foot taper up
    new THREE.Vector2(0.068, 0.075),  // ankle
    new THREE.Vector2(0.057, 0.160),  // lower shaft
    new THREE.Vector2(0.052, 0.460),  // shaft mid
    new THREE.Vector2(0.060, 0.540),  // upper swell begins
    new THREE.Vector2(0.078, 0.590),  // decorative bead
    new THREE.Vector2(0.064, 0.630),  // neck
    new THREE.Vector2(0.109, 0.690),  // capital flare
    new THREE.Vector2(0.120, 0.720),  // capital top — meets frame
  ];

  const legGeo = new THREE.LatheGeometry(legProfile, 20);

  // Position at outer corners of the frame apron (RAIL_W extends beyond TABLE_W/2)
  const LEG_X = TABLE_W / 2 + RAIL_W * 0.5;
  const LEG_Z = TABLE_H / 2 + RAIL_W * 0.5;

  for (const [lx, lz] of [[-LEG_X, LEG_Z], [LEG_X, LEG_Z], [-LEG_X, -LEG_Z], [LEG_X, -LEG_Z]]) {
    const legMesh = new THREE.Mesh(legGeo, legMat);
    legMesh.position.set(lx, 0, lz);
    legMesh.castShadow    = true;
    legMesh.receiveShadow = true;
    legMesh.name = 'leg';
    group.add(legMesh);
  }

  scene.add(group);
  return { group, surfaceMesh };
}

// ─── Rail builder ─────────────────────────────────────────────────────────────

function _buildRails(group, mat) {
  const RH  = RAIL_H;
  const RW  = RAIL_W;
  const TY  = TABLE_SURFACE_Y + RH / 2;
  const HW  = TABLE_W / 2;
  const HH  = TABLE_H / 2;
  const GAP = POCKET_GAP;

  function addRail(px, py, pz, sx, sy, sz) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set(px, py, pz);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    mesh.name          = 'rail';
    group.add(mesh);
  }

  // Long rails (parallel to X), split into two segments at the middle pocket gap
  const longLen = HW - 2 * GAP;
  const cx_L    = -(HW / 2);
  const cx_R    =  (HW / 2);

  addRail(cx_L, TY, -(HH + RW / 2), longLen, RH, RW);
  addRail(cx_R, TY, -(HH + RW / 2), longLen, RH, RW);
  addRail(cx_L, TY,  (HH + RW / 2), longLen, RH, RW);
  addRail(cx_R, TY,  (HH + RW / 2), longLen, RH, RW);

  // Short rails (parallel to Z), single segment with corner gaps
  const shortLen = TABLE_H - 2 * GAP;

  addRail(-(HW + RW / 2), TY, 0, RW, RH, shortLen);
  addRail( (HW + RW / 2), TY, 0, RW, RH, shortLen);
}

// ─── Pocket helpers ───────────────────────────────────────────────────────────

function _buildPockets(group, woodMat) {
  const SY             = TABLE_SURFACE_Y;
  const HOLE_R = 0.32;   // matches POCKET_RADIUS in physics.js
  const DEPTH  = 0.20;

  const holeMat = new THREE.MeshStandardMaterial({
    color:     0x060606,
    roughness: 1.0,
    metalness: 0.0,
  });

  for (const [px, pz] of POCKET_POSITIONS) {
    // Visual mouth sits exactly at the physics capture point. The middle
    // pockets' outward shift into the rail now lives in POCKET_POSITIONS
    // (physics.js) so the two can never drift apart.
    const vx = px;
    const vz = pz;

    // Dark disc flush with felt — pocket mouth
    const disc = new THREE.Mesh(new THREE.CircleGeometry(HOLE_R, 24), holeMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(vx, SY + 0.001, vz);
    disc.name = 'pocket_disc';
    group.add(disc);

    // Tapered open cylinder — depth illusion when viewed at an angle
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(HOLE_R, HOLE_R * 0.75, DEPTH, 20, 1, true),
      holeMat
    );
    cyl.position.set(vx, SY - DEPTH / 2, vz);
    cyl.name = 'pocket_cyl';
    group.add(cyl);

    // Bottom cap so the pocket doesn't look hollow from steep angles
    const cap = new THREE.Mesh(new THREE.CircleGeometry(HOLE_R * 0.75, 20), holeMat);
    cap.rotation.x = -Math.PI / 2;
    cap.position.set(vx, SY - DEPTH, vz);
    cap.name = 'pocket_cap';
    group.add(cap);

  }
}

// ─── Cue Stick ────────────────────────────────────────────────────────────────

// Cue dimensions (scene units)
const CUE_TIP_R   = 0.025;  // tip radius (narrow end)
const CUE_TIP_L   = 0.08;   // tip section length
const CUE_SHAFT_R = 0.028;  // shaft radius
const CUE_SHAFT_L = 2.8;    // shaft section length
const CUE_GRIP_R  = 0.040;  // grip radius (wider end)
const CUE_GRIP_L  = 1.4;    // grip section length

// How far the stick body extends from the cue-ball centre along +X (tip base
// sits at BALL_RADIUS, grip end at the far tip). Consumed by main.js to decide
// which other balls lie under the stick when aiming.
export const CUE_REACH   = BALL_RADIUS + CUE_TIP_L + CUE_SHAFT_L + CUE_GRIP_L;
// Effective cue half-thickness (widest section + a small visual margin) used
// when testing whether the stick would pierce another ball during aiming.
export const CUE_CLEAR_R = CUE_GRIP_R + 0.02;

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
// Assumption: a real billiard ball is two optical layers — a pigmented phenolic
// resin core under a separate polished lacquer top-coat — so the ball material
// uses MeshPhysicalMaterial's clearcoat lobe to reproduce that construction
// instead of sourcing an external high-resolution PBR image set. An image set
// would fix one texture per physical asset, which doesn't fit a ball whose
// color and number are chosen per-instance from createBallTex; the clearcoat
// layer reproduces the polished-resin look on top of that existing per-ball
// texture pipeline.
/**
 * Creates a pool ball Mesh with MeshPhysicalMaterial.
 * Uses a CanvasTexture for the color/diffuse map and a shared roughness map
 * for subtle specular variation (scuff specks under highlights), plus a
 * clearcoat lobe for the glossy lacquer finish of a real resin ball.
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

  const mat = new THREE.MeshPhysicalMaterial({
    map:                colorTex,
    roughnessMap:       roughnessMap || null,
    roughness:          0.15,   // pigmented resin core — glossy, fine scuff variation from roughnessMap
    metalness:          0.0,    // resin is a dielectric, never metallic
    clearcoat:          1.0,    // full polished lacquer top-coat, as on a real billiard ball
    clearcoatRoughness: 0.05,   // near-mirror clearcoat — tight, bright specular highlights
    envMap:             envMap || null,
    envMapIntensity:    0.8,
  });

  // 32x32 segments already keep per-face deviation from a true sphere under a
  // millimeter at this radius — invisible at any camera distance used in the
  // scene, so the silhouette reads as perfectly round without spending extra
  // triangles on smoothness that can't be seen.
  const geo  = new THREE.SphereGeometry(BALL_RADIUS, 32, 32);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow    = true;
  mesh.receiveShadow = false;
  mesh.name = `ball_${number}`;
  return mesh;
}

// ─── Lamp dimensions (3-shade pool-table light bar, hung on two chains) ──────
const LAMP_CHAIN_L     = 1.0;   // chain length from the ceiling anchor down to the bar
const LAMP_BAR_LEN     = 7.0;   // horizontal bar length (spans most of the table's long axis)
const LAMP_BAR_R       = 0.035; // bar radius
const LAMP_MOUNT_R     = 0.07;  // ceiling mount cap radius
const LAMP_MOUNT_H     = 0.05;  // ceiling mount cap height
const LAMP_FINIAL_R    = 0.06;  // decorative end-cap sphere radius (bar ends)
const LAMP_SHADE_INSET = 0.8;   // distance from each bar end to its nearest shade
const LAMP_SOCKET_L    = 0.12;  // socket (bar-to-shade connector) length
const LAMP_SOCKET_R    = 0.045; // socket radius
const LAMP_SHADE_R     = 0.38;  // shade dome radius
const LAMP_TRIM_TUBE   = 0.015; // shade rim trim-ring tube radius
const LAMP_BULB_R      = 0.09;  // bulb radius (visible inside each shade)

// ─── Lamp ─────────────────────────────────────────────────────────────────────
/**
 * Creates the overhead pool-table light fixture — a horizontal brass bar
 * carrying three green-shaded pendant lamps, suspended from the ceiling on
 * two chains — and adds it to the scene.
 *
 * The two ceiling mounts sit at local (±halfBar, 0, 0) — exactly on the
 * anchor's local X axis (y = z = 0) — so rotating the anchor about X leaves
 * the mounts fixed in place while the chains, bar, and all three shades
 * (which all have nonzero local y) swing together below them as one rigid
 * body. This is what makes the swing visibly pivot right where the chains
 * meet the ceiling, exactly like a real trapeze-style hanging fixture.
 *
 * @param {THREE.Scene} scene
 * @returns {{ anchor: THREE.Group, bulbMeshes: THREE.Mesh[], lights: THREE.PointLight[] }}
 */
export function createLamp(scene) {
  const anchor = new THREE.Group();
  anchor.name  = 'lampAnchor';
  anchor.position.set(0, ROOM_H, 0); // pivot at the ceiling — rotating this swings the fixture

  // ── Materials ──
  const goldMat = new THREE.MeshStandardMaterial({
    color:     0xd4af37, // brass/gold hardware
    roughness: 0.3,
    metalness: 0.8,
  });

  const shadeOuterMat = new THREE.MeshStandardMaterial({
    color:     0x1d6b35, // same baize green as the table felt base coat (textures.js)
    roughness: 0.35,
    metalness: 0.35,
  });

  const shadeInnerMat = new THREE.MeshStandardMaterial({
    color:     0xf2efe6,
    roughness: 0.7,
    metalness: 0.0,
    side:      THREE.BackSide, // visible looking up into the shade through its open underside
  });

  // Emissive material — each bulb glows on its own regardless of incoming light.
  const bulbMat = new THREE.MeshStandardMaterial({
    color:             0xfffde8,
    emissive:          new THREE.Color(0xffffcc),
    emissiveIntensity: 2.0, // matches the value the lamp toggle restores on lamp-on
    roughness:         0.9,
    metalness:         0.0,
  });

  const halfBar = LAMP_BAR_LEN / 2;
  const barY    = -LAMP_CHAIN_L; // bar center, relative to the ceiling anchor

  // ── Ceiling mounts — at y = z = 0, exactly on the anchor's rotation axis ──
  const mountGeo = new THREE.CylinderGeometry(LAMP_MOUNT_R, LAMP_MOUNT_R, LAMP_MOUNT_H, 16);
  for (const mx of [-halfBar, halfBar]) {
    const mountMesh = new THREE.Mesh(mountGeo, goldMat);
    mountMesh.position.set(mx, -LAMP_MOUNT_H / 2, 0);
    mountMesh.name = 'lampMount';
    anchor.add(mountMesh);
  }

  // ── Chains — two, one per mount, spanning from the ceiling down to the bar ──
  for (const cx of [-halfBar, halfBar]) {
    const chain = _createChainLinks(LAMP_CHAIN_L, goldMat);
    chain.position.set(cx, 0, 0);
    chain.name = 'lampChain';
    anchor.add(chain);
  }

  // ── Horizontal bar ──
  const barGeo  = new THREE.CylinderGeometry(LAMP_BAR_R, LAMP_BAR_R, LAMP_BAR_LEN, 12);
  const barMesh = new THREE.Mesh(barGeo, goldMat);
  barMesh.rotation.z = Math.PI / 2; // lay the cylinder along X
  barMesh.position.set(0, barY, 0);
  barMesh.name = 'lampBar';
  anchor.add(barMesh);

  // ── Decorative finials at the bar's two ends ──
  const finialGeo = new THREE.SphereGeometry(LAMP_FINIAL_R, 12, 12);
  for (const fx of [-halfBar, halfBar]) {
    const finialMesh = new THREE.Mesh(finialGeo, goldMat);
    finialMesh.position.set(fx, barY, 0);
    finialMesh.name = 'lampFinial';
    anchor.add(finialMesh);
  }

  // ── Three pendant shades, evenly spaced along the bar ──
  const shadeXs     = [-(halfBar - LAMP_SHADE_INSET), 0, (halfBar - LAMP_SHADE_INSET)];
  const bulbMeshes  = [];
  const lights      = [];

  for (const sx of shadeXs) {
    // Socket — connects the bar to the shade
    const socketGeo  = new THREE.CylinderGeometry(LAMP_SOCKET_R, LAMP_SOCKET_R, LAMP_SOCKET_L, 12);
    const socketMesh = new THREE.Mesh(socketGeo, goldMat);
    socketMesh.position.set(sx, barY - LAMP_SOCKET_L / 2, 0);
    socketMesh.name = 'lampSocket';
    anchor.add(socketMesh);

    const domeApexY   = barY - LAMP_SOCKET_L;        // where the dome's rounded top meets the socket
    const shadeCenterY = domeApexY - LAMP_SHADE_R;    // sphere-geometry origin for the hemisphere meshes

    // Outer green dome — upper hemisphere (thetaLength = PI/2), open at the bottom.
    // It wraps fully around its own bulb on every side except that open rim, so
    // casting a shadow from it blocks its own bulb's light from leaking sideways
    // into the other two shades (see castShadow on the light below).
    const shadeGeo  = new THREE.SphereGeometry(LAMP_SHADE_R, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const shadeMesh = new THREE.Mesh(shadeGeo, shadeOuterMat);
    shadeMesh.position.set(sx, shadeCenterY, 0);
    shadeMesh.name = 'lampShade';
    anchor.add(shadeMesh);

    // Inner white liner — slightly smaller, visible from below through the open rim
    const linerGeo  = new THREE.SphereGeometry(LAMP_SHADE_R * 0.92, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const linerMesh = new THREE.Mesh(linerGeo, shadeInnerMat);
    linerMesh.position.set(sx, shadeCenterY, 0);
    linerMesh.name = 'lampShadeLiner';
    anchor.add(linerMesh);

    // Trim ring at the shade's open rim (rim sits at the hemisphere's local y = 0)
    const trimGeo  = new THREE.TorusGeometry(LAMP_SHADE_R, LAMP_TRIM_TUBE, 8, 24);
    const trimMesh = new THREE.Mesh(trimGeo, goldMat);
    trimMesh.rotation.x = Math.PI / 2; // lie flat (horizontal ring)
    trimMesh.position.set(sx, shadeCenterY, 0);
    trimMesh.name = 'lampTrim';
    anchor.add(trimMesh);

    // Bulb — small emissive sphere hanging inside the shade, just above the rim
    const bulbY    = shadeCenterY + LAMP_SHADE_R * 0.3;
    const bulbGeo  = new THREE.SphereGeometry(LAMP_BULB_R, 12, 12);
    const bulbMesh = new THREE.Mesh(bulbGeo, bulbMat);
    bulbMesh.position.set(sx, bulbY, 0);
    bulbMesh.name = 'lampBulb';
    anchor.add(bulbMesh);
    bulbMeshes.push(bulbMesh);

  
    
    const light = new THREE.PointLight(0xfff5e0, 1.0, 30, 1.5); // warm white
    light.shadow.mapSize.width = 1024;  // Fixes the jagged, pixelated edges
    light.shadow.mapSize.height = 1024;
    light.position.set(sx, bulbY, 0);
    light.castShadow = true;
    light.shadow.camera.near = 0.05; // default 0.5 would clip the dome wall (radius 0.38) out of the shadow map entirely
    light.shadow.bias = -0.0001; // Assumption: small negative bias to avoid self-shadowing acne on the curved dome at this scale; may need empirical retuning
    light.shadow.normalBias = 0.0;     // Prevents shadow acne on the curved sphere
    light.shadow.camera.updateProjectionMatrix();
    light.userData.onIntensity = light.intensity; // remembered so the lamp toggle can restore it
    anchor.add(light);
    lights.push(light);
  }

  scene.add(anchor);
  return { anchor, bulbMeshes, lights };
}

/**
 * Builds a short vertical chain as a stack of alternating ring links — every
 * other link is rotated 90° about Y from its neighbour, so the chain reads
 * as interlocked rather than as identical stacked rings. Returns a Group
 * spanning from local y = 0 (top, ceiling end) down to y = -length (bottom,
 * bar end); the caller positions the group itself.
 * @param {number} length - total chain length
 * @param {THREE.Material} mat
 * @returns {THREE.Group}
 */
function _createChainLinks(length, mat) {
  const group       = new THREE.Group();
  const linkCount   = 8;
  const linkSpacing = length / linkCount;
  const linkR       = linkSpacing * 0.42;
  const linkTube    = linkSpacing * 0.14;
  const linkGeo     = new THREE.TorusGeometry(linkR, linkTube, 6, 12);

  for (let i = 0; i < linkCount; i++) {
    const link = new THREE.Mesh(linkGeo, mat);
    link.position.y = -linkSpacing * (i + 0.5);
    if (i % 2 === 1) link.rotation.y = Math.PI / 2; // alternate plane for an interlocked look
    link.name = 'chainLink';
    group.add(link);
  }
  return group;
}

// ─── Lounge Corner (couch + coffee table, modeled in Blender) ─────────────────
/**
 * Loads the Blender-authored "lounge corner" model (couch + round coffee
 * table, exported as a single .glb with embedded textures) and places it in
 * the back-left corner of the room, away from the pool table footprint.
 *
 * The GLB is loaded asynchronously; the group is added to the scene
 * immediately so callers don't need to wait for the load to complete.
 *
 * @param {THREE.Scene} scene
 * @returns {{ group: THREE.Group }}
 */
export function createLoungeCorner(scene) {
  const group  = new THREE.Group();
  group.name   = 'loungeCorner';

  const loader = new GLTFLoader();
  loader.load('./blender_assets/lounge_corner.glb', (gltf) => {
    const model = gltf.scene;

    // Normalize scale — target a realistic ~6-unit couch width in scene units.
    const box   = new THREE.Box3().setFromObject(model);
    const size  = box.getSize(new THREE.Vector3());
    const scale = 6.0 / Math.max(size.x, size.z);
    model.scale.setScalar(scale);

    // Re-measure after scaling and drop the model flush onto the floor (y = 0).
    const scaledBox = new THREE.Box3().setFromObject(model);
    model.position.y -= scaledBox.min.y;

    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow    = true;
        child.receiveShadow = true;
      }
    });

    // Back-left corner of the room, rotated to face into the room.
    model.rotation.y = Math.PI / 2;
    model.position.x = -ROOM_W / 2 + 3.5;
    model.position.z = -ROOM_D / 2 + 2;

    group.add(model);
  }, undefined, (err) => {
    console.error('[lounge_corner.glb] load error:', err);
  });

  scene.add(group);
  return { group };
}

// ─── Wall Painting (single .glb, framed) ──────────────────────────────────────
/**
 * Loads the framed painting and hangs it on the front wall (-Z), above the
 * lounge couch. The model is authored lying face-up (thin axis = Y, image
 * normal +Y), so a +90° X rotation stands it up with the image facing +Z
 * (into the room).
 *
 * @param {THREE.Scene} scene
 * @returns {{ group: THREE.Group }}
 */
export function createPainting(scene) {
  const group = new THREE.Group();
  group.name  = 'painting';

  const TARGET_W = 6;             // painting width in scene units
  const PAINT_X  = -7.5;            // centred above the couch (same X as the lounge corner)
  const PAINT_CY = 4.5;             // centre height on the wall
  const WALL_Z   = -ROOM_D / 2;     // front wall

  const loader = new GLTFLoader();
  loader.load('./blender_assets/painting1.glb', (gltf) => {
    const model = gltf.scene;

    // Scale to target width (X is the painting's width axis natively).
    const box  = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.scale.setScalar(TARGET_W / size.x);

    model.traverse((child) => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        const matName = (mats[0]?.name || '').toLowerCase();

        // The model ships a thin "glass" pane (material "Bfx.Mat.glass") sitting
        // ~1mm in front of the canvas. With no transparency authored it renders
        // opaque and coplanar with the image. Hide it — serves no purpose here.
        if (matName.includes('glass')) {
          child.visible = false;
          return;
        }

        // The canvas image plane (material "Bfx.Painting.img") sits at local
        // y ≈ 25 µm — essentially coplanar with the frame's backing at y ≈ 0.
        // That near-zero depth gap makes the depth buffer flip winner per pixel,
        // producing the uniform grid/moiré. polygonOffset biases the image's
        // depth toward the camera so it always wins cleanly over the backing,
        // without moving the geometry (a positional nudge can hide it behind
        // the backing depending on orientation).
        if (matName.includes('painting') || matName.includes('img')) {
          for (const m of mats) {
            m.polygonOffset       = true;
            m.polygonOffsetFactor = -1;
            m.polygonOffsetUnits  = -1;
            if (m.map) m.map.anisotropy = 8;   // crisp the detailed image at grazing angles
            m.needsUpdate = true;
          }
        }

        child.castShadow = true;
      }
    });

    // Stand it up and face the room. rotation.set(π/2, 0, π) produces the
    // same rotation matrix as the original two-step (Rx then world-Ry),
    // but as a single clean Euler assignment with no floating-point drift.
    model.rotation.set(Math.PI / 2, 0, Math.PI);
    const mounted = new THREE.Box3().setFromObject(model);
    const depth   = mounted.getSize(new THREE.Vector3()).z;
    model.position.set(PAINT_X, PAINT_CY, WALL_Z + depth / 2 + 0.03);

    group.add(model);
  }, undefined, (err) => {
    console.error('[painting1.glb] load error:', err);
  });

  scene.add(group);
  return { group };
}

// ─── Dartboard (wall-mounted, multi-file glTF from Poly Haven) ────────────────
/**
 * Loads the dartboard glTF and hangs it on the back wall (+Z), centred,
 * facing into the room. The model's native orientation has the playing face
 * in its local XY plane with the thin (mounting) axis along +Z, so a 180° Y
 * rotation turns the face inward toward the room.
 *
 * @param {THREE.Scene} scene
 * @returns {{ group: THREE.Group }}
 */
export function createDartboard(scene) {
  const group = new THREE.Group();
  group.name  = 'dartboard';

  const DART_DIAM = 1.5;   // target board diameter in scene units
  const DART_CY   = 4;   // centre (bullseye) height — aligns with the window centre
  const WALL_Z    = ROOM_D / 2;

  const loader = new GLTFLoader();
  loader.load('./blender_assets/dartboard/dartboard_1k.gltf', (gltf) => {
    const model = gltf.scene;

    // Scale to target diameter (face spans the two largest bbox axes).
    const box  = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.scale.setScalar(DART_DIAM / Math.max(size.x, size.y));

    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow    = true;
      }
    });

    // Face points +Z natively → rotate 180° so it faces -Z (into the room),
    // then push the board flush against the back wall.
    model.rotation.y = Math.PI;
    const mounted = new THREE.Box3().setFromObject(model);
    const depth   = mounted.getSize(new THREE.Vector3()).z;
    model.position.set(-7.0, DART_CY, WALL_Z - depth / 2 - 0.01);

    group.add(model);
  }, undefined, (err) => {
    console.error('[dartboard_1k.gltf] load error:', err);
  });

  scene.add(group);
  return { group };
}

// ─── Vintage Cabinet (multi-file glTF from Poly Haven) ────────────────────────
/**
 * Loads the vintage cabinet and stands it against the front wall (-Z), to the
 * right of the lounge corner. The model is authored standing on its base with
 * its doors facing +Z, so placing it on the -Z wall needs no rotation — the
 * front already faces into the room. Its back is pushed flush to the wall.
 *
 * @param {THREE.Scene} scene
 * @returns {{ group: THREE.Group }}
 */
export function createCabinet(scene) {
  const group = new THREE.Group();
  group.name  = 'cabinet';

  const TARGET_H = 6;            // cabinet height in scene units (proportional to the room)
  const CAB_X    = 3;            // centre X along the front wall (clear of the lounge corner)
  const WALL_Z   = -ROOM_D / 2;

  const loader = new GLTFLoader();
  loader.load('./blender_assets/cabinet/vintage_cabinet_01_1k.gltf', (gltf) => {
    const model = gltf.scene;

    const box  = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.scale.setScalar(TARGET_H / size.y);

    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow    = true;
      }
    });

    // Drop flush to floor and push the back against the -Z wall.
    const scaled = new THREE.Box3().setFromObject(model);
    model.position.y -= scaled.min.y;
    model.position.x  = CAB_X;
    model.position.z  = WALL_Z - scaled.min.z + 0.02;

    group.add(model);
  }, undefined, (err) => {
    console.error('[vintage_cabinet_01_1k.gltf] load error:', err);
  });

  scene.add(group);
  return { group };
}

// ─── Metal Stools (multi-file glTF from Poly Haven) ───────────────────────────
/**
 * Loads the metal stool once and lines four of them up along the dartboard
 * wall (+Z), evenly spaced and set a little in front of the wall. The model
 * stands on the floor (y = 0) and is radially symmetric, so no rotation is
 * needed.
 *
 * @param {THREE.Scene} scene
 * @returns {{ group: THREE.Group }}
 */
export function createStools(scene) {
  const group = new THREE.Group();
  group.name  = 'stools';

  const TARGET_H = 2;
  const BASE_Z   = ROOM_D / 2;  // back wall (+Z)
  // Each stool: [x, distanceFromWall] — varied depths so they look casually placed
  const STOOLS = [
    [-4.5,  2.8],
    [-1.2,  1.6],
    [ 2,  2.2],
    [ 4.8,  1.3],
  ];

  const loader = new GLTFLoader();
  loader.load('./blender_assets/stool/metal_stool_01_1k.gltf', (gltf) => {
    const proto = gltf.scene;

    // Scale to target height (model authored standing on the floor).
    const box  = new THREE.Box3().setFromObject(proto);
    const size = box.getSize(new THREE.Vector3());
    proto.scale.setScalar(TARGET_H / size.y);

    proto.traverse((child) => {
      if (child.isMesh && child.material) {
        child.castShadow    = true;
        child.receiveShadow = true;
        // Metal reads poorly in the dim far corner — boost environment response.
        for (const mat of Array.isArray(child.material) ? child.material : [child.material]) {
          mat.envMapIntensity = 2.0;
          mat.needsUpdate     = true;
        }
      }
    });

    // Re-measure once to settle each clone flush on the floor.
    const scaled = new THREE.Box3().setFromObject(proto);
    const footY  = scaled.min.y;

    for (const [x, dist] of STOOLS) {
      const stool = proto.clone();
      stool.position.set(x, -footY, BASE_Z - dist);
      group.add(stool);
    }
  }, undefined, (err) => {
    console.error('[metal_stool_01_1k.gltf] load error:', err);
  });

  scene.add(group);
  return { group };
}

// ─── Fancy Picture Frame (back/stool wall, +Z) ────────────────────────────────
/**
 * Loads the fancy picture frame and hangs it on the back wall (+Z), centered
 * above the stools. The model's face is in the XY plane facing +Z, so a 180°
 * Y rotation makes it face -Z into the room.
 *
 * @param {THREE.Scene} scene
 * @returns {{ group: THREE.Group }}
 */
export function createFrame2(scene) {
  const group = new THREE.Group();
  group.name  = 'frame2';

  const TARGET_W  = 3.0;         // frame width in scene units
  const FRAME2_X  = 0;           // centred above the stool row
  const FRAME2_CY = 4.5;         // centre height (stools are ~2 units tall)
  const WALL_Z    = ROOM_D / 2;  // back wall +Z

  const loader = new GLTFLoader();
  loader.load('./blender_assets/frame2/fancy_picture_frame_01_1k.gltf', (gltf) => {
    const model = gltf.scene;

    const box  = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.scale.setScalar(TARGET_W / size.x);

    model.traverse((child) => {
      if (child.isMesh) child.castShadow = true;
    });

    // Face points +Z natively → rotate 180° so it faces -Z (into the room)
    model.rotation.y = Math.PI;
    const mounted = new THREE.Box3().setFromObject(model);
    // mounted.max.z is the wall-facing side; push it flush to the back wall
    model.position.set(FRAME2_X, FRAME2_CY, WALL_Z - mounted.max.z - 0.01);

    group.add(model);
  }, undefined, (err) => {
    console.error('[frame2/fancy_picture_frame_01_1k.gltf] load error:', err);
  });

  scene.add(group);
  return { group };
}

// ─── Potted Plant (front wall, between couch and cabinet) ─────────────────────
/**
 * Loads the potted plant and places it on the floor against the front wall
 * (-Z), between the lounge corner and the vintage cabinet. The model is
 * authored standing upright (Y-up) so no rotation is needed.
 *
 * @param {THREE.Scene} scene
 * @returns {{ group: THREE.Group }}
 */
export function createPlant(scene) {
  const group = new THREE.Group();
  group.name  = 'plant';

  const TARGET_H = 3;          // plant height in scene units
  const PLANT_X  = -2.0;         // between couch (x≈-7.5) and cabinet (x=3)
  const WALL_Z   = -ROOM_D / 2;  // front wall -Z

  const loader = new GLTFLoader();
  loader.load('./blender_assets/plant/potted_plant_01_1k.gltf', (gltf) => {
    const model = gltf.scene;

    const box  = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.scale.setScalar(TARGET_H / size.y);

    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow    = true;
      }
    });

    // Drop flush to floor; push back of pot against the front wall
    const scaledBox = new THREE.Box3().setFromObject(model);
    model.position.y = -scaledBox.min.y;
    model.position.x = PLANT_X;
    model.position.z = WALL_Z - scaledBox.min.z + 0.1;

    group.add(model);
  }, undefined, (err) => {
    console.error('[plant/potted_plant_01_1k.gltf] load error:', err);
  });

  scene.add(group);
  return { group };
}

// ─── Coat Rack (back/stool wall, +Z) ─────────────────────────────────────────
/**
 * Loads the wall-mounted coat rack and fixes it to the back wall (+Z), to the
 * left of the fancy picture frame. The model is authored lying flat: back plate
 * at y=0, pegs pointing +Y. Rx(-π/2) maps +Y → -Z so the pegs project into
 * the room and the back plate faces the wall.
 *
 * @param {THREE.Scene} scene
 * @returns {{ group: THREE.Group }}
 */
export function createCoatRack(scene) {
  const group = new THREE.Group();
  group.name  = 'coatRack';

  const TARGET_W = 2.5;         // rack width in scene units
  const RACK_X   = 8;        // left of frame2 (frame2 centre at x=0, half-width 1.5)
  const RACK_CY  = 4.5;         // centre height — matches the painting
  const WALL_Z   = ROOM_D / 2;  // back wall +Z

  const loader = new GLTFLoader();
  loader.load('./blender_assets/coat_rack.glb', (gltf) => {
    const proto = gltf.scene;

    const box  = new THREE.Box3().setFromObject(proto);
    const size = box.getSize(new THREE.Vector3());
    proto.scale.setScalar(TARGET_W / size.x);

    proto.traverse((child) => {
      if (child.isMesh) child.castShadow = true;
    });

    // Rx(-π/2): native +Y → world -Z  →  pegs stick into room, back plate faces wall
    proto.rotation.x = -Math.PI / 2;
    const mounted = new THREE.Box3().setFromObject(proto);
    const posZ = WALL_Z - mounted.max.z - 0.01;

    // Two racks placed edge-to-edge: first at RACK_X, second immediately to the left
    for (const xOffset of [0, -TARGET_W-0.2]) {
      const rack = proto.clone();
      rack.position.set(RACK_X + xOffset, RACK_CY, posZ);
      group.add(rack);
    }
  }, undefined, (err) => {
    console.error('[coat_rack.glb] load error:', err);
  });

  scene.add(group);
  return { group };
}

// ─── Potted Plant 2 (front wall, right of cabinet) ────────────────────────────
/**
 * Loads potted_plant_02 and places it on the floor against the front wall (-Z),
 * to the right of the vintage cabinet. Y-up upright model, no rotation needed.
 *
 * @param {THREE.Scene} scene
 * @returns {{ group: THREE.Group }}
 */
export function createPlant2(scene) {
  const group = new THREE.Group();
  group.name  = 'plant2';

  const TARGET_H = 2.5;          // height in scene units
  const PLANT2_X = 8.0;          // right of cabinet (cabinet centred at x=3)
  const WALL_Z   = -ROOM_D / 2;  // front wall -Z

  const loader = new GLTFLoader();
  loader.load('./blender_assets/plant2/potted_plant_02_1k.gltf', (gltf) => {
    const model = gltf.scene;

    const box  = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.scale.setScalar(TARGET_H / size.y);

    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow    = true;
      }
    });

    const scaledBox = new THREE.Box3().setFromObject(model);
    model.position.y = -scaledBox.min.y;
    model.position.x = PLANT2_X;
    model.position.z = WALL_Z - scaledBox.min.z + 1;

    group.add(model);
  }, undefined, (err) => {
    console.error('[plant2/potted_plant_02_1k.gltf] load error:', err);
  });

  scene.add(group);
  return { group };
}

// ─── Painting 3 (right wall, +X, beside the door) ────────────────────────────
/**
 * Loads painting3.glb and hangs it on the right wall (+X), on the -Z side of
 * the door. The frame is authored lying flat in the XZ plane with Y as the
 * thin depth axis and the face toward low-Y values.
 *
 * rotation.set(π/2, -π/2, π) maps native-Y → world +X (back at wall, face
 * into room), native-Z → world +Y (height vertical), native-X → world +Z
 * (width horizontal).
 *
 * @param {THREE.Scene} scene
 * @returns {{ group: THREE.Group }}
 */
export function createPainting3(scene) {
  const group = new THREE.Group();
  group.name  = 'painting3';

  const TARGET_W  = 2.5;         // frame width in scene units
  const PAINT3_CY = 4.2;         // centre height
  const PAINT3_Z  = -4.0;        // Z on the right wall (-Z side, clear of door at z≈1.5)
  const WALL_X    = ROOM_W / 2;  // right wall +X

  const loader = new GLTFLoader();
  loader.load('./blender_assets/painting4.glb', (gltf) => {
    const model = gltf.scene;

    const box  = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.scale.setScalar(TARGET_W / size.x);

    model.traverse((child) => {
      if (!child.isMesh) return;
      const n = child.name.toLowerCase();
      // Hide the glass pane
      if (n.includes('glass')) { child.visible = false; return; }
      child.castShadow = true;
      if (n.includes('painting')) {
        // Push canvas forward so it sits flush with the frame opening
        child.material = child.material.clone();
        child.material.polygonOffset       = true;
        child.material.polygonOffsetFactor = -1;
        child.material.polygonOffsetUnits  = -1;
        // Grow the canvas (±0.252 × ±0.345) out to the frame's inner edge so the
        // image fills the opening instead of leaving a gap. X,Z in-plane; Y thin.
        child.scale.set(1.09, 1, 1.09);
      } else if (!n.includes('frame')) {
        // Backing → black mount. Native backing (±0.2496 × ±0.3437) is smaller
        // than the painting, so the wall shows in the gap up to the frame's
        // inner edge. Grow it in-plane (X,Z; Y is thickness) to tuck under the
        // frame (outer ±0.2745 × ±0.3801) and block the wall behind the canvas.
        child.material = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1, metalness: 0 });
        child.scale.set(1.09, 1, 1.09);
      }
    });

    model.rotation.set(Math.PI / 2 , 0, Math.PI / 2);
    const mounted = new THREE.Box3().setFromObject(model);
    // mounted.max.x is the wall-facing (back) side
    model.position.set(WALL_X - mounted.max.x - 0.01, PAINT3_CY, PAINT3_Z);

    group.add(model);
  }, undefined, (err) => {
    console.error('[painting4.glb] load error:', err);
  });

  scene.add(group);
  return { group };
}

// ─── Potted Plant 2 — Corner (back-right corner, right of door) ───────────────
export function createPlant2Corner(scene) {
  const group = new THREE.Group();
  group.name  = 'plant2corner';

  const TARGET_H = 2.5;
  const PLANT_X  =  8.5;   // near right wall (+X = 11)
  const PLANT_Z  =  6.5;   // near back wall  (+Z = 9)

  const loader = new GLTFLoader();
  loader.load('./blender_assets/plant2/potted_plant_02_1k.gltf', (gltf) => {
    const model = gltf.scene;

    const box  = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.scale.setScalar(TARGET_H / size.y);

    model.traverse((child) => {
      if (child.isMesh) child.castShadow = true;
    });

    const scaledBox = new THREE.Box3().setFromObject(model);
    model.position.set(PLANT_X, -scaledBox.min.y, PLANT_Z);

    group.add(model);
  }, undefined, (err) => {
    console.error('[plant2corner] load error:', err);
  });

  scene.add(group);
  return { group };
}
