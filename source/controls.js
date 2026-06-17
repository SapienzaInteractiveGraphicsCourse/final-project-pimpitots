/**
 * controls.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsibility: mouse/touch input for aiming, charging, and firing the cue.
 * No Three.js or scene dependency — exposes plain state that main.js reads
 * each frame to drive the cue stick and camera.
 *
 * Gesture model (one press-and-release on the canvas):
 *   - Press and hold in place  → charge builds up; release fires the shot.
 *   - Press and drag           → aims the cue (rotates aimAngle); charging
 *                                 for that press is cancelled, so releasing
 *                                 after a drag does not fire a shot.
 *
 * Exported:
 *   Controls (class)
 *     .aimAngle      - current cue aim angle in radians
 *     .mouseX/mouseY - last known raw cursor/touch position in screen space
 *     .chargeAmount  - 0..1 charge progress, recomputed by update()
 *     .pullback      - cue pullback distance derived from chargeAmount
 *     .enabled       - settable from outside; false ignores new presses
 *     .isCharging    - true while a charge-building hold is active
 *     .isAiming      - true while the current press is being dragged to aim
 *     .update()      - call once per frame to refresh chargeAmount/pullback
 *     .consumeShot() - returns { power } once per fired shot, then clears it
 * ─────────────────────────────────────────────────────────────────────────────
 */

const AIM_SENSITIVITY     = 0.005; // radians of aim rotation per pixel of drag
const MAX_CHARGE_TIME     = 2.5;   // seconds of holding to reach full power
const MAX_POWER           = 14.0;  // shot speed at full charge
const MIN_POWER           = 0.5;   // shot speed at the moment of release with no charge
const MAX_PULLBACK        = 1.4;   // cue pullback distance at full charge

const AIM_DRAG_TOLERANCE   = 2; // px of mouse movement before a press is treated as a drag
const TOUCH_DRAG_TOLERANCE = 3; // px of touch movement before a press is treated as a drag

export class Controls {
  /**
   * @param {HTMLCanvasElement} canvas - element to attach pointer listeners to
   */
  constructor(canvas) {
    // ── Public state read by main.js every frame ──
    this.aimAngle     = 0;
    this.mouseX        = window.innerWidth  / 2;
    this.mouseY        = window.innerHeight / 2;
    this.chargeAmount = 0;
    this.pullback     = 0;
    this.enabled      = true;

    // ── Internal gesture-tracking state ──
    this._isMouseDown     = false;
    this._isAiming        = false;
    this._isCharging      = false;
    this._chargeStartTime = 0;
    this._dragStartX      = 0;
    this._dragStartY      = 0;
    this._lastMouseX      = 0;
    this._lastMouseY      = 0;
    this._pendingShot     = null; // { power } once set by a completed charge-and-release

    this._bindEvents(canvas);
  }

