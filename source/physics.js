/**
 * physics.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsibility: Pure-JS physics simulation for the pool game.
 * No Three.js dependency — operates only on plain ball-state objects so that
 * the physics step is decoupled from the renderer.
 *
 * Ball state object shape (defined/owned by main.js, mutated here):
 *   { id, isCueBall, x, z, vx, vz, pocketed, mesh }
 *
 * Exported API:
 *   TABLE_W, TABLE_H             - playing surface dimensions
 *   BALL_RADIUS                  - pool ball radius in scene units
 *   POCKET_RADIUS                - pocket capture radius
 *   POCKET_POSITIONS             - [x, z][] for the 6 pocket centres
 *   stepPhysics(balls, dt)       → String[]  IDs of newly-pocketed balls this step
 *   isAllStopped(balls)          → Boolean   true once every ball's velocity is exactly zero
 *   isReadyForNextShot(balls)    → Boolean   true once every ball is below the perceptual
 *                                             "looks stopped" floor (looser/earlier than
 *                                             isAllStopped)
 *   snapToRest(balls)            → void      zeroes vx/vz on every non-pocketed ball; call
 *                                             once isReadyForNextShot is true so no residual
 *                                             velocity is left for per-frame rotation/position
 *                                             updates to keep consuming after physics stepping
 *                                             stops
 *   randomizeBalls(numColored)   → {x,z}[] pos[0]=cueBall, pos[1..]=colored
 *
 * Coordinate system: XZ plane (Y is up, handled by main.js).
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Tunable Constants ────────────────────────────────────────────────────────
export const TABLE_W       = 9.0;   // playing surface long axis  (X)
export const TABLE_H       = 4.5;   // playing surface short axis (Z)
export const BALL_RADIUS   = 0.18;  // pool ball radius in scene units
export const POCKET_RADIUS = 0.32;  // pocket capture radius

const FRICTION_60FPS  = 0.982;        // velocity multiplier per frame at 60 fps (rolling friction)
const RESTITUTION_CU  = 0.72;         // ball-cushion coefficient of restitution (energy retained)
const RESTITUTION_BB  = 0.96;         // ball-ball   coefficient of restitution
const MIN_SPEED_SQ    = 0.00015 * 0.00015; // squared speed below which ball is considered stopped

// Speed (and its square) at which a ball's on-screen motion is considered
// "settled enough" for gameplay purposes — i.e. imperceptible to a player
// watching the table — even though MIN_SPEED_SQ above hasn't snapped it to
// an exact zero yet. Deliberately looser than MIN_SPEED_SQ: friction decays
// velocity geometrically (see stepPhysics()'s frictionFactor), so it
// asymptotically approaches — but takes several extra seconds to actually
// cross — the tiny MIN_SPEED_SQ floor. Gating the next shot on that literal
// zero, rather than on "can the player even tell it's still moving", adds
// several seconds of dead time to every shot for no visible benefit.
//
// Derivation: the closest the gameplay camera ever gets to a ball is the
// player-POV camera (camera1 in main.js) — roughly 4.78 units away
// (combining CAM_DIST_BEHIND=4.5 and CAM_HEIGHT_POV=1.6) with a 62° vertical
// FOV, giving a ~5.74-unit-tall view frustum at that distance. On a
// 1080px-tall viewport that's ~188px per unit. Capping apparent motion at
// 0.5px/frame (60fps → 30px/s) works out to ~0.16 units/s; rounded down to
// 0.15 for a small margin. Re-tune by playtest if balls ever look like they
// "stop" while still visibly creeping, or there's a felt wait after they
// already look stopped.
const READY_SPEED     = 0.15;
const READY_SPEED_SQ  = READY_SPEED * READY_SPEED;

// Cushion inner edges — ball CENTER must stay inside these
const CUSHION_MIN_X = -TABLE_W / 2 + BALL_RADIUS + 0.02; // tiny extra gap so ball doesn't clip cushion geometry
const CUSHION_MAX_X =  TABLE_W / 2 - BALL_RADIUS - 0.02;
const CUSHION_MIN_Z = -TABLE_H / 2 + BALL_RADIUS + 0.02;
const CUSHION_MAX_Z =  TABLE_H / 2 - BALL_RADIUS - 0.02;

// 6 pocket centres [x, z] — 4 corners + 2 side midpoints
export const POCKET_POSITIONS = [
  [-TABLE_W / 2 + 0.22, -TABLE_H / 2 + 0.22],  // front-left
  [ TABLE_W / 2 - 0.22, -TABLE_H / 2 + 0.22],  // front-right
  [-TABLE_W / 2 + 0.22,  TABLE_H / 2 - 0.22],  // back-left
  [ TABLE_W / 2 - 0.22,  TABLE_H / 2 - 0.22],  // back-right
  [ 0,                  -TABLE_H / 2 - 0.18],   // front-middle (capture aligned with the visual pocket mouth)
  [ 0,                   TABLE_H / 2 + 0.18],   // back-middle  (capture aligned with the visual pocket mouth)
];

// Pocket exclusion zone radius for cushion-collision suppression.
// Near a pocket opening, we skip the rectangular-wall bounce so balls fall in naturally.
const POCKET_EXCLUSION_R = POCKET_RADIUS * 1.6;
const POCKET_EXCLUSION_R2 = POCKET_EXCLUSION_R * POCKET_EXCLUSION_R;

// ─── Helper: squared distance from ball to a pocket ──────────────────────────
/**
 * Returns true if the ball center is inside any pocket's capture zone.
 * @param {{ x: number, z: number }} ball
 * @returns {boolean}
 */
