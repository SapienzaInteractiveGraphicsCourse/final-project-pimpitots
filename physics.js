/**
 * physics.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsibility: table/ball constants and ball placement utilities.
 * Collision simulation will be added in a later step.
 *
 * Exported:
 *   TABLE_W, TABLE_H      - playing surface dimensions
 *   BALL_RADIUS           - pool ball radius in scene units
 *   POCKET_RADIUS         - pocket capture radius
 *   POCKET_POSITIONS      - [x, z][] for the 6 pocket centres
 *   randomizeBalls(n)     - returns {x,z}[] collision-free starting positions
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const TABLE_W       = 9.0;   // playing surface long axis  (X)
export const TABLE_H       = 4.5;   // playing surface short axis (Z)
export const BALL_RADIUS   = 0.18;  // pool ball radius in scene units
export const POCKET_RADIUS = 0.32;  // pocket capture radius

// 6 pocket centres [x, z] — 4 corners + 2 side midpoints
export const POCKET_POSITIONS = [
  [-TABLE_W / 2 + 0.22, -TABLE_H / 2 + 0.22],  // front-left
  [ TABLE_W / 2 - 0.22, -TABLE_H / 2 + 0.22],  // front-right
  [-TABLE_W / 2 + 0.22,  TABLE_H / 2 - 0.22],  // back-left
  [ TABLE_W / 2 - 0.22,  TABLE_H / 2 - 0.22],  // back-right
  [ 0,                  -TABLE_H / 2 + 0.12],   // front-middle
  [ 0,                   TABLE_H / 2 - 0.12],   // back-middle
];

// ─── Random Ball Placement ────────────────────────────────────────────────────
/**
 * Generates valid non-overlapping start positions.
 * positions[0] = cue ball (positive-Z / player half).
 * positions[1..numColored] = colored balls (anywhere on the table).
 *
 * Enforces: min center-to-center distance of 2*BALL_RADIUS + 0.06,
 * and keeps balls clear of pocket mouths.
 *
 * @param {number} numColored
 * @returns {{ x: number, z: number }[]}
 */
export function randomizeBalls(numColored) {
  const PAD   = 0.15;
  const W2    = TABLE_W / 2 - BALL_RADIUS - PAD;
  const H2    = TABLE_H / 2 - BALL_RADIUS - PAD;
  const MIN_D = 2 * BALL_RADIUS + 0.06;

  const placed = [];

  function tryPlace(xMin, xMax, zMin, zMax) {
    for (let attempt = 0; attempt < 800; attempt++) {
      const x = xMin + Math.random() * (xMax - xMin);
      const z = zMin + Math.random() * (zMax - zMin);
      let ok = true;

      for (const p of placed) {
        const dx = p.x - x, dz = p.z - z;
        if (dx * dx + dz * dz < MIN_D * MIN_D) { ok = false; break; }
      }
      if (!ok) continue;

      for (const [px, pz] of POCKET_POSITIONS) {
        const dx = x - px, dz = z - pz;
        if (dx * dx + dz * dz < POCKET_RADIUS * POCKET_RADIUS * 2.5) { ok = false; break; }
      }
      if (!ok) continue;

      const pos = { x, z };
      placed.push(pos);
      return pos;
    }
    // Fallback — extremely rare
    const pos = { x: (xMin + xMax) / 2, z: (zMin + zMax) / 2 };
    placed.push(pos);
    return pos;
  }

  const positions = [];
  positions.push(tryPlace(-W2, W2, 0.2, H2));          // cue ball: player side
  for (let i = 0; i < numColored; i++) {
    positions.push(tryPlace(-W2, W2, -H2, H2));         // colored: full table
  }
  return positions;
}