  // ─── Event Binding ────────────────────────────────────────────────────────
  /**
   * Attaches all mouse/touch listeners to the canvas.
   * @param {HTMLCanvasElement} canvas
   */
  _bindEvents(canvas) {
    canvas.addEventListener('mousedown',   this._onMouseDown);
    canvas.addEventListener('mousemove',   this._onMouseMove);
    canvas.addEventListener('mouseup',     this._onMouseUp);
    canvas.addEventListener('mouseleave',  this._onMouseLeave);
    canvas.addEventListener('touchstart',  this._onTouchStart, { passive: false });
    canvas.addEventListener('touchmove',   this._onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',    this._onTouchEnd,   { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ─── Mouse Handlers ───────────────────────────────────────────────────────
  /**
   * Starts a new press. Charging begins immediately on the assumption the
   * player is holding still; a subsequent drag past AIM_DRAG_TOLERANCE will
   * switch this press over to aiming and cancel the charge.
   * @param {MouseEvent} e
   */
  _onMouseDown = (e) => {
    if (!this.enabled || e.button !== 0) return;

    this._isMouseDown     = true;
    this._isAiming         = false;
    this._isCharging       = true;
    this._chargeStartTime  = performance.now();
    this._dragStartX       = e.clientX;
    this._dragStartY       = e.clientY;
    this._lastMouseX       = e.clientX;
    this._lastMouseY       = e.clientY;
  };

  /**
   * Tracks raw cursor position at all times (used by main.js for
   * cursor-targeted aiming), and while a press is active, rotates aimAngle
   * once drag tolerance is exceeded.
   * @param {MouseEvent} e
   */
  _onMouseMove = (e) => {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;

    if (!this._isMouseDown) return;

    const dx = e.clientX - this._lastMouseX;

    if (!this._isAiming) {
      const totalDx = e.clientX - this._dragStartX;
      const totalDy = e.clientY - this._dragStartY;
      if (Math.hypot(totalDx, totalDy) > AIM_DRAG_TOLERANCE) {
        this._isAiming   = true;
        this._isCharging = false; // a drag cancels charging for this press
      }
    }

    if (this._isAiming) {
      this.aimAngle += dx * AIM_SENSITIVITY;
    }

    this._lastMouseX = e.clientX;
    this._lastMouseY = e.clientY;
  };

  /**
   * Ends the press. If it was still charging (never dragged past
   * tolerance), computes shot power from hold duration and queues it.
   * @param {MouseEvent} e
   */
  _onMouseUp = (e) => {
    if (!this._isMouseDown) return;

    if (this._isCharging) {
      const elapsed = (performance.now() - this._chargeStartTime) / 1000;
      const power = MIN_POWER + Math.min(elapsed / MAX_CHARGE_TIME, 1) * (MAX_POWER - MIN_POWER);
      this._pendingShot = { power };
    }

    this._isMouseDown  = false;
    this._isCharging   = false;
    this._isAiming     = false;
    this.chargeAmount  = 0;
    this.pullback      = 0;
  };

  /**
   * Aborts the current press without firing — leaving the canvas mid-charge
   * means the player can no longer see or control the shot they'd release.
   */
  _onMouseLeave = () => {
    this._isMouseDown  = false;
    this._isCharging   = false;
    this._isAiming     = false;
    this.chargeAmount  = 0;
    this.pullback      = 0;
  };

  // ─── Touch Handlers (mirror the mouse handlers above) ────────────────────
  /**
   * @param {TouchEvent} e
   */
  _onTouchStart = (e) => {
    if (!this.enabled) return;
    e.preventDefault();

    const t = e.touches[0];
    this._isMouseDown     = true;
    this._isAiming         = false;
    this._isCharging       = true;
    this._chargeStartTime  = performance.now();
    this._dragStartX       = t.clientX;
    this._dragStartY       = t.clientY;
    this._lastMouseX       = t.clientX;
    this._lastMouseY       = t.clientY;
    this.mouseX            = t.clientX;
    this.mouseY            = t.clientY;
  };

  /**
   * @param {TouchEvent} e
   */
  _onTouchMove = (e) => {
    if (!this._isMouseDown) return;
    e.preventDefault();

    const t = e.touches[0];
    this.mouseX = t.clientX;
    this.mouseY = t.clientY;

    const dx = t.clientX - this._lastMouseX;

    if (!this._isAiming) {
      const totalDx = t.clientX - this._dragStartX;
      const totalDy = t.clientY - this._dragStartY;
      if (Math.hypot(totalDx, totalDy) > TOUCH_DRAG_TOLERANCE) {
        this._isAiming   = true;
        this._isCharging = false;
      }
    }

    if (this._isAiming) {
      this.aimAngle += dx * AIM_SENSITIVITY;
    }

    this._lastMouseX = t.clientX;
    this._lastMouseY = t.clientY;
  };

  /**
   * @param {TouchEvent} e
   */
  _onTouchEnd = (e) => {
    if (!this._isMouseDown) return;
    e.preventDefault();

    if (this._isCharging) {
      const elapsed = (performance.now() - this._chargeStartTime) / 1000;
      const power = MIN_POWER + Math.min(elapsed / MAX_CHARGE_TIME, 1) * (MAX_POWER - MIN_POWER);
      this._pendingShot = { power };
    }

    this._isMouseDown  = false;
    this._isCharging   = false;
    this._isAiming     = false;
    this.chargeAmount  = 0;
    this.pullback      = 0;
  };

  // ─── Per-Frame Update ─────────────────────────────────────────────────────
  /**
   * Recomputes chargeAmount (0..1) and the derived cue pullback distance
   * from how long the current charging press has been held. Call once per
   * render frame.
   */
  update() {
    if (this._isCharging) {
      const elapsed = (performance.now() - this._chargeStartTime) / 1000;
      this.chargeAmount = Math.min(elapsed / MAX_CHARGE_TIME, 1);
    } else {
      this.chargeAmount = 0;
    }
    this.pullback = this.chargeAmount * MAX_PULLBACK;
  }

  // ─── Shot Consumption ─────────────────────────────────────────────────────
  /**
   * Returns the pending shot (if any) and clears it, so each completed
   * charge-and-release is consumed exactly once.
   * @returns {{ power: number } | null}
   */
  consumeShot() {
    const shot = this._pendingShot;
    this._pendingShot = null;
    return shot;
  }

  // ─── State Getters ────────────────────────────────────────────────────────
  get isCharging() {
    return this._isCharging;
  }

  get isAiming() {
    return this._isAiming;
  }
}
