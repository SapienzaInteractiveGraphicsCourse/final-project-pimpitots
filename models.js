/**
 * models.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsibility: Three.js mesh/hierarchy construction for the scene.
 * No game logic lives here — purely geometry & materials.
 *
 * Exported:
 *   createRoom(scene) → { group }
 *
 * Coordinate system: Y-up. Room floor at Y = 0.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import * as THREE from 'three';

// ─── Shared Scene-Geometry Constants ─────────────────────────────────────────
export const TABLE_SURFACE_Y = 0.76; // table felt surface height in world space (table "on the floor")

// Room dimensions
const ROOM_W = 22;
const ROOM_D = 18;
const ROOM_H = 7.0;

// ─── Room shading ─────────────────────────────────────────────────────────
// Flat colors — no texture maps used for the walls or floor.
const WALL_COLOR  = 0x8a8478;
const FLOOR_COLOR = 0x4a3526;

// ─── Room ─────────────────────────────────────────────────────────────────────
/**
 * Creates and adds the closed room (floor, ceiling, 4 walls) to the scene.
 * @param {THREE.Scene} scene
 * @returns {{ group: THREE.Group }}
 */
export function createRoom(scene) {
  const group = new THREE.Group();
  group.name  = 'room';

  const wallMat = new THREE.MeshStandardMaterial({
    color:     WALL_COLOR,
    roughness: 0.85,
    metalness: 0.0,
    side:      THREE.BackSide, // render inside faces of the room box
  });

  const floorMat = new THREE.MeshStandardMaterial({
    color:     FLOOR_COLOR,
    roughness: 0.8,
    metalness: 0.0,
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
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;  // lie flat in XZ plane
  floorMesh.position.y = 0.001; // 1mm above room-box bottom face (both at Y=0 → Z-fight)
  floorMesh.receiveShadow = true;
  floorMesh.name = 'floor';
  group.add(floorMesh);

  scene.add(group);
  return { group };
}
