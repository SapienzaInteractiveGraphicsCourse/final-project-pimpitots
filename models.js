/**
 * models.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsibility: Three.js mesh/hierarchy construction for the scene.
 * No game logic lives here — purely geometry & materials.
 *
 * Currently implements the empty room shell. createTable(), createCueStick(),
 * createLamp(), createBallMesh(), and a generateTextures() pass will be added
 * as the scene grows.
 *
 * Exported:
 *   createRoom(scene) → { group, roomMesh, floorMesh }
 *
 * Coordinate system: Y-up. Room floor at Y = 0.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import * as THREE from 'three';

// ─── Room dimensions ──────────────────────────────────────────────────────
// Assumption: sized to comfortably fit a standard pool table plus walking
// space around it, even though the table doesn't exist yet.
export const ROOM_W = 22;
export const ROOM_D = 18;
export const ROOM_H = 7.0;

// ─── Placeholder flat colors ──────────────────────────────────────────────
// Assumption: flat colors for now — will be swapped for real texture maps
// once a generateTextures() pass is added.
const WALL_COLOR  = 0x8a8478;
const FLOOR_COLOR = 0x4a3526;

// ─── Room ───────────────────────────────────────────────────────────────────
/**
 * Builds the empty room shell: a box (rendered from the inside) for the
 * walls/ceiling, plus a separate floor plane so the floor can later receive
 * its own distinct material/texture.
 *
 * @param {THREE.Scene} scene
 * @returns {{ group: THREE.Group, roomMesh: THREE.Mesh, floorMesh: THREE.Mesh }}
 */
export function createRoom(scene) {
  const group = new THREE.Group();
  group.name  = 'room';

  // ── Walls / ceiling ──
  // Room is a single large box; BackSide renders only its inside faces so
  // the interior is visible when the camera sits inside the box.
  const wallMat = new THREE.MeshStandardMaterial({
    color:     WALL_COLOR,
    roughness: 0.85,
    metalness: 0.0,
    side:      THREE.BackSide,
  });

  const roomGeo  = new THREE.BoxGeometry(ROOM_W, ROOM_H, ROOM_D);
  const roomMesh = new THREE.Mesh(roomGeo, wallMat);
  roomMesh.position.set(0, ROOM_H / 2, 0);
  roomMesh.name = 'roomBox';
  group.add(roomMesh);

  // ── Floor ──
  // Separate plane (rather than relying on the box's bottom inside face) so
  // a distinct floor material/texture can be swapped in later without
  // touching the wall material.
  const floorMat = new THREE.MeshStandardMaterial({
    color:     FLOOR_COLOR,
    roughness: 0.8,
    metalness: 0.0,
  });

  const floorGeo  = new THREE.PlaneGeometry(ROOM_W, ROOM_D);
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;      // lie flat in the XZ plane
  floorMesh.position.y = 0.001;             // avoid z-fighting with the box's bottom face (also at Y=0)
  floorMesh.receiveShadow = true;           // ready for shadow-casting objects added later
  floorMesh.name = 'floor';
  group.add(floorMesh);

  scene.add(group);
  return { group, roomMesh, floorMesh };
}
