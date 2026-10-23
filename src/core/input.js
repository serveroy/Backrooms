// Keyboard + mouse input with pointer lock.

export const DEFAULT_BINDS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  crouch: ['ControlLeft', 'KeyC'],
  jump: ['Space'],
  interact: ['KeyE'],
  flashlight: ['KeyF'],
  drink: ['KeyQ'],
  journal: ['Tab', 'KeyJ'],
  camcorder: ['KeyV'],
  pause: ['Escape', 'KeyP'],
  eat: ['KeyR'],
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set(); // keys pressed this frame
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.locked = false;
    this.binds = DEFAULT_BINDS;
    this.onLockChange = null;
    this.enabled = true;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || (e.code === 'Space' && this.locked)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    window.addEventListener('blur', () => this.down.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // ignore absurd spikes some browsers emit on lock
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
      if (this.locked) this.pressed.add('Mouse' + e.button);
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.down.clear();
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  lock() {
    if (document.pointerLockElement === this.canvas) return;
    const p = this.canvas.requestPointerLock?.({ unadjustedMovement: true });
    if (p && p.catch) {
      p.catch(() => {
        // unadjustedMovement unsupported: retry plain
        const p2 = this.canvas.requestPointerLock?.();
        if (p2 && p2.catch) p2.catch(() => {});
      });
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  is(action) {
    const keys = this.binds[action];
    for (const k of keys) if (this.down.has(k)) return true;
    return false;
  }

  hit(action) {
    const keys = this.binds[action];
    for (const k of keys) if (this.pressed.has(k)) return true;
    return false;
  }

  consumeMouse() {
    const d = [this.mouseDX, this.mouseDY];
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  endFrame() {
    this.pressed.clear();
  }
}
