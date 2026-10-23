/**
 * Keyboard + mouse input. Mouse position is consumed by MouseAim as an aiming
 * direction; it is not applied directly to roll/pitch. W/S provide an auxiliary
 * pitch aim bias, while A/D are a direct roll axis (and ground steering). No
 * pointer lock is required, which keeps setup simple and lets the HUD draw a
 * true aim cursor.
 */
import {normalizeBindings,normalizeKeyCode,activeControlActions,formatBinding} from '../data/controls.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.bindings = normalizeBindings();
    this.actionPressed = new Set();
    this._eventPressed = new Set();
    this.mouse = {
      x: 0, y: 0, nx: 0, ny: 0, inside: false,
      buttons: new Set(), dx: 0, dy: 0,
    };
    this.wheel = 0;
    this.pointerLocked = false;
    this.altMouse = false;
    this.onPointerLockLost = null;
    this.enabled = false;
    this.sensitivity = 1.0;
    this.invertY = false;
    this.suppressMouseUntilMove = true;

    this._onKeyDown = (e) => {
      const fresh = !this.keys.has(e.code) && !e.repeat;
      this.keys.add(e.code);
      if (!this.enabled) return;
      const code = normalizeKeyCode(e.code);
      if (Object.values(this.bindings).some((chords) => chords.some((chord) => chord.includes(code))))
        e.preventDefault();
      if (fresh) {
        this.pressed.add(e.code);
        this._eventPressed.add(e.code);
        this._pressActions(code);
      }
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (!this.altMouse && (this.enabled || this.pointerLocked)) {
        // In flight the visible reticle is always centred; movementX/Y is the
        // control signal even if pointer lock is unavailable (headless/iframe).
        this.mouse.dx += e.movementX || 0;
        this.mouse.dy += e.movementY || 0;
        this.mouse.x = w * 0.5;
        this.mouse.y = h * 0.5;
        this.mouse.nx = 0;
        this.mouse.ny = 0;
        this.mouse.inside = true;
        this.suppressMouseUntilMove = false;
        return;
      }
      const nx = (e.clientX / w) * 2 - 1;
      const ny = -((e.clientY / h) * 2 - 1);
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.nx = nx;
      this.mouse.ny = ny;
      this.mouse.inside = e.clientX >= 0 && e.clientX <= w && e.clientY >= 0 && e.clientY <= h;
      if (this.enabled) this.suppressMouseUntilMove = false;
    };
    this._onPointerLockChange = () => {
      const locked = document.pointerLockElement === this.canvas;
      const wasLocked = this.pointerLocked;
      this.pointerLocked = locked;
      this.mouse.dx = 0;
      this.mouse.dy = 0;
      if (locked) {
        this.mouse.inside = true;
        this.suppressMouseUntilMove = false;
      } else if (wasLocked && !this.altMouse && this.onPointerLockLost) {
        this.onPointerLockLost();
      }
    };
    this._onMouseDown = (e) => {
      if (!this.enabled) return;
      if (!this.pointerLocked && !this.altMouse) this.requestPointerLock();
      const fresh = !this.mouse.buttons.has(e.button);
      this.mouse.buttons.add(e.button);
      if (fresh) this._pressActions('Mouse' + e.button);
      if (e.button === 0 || e.button === 3 || e.button === 4) e.preventDefault();
    };
    this._onMouseUp = (e) => this.mouse.buttons.delete(e.button);
    this._onWheel = (e) => {
      if (!this.enabled) return;
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    };
    this._onBlur = () => this.clear();
    this._onContext = (e) => e.preventDefault();

    window.addEventListener('keydown', this._onKeyDown, { passive: false });
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('wheel', this._onWheel, { passive: false });
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    this.canvas.addEventListener('contextmenu', this._onContext);
  }

  requestPointerLock() {
    if (!this.enabled || this.pointerLocked || this.altMouse) return;
    try {
      const request = this.canvas.requestPointerLock?.();
      if (request?.catch) request.catch(() => {});
    } catch {
      // Unsupported or not a user gesture: relative movement still works.
    }
  }

  exitPointerLock() {
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
  }

  releaseMouseForUi() {
    this.altMouse = true;
    this.exitPointerLock();
  }

  captureMouseForFlight() {
    this.altMouse = false;
    this.requestPointerLock();
  }

  consumeMouseDelta() {
    const out = { dx: this.mouse.dx, dy: this.mouse.dy };
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    return out;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled) {
      this.suppressMouseUntilMove = true;
      this.mouse.inside = true;
      this.mouse.x = window.innerWidth * 0.5;
      this.mouse.y = window.innerHeight * 0.5;
    }
    if (!enabled) this.clear();
  }

  clear() {
    this.keys.clear();
    this.pressed.clear();
    this.actionPressed.clear();
    this._eventPressed.clear();
    this._actionCacheKey = null;
    this.mouse.buttons.clear();
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.wheel = 0;
  }

  endFrame() {
    this.pressed.clear();
    this.actionPressed.clear();
    this._eventPressed.clear();
    this.wheel = 0;
  }

  isDown(code) {
    return this.keys.has(code);
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  setBindings(bindings) {
    this.bindings = normalizeBindings(bindings);
    this.clear();
  }

  _controlCodes(extra = []) {
    const codes = new Set([...this.keys, ...extra].map(normalizeKeyCode).filter(Boolean));
    for (const button of this.mouse.buttons) codes.add('Mouse' + button);
    return codes;
  }

  getActions() {
    const codes = this._controlCodes(), key = [...codes].sort().join(',');
    if (key !== this._actionCacheKey) {
      this._actionCacheKey = key;
      this._actionCache = activeControlActions(this.bindings, codes);
    }
    return this._actionCache;
  }

  _pressActions(code) {
    const active = this.getActions(), codes = this._controlCodes();
    // A later key may complete a chord after its single-key action was latched.
    for (const action of this.actionPressed)
      if (!active.has(action) && this.bindings[action].some((chord) => chord.every((key) => codes.has(key))))
        this.actionPressed.delete(action);
    for (const action of active)
      if (this.bindings[action].some((chord) => chord.includes(code))) this.actionPressed.add(action);
  }

  getPressedActions() {
    // Only injected debug presses need reconstruction. Real events were resolved
    // while held; combining all taps here would invent non-simultaneous chords.
    const injected = [...this.pressed].filter((code) => !this._eventPressed.has(code));
    const actions = new Set(this.actionPressed), codes = this._controlCodes(injected),
      pressed = new Set(injected.map(normalizeKeyCode));
    for (const action of activeControlActions(this.bindings, codes))
      if (this.bindings[action].some((chord) => chord.some((code) => pressed.has(code)))) actions.add(action);
    return actions;
  }

  isActionDown(action) {
    return this.getActions().has(action);
  }

  bindingLabel(action) {
    return formatBinding(this.bindings, action);
  }

  mouseDown(button = 0) {
    return this.mouse.buttons.has(button);
  }

  get cursor() {
    return this.mouse;
  }
}