function _isInPocket(ball) {
  for (const [px, pz] of POCKET_POSITIONS) {
    const dx = ball.x - px;
    const dz = ball.z - pz;
    const d2 = dx * dx + dz * dz;

    // Direct capture: ball center overlaps the visible pocket mouth.
    if (d2 < POCKET_RADIUS * POCKET_RADIUS) return true;

    // Throat capture: the ball is inside the pocket opening (where cushion
    // bounce is suppressed) AND has crossed past the playing-area boundary, so
    // it's out over the gap with no rail to rest on. Without this, a ball can
    // stop in the ring between POCKET_RADIUS and POCKET_EXCLUSION_R and sit on
    // the rail edge instead of dropping in.
    if (d2 < POCKET_EXCLUSION_R2 &&
        (ball.x < CUSHION_MIN_X || ball.x > CUSHION_MAX_X ||
         ball.z < CUSHION_MIN_Z || ball.z > CUSHION_MAX_Z)) {
      return true;
    }
  }
  return false;
}

/**
 * Returns true if the ball is close enough to a pocket opening that we should
 * suppress cushion bounce on that side (so the ball falls in rather than bouncing).
 * @param {{ x: number, z: number }} ball
 * @returns {boolean}
 */
function _nearPocketOpening(ball) {
  for (const [px, pz] of POCKET_POSITIONS) {
    const dx = ball.x - px;
    const dz = ball.z - pz;
    if (dx * dx + dz * dz < POCKET_EXCLUSION_R2) return true;
  }
  return false;
}

// ─── Cushion Collision ────────────────────────────────────────────────────────
/**
 * Reflects ball velocity off a rectangular cushion boundary and clamps position.
 * Skips cushion check near pocket openings so balls can fall in naturally.
 * @param {{ x: number, z: number, vx: number, vz: number }} ball
 */
function _resolveCushion(ball, onCollision) {
  if (_nearPocketOpening(ball)) return;

  let hit = false;

  // ── X-axis cushions ──
  if (ball.x < CUSHION_MIN_X) {
    ball.x  = CUSHION_MIN_X;
    ball.vx = Math.abs(ball.vx) * RESTITUTION_CU;
    hit = true;
  } else if (ball.x > CUSHION_MAX_X) {
    ball.x  = CUSHION_MAX_X;
    ball.vx = -Math.abs(ball.vx) * RESTITUTION_CU;
    hit = true;
  }

  // ── Z-axis cushions ──
  if (ball.z < CUSHION_MIN_Z) {
    ball.z  = CUSHION_MIN_Z;
    ball.vz = Math.abs(ball.vz) * RESTITUTION_CU;
    hit = true;
  } else if (ball.z > CUSHION_MAX_Z) {
    ball.z  = CUSHION_MAX_Z;
    ball.vz = -Math.abs(ball.vz) * RESTITUTION_CU;
    hit = true;
  }

  if (hit && onCollision) {
    const speed = Math.sqrt(ball.vx * ball.vx + ball.vz * ball.vz);
    onCollision(speed);
  }
}

// ─── Ball-Ball Collision ──────────────────────────────────────────────────────
/**
 * Resolves elastic collision between two balls of equal mass using the
 * impulse method with a coefficient of restitution.
 * Both balls' positions and velocities are mutated in place.
 * @param {{ x,z,vx,vz }} a
 * @param {{ x,z,vx,vz }} b
 */
function _resolveBallBall(a, b, onCollision) {
  const dx   = b.x - a.x;
  const dz   = b.z - a.z;
  const dist2 = dx * dx + dz * dz;
  const minD  = 2 * BALL_RADIUS;

  if (dist2 >= minD * minD || dist2 < 1e-8) return; // no overlap or degenerate

  const dist = Math.sqrt(dist2);
  const nx = dx / dist; // collision normal, pointing from a → b
  const nz = dz / dist;

  // Positional correction — always push overlapping balls apart, even if
  // they're not approaching (e.g. a prior collision left them penetrating
  // and friction has since brought them to rest — without this they'd stay
  // stuck intersecting forever).
  const overlap = (minD - dist) * 0.5;
  a.x -= nx * overlap;
  a.z -= nz * overlap;
  b.x += nx * overlap;
  b.z += nz * overlap;

  // Relative velocity projected onto the collision normal
  const dvx    = a.vx - b.vx;
  const dvz    = a.vz - b.vz;
  const vRel_n = dvx * nx + dvz * nz;

  if (vRel_n <= 0) return; // balls already separating — skip velocity impulse

  // Impulse scalar for equal-mass 1D collision with restitution:
  //   j = (1 + e) * v_rel_n / (1/m_a + 1/m_b) = (1 + e) * v_rel_n / 2  (unit mass)
  const j = (1 + RESTITUTION_BB) * vRel_n * 0.5;

  a.vx -= j * nx;
  a.vz -= j * nz;
  b.vx += j * nx;
  b.vz += j * nz;

  if (onCollision) onCollision(vRel_n);
}

// ─── Main Physics Step ────────────────────────────────────────────────────────
/**
 * Advances the physics simulation by one time step dt (seconds).
 * Integrates velocities, applies friction, resolves ball-ball and
 * cushion collisions, then detects pocketed balls.
 *
 * @param {Array<{id, x, z, vx, vz, pocketed}>} balls
 * @param {number} dt - delta time in seconds
 * @returns {Array} subset of balls that were newly pocketed this step
 */
export function stepPhysics(balls, dt, onBallBall, onCushion) {
  // Frame-rate–independent friction factor
  // FRICTION_60FPS^(dt*60) gives consistent feel regardless of frame rate.
  const frictionFactor = Math.pow(FRICTION_60FPS, dt * 60);

  // ── 1. Integrate positions, apply friction ──
  for (const ball of balls) {
    if (ball.pocketed) continue;

    ball.x += ball.vx * dt;
    ball.z += ball.vz * dt;

    ball.vx *= frictionFactor;
    ball.vz *= frictionFactor;

    // Zero out sub-threshold velocities to let balls come to a clean stop
    const speed2 = ball.vx * ball.vx + ball.vz * ball.vz;
    if (speed2 < MIN_SPEED_SQ) {
      ball.vx = 0;
      ball.vz = 0;
    }
  }

  // ── 2. Ball-ball collisions (O(n²), fine for ≤16 balls) ──
  for (let i = 0; i < balls.length - 1; i++) {
    if (balls[i].pocketed) continue;
    for (let j = i + 1; j < balls.length; j++) {
      if (!balls[j].pocketed) {
        _resolveBallBall(balls[i], balls[j], onBallBall);
      }
    }
  }

  // ── 3. Cushion collisions ──
  for (const ball of balls) {
    if (!ball.pocketed) _resolveCushion(ball, onCushion);
  }

  // ── 4. Pocket detection ──
  const newlyPocketed = [];
  for (const ball of balls) {
    if (!ball.pocketed && _isInPocket(ball)) {
      ball.pocketed = true;
      ball.vx = 0;
      ball.vz = 0;
      newlyPocketed.push(ball);
    }
  }

  return newlyPocketed;
}

// ─── Utility: Stopped Check ───────────────────────────────────────────────────
/**
 * Returns true when every non-pocketed ball has zero velocity.
 * @param {Array<{vx, vz, pocketed}>} balls
 * @returns {boolean}
 */
export function isAllStopped(balls) {
  for (const ball of balls) {
    if (ball.pocketed) continue;
    if (ball.vx !== 0 || ball.vz !== 0) return false;
  }
  return true;
}

// ─── Utility: Ready-For-Next-Shot Check ──────────────────────────────────────
/**
 * Returns true once every non-pocketed ball's speed has dropped below the
 * perceptual "looks stopped" floor (READY_SPEED_SQ). Looser than
 * isAllStopped() by design — see the comment on READY_SPEED_SQ above — so
 * the gameplay state machine can re-enable the next shot as soon as the
 * table visibly looks at rest, instead of waiting for every ball's velocity
 * to decay all the way to an exact zero.
 * @param {Array<{vx, vz, pocketed}>} balls
 * @returns {boolean}
 */
export function isReadyForNextShot(balls) {
  for (const ball of balls) {
    if (ball.pocketed) continue;
    const speed2 = ball.vx * ball.vx + ball.vz * ball.vz;
    if (speed2 >= READY_SPEED_SQ) return false;
  }
  return true;
}

// ─── Utility: Snap To Rest ────────────────────────────────────────────────────
/**
 * Zeroes vx/vz on every non-pocketed ball. Call once isReadyForNextShot(balls)
 * returns true, at the moment the gameplay state machine transitions out of
 * ROLLING.
 *
 * Why this is needed: isReadyForNextShot uses a perceptual threshold
 * (READY_SPEED_SQ) looser than the exact-zero floor MIN_SPEED_SQ snaps to
 * inside stepPhysics(), so a ball can still carry a small non-zero vx/vz at
 * the moment the transition fires. Once gameplay leaves the ROLLING/STRIKING
 * states, stepPhysics() stops being called, so that residual velocity is
 * never decayed any further — but it still drives the per-frame rolling
 * rotation in main.js, which reads vx/vz unconditionally every frame
 * regardless of game state. Left un-zeroed, that frozen residual speed would
 * make the ball spin in place forever. Calling this once at the transition
 * hard-clears it, matching the end state isAllStopped() would have produced.
 * @param {Array<{vx, vz, pocketed}>} balls
 */
export function snapToRest(balls) {
  for (const ball of balls) {
    if (ball.pocketed) continue;
    ball.vx = 0;
    ball.vz = 0;
  }
}

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
      // Pick a random point inside the allowed region for this ball type.
      const x = xMin + Math.random() * (xMax - xMin);
      const z = zMin + Math.random() * (zMax - zMin);
      let ok = true;

      // First check: do not overlap any ball already placed.
      for (const p of placed) {
        const dx = p.x - x, dz = p.z - z;
        if (dx * dx + dz * dz < MIN_D * MIN_D) { ok = false; break; }
      }
      if (!ok) continue;

      // Second check: keep the ball away from all pocket openings.
      for (const [px, pz] of POCKET_POSITIONS) {
        const dx = x - px, dz = z - pz;
        if (dx * dx + dz * dz < POCKET_RADIUS * POCKET_RADIUS * 2.5) { ok = false; break; }
      }
      if (!ok) continue;

      // Accept the point once it passes every check.
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
