// Touch controls for phones and tablets: a virtual stick on the left,
// drag-to-look on the right, and buttons for the main actions.

export function isTouchDevice() {
  // a touch-first device: coarse pointer and no mouse/trackpad available
  const mm = (q) => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q).matches : false);
  return mm('(pointer: coarse)') && !mm('(any-pointer: fine)');
}

export class TouchControls {
  constructor(root, input) {
    this.input = input;
    this.el = document.createElement('div');
    this.el.className = 'touch hidden';
    this.el.innerHTML = `
      <div class="t-stick"><div class="t-knob"></div></div>
      <div class="t-btns">
        <button data-key="KeyE">Use</button>
        <button data-key="KeyF">Light</button>
        <button data-key="KeyQ">Drink</button>
        <button data-toggle="ShiftLeft">Run</button>
        <button data-toggle="ControlLeft">Crouch</button>
        <button data-key="Escape">❚❚</button>
      </div>`;
    root.appendChild(this.el);
    this.stick = this.el.querySelector('.t-stick');
    this.knob = this.el.querySelector('.t-knob');
    this.stickId = null;
    this.lookId = null;
    this.lastLook = null;
    input.stick = { x: 0, y: 0 };
    const opts = { passive: false };
    this.el.addEventListener('touchstart', (e) => this.start(e), opts);
    this.el.addEventListener('touchmove', (e) => this.move(e), opts);
    this.el.addEventListener('touchend', (e) => this.end(e), opts);
    this.el.addEventListener('touchcancel', (e) => this.end(e), opts);
    for (const b of this.el.querySelectorAll('button')) {
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (b.dataset.key) {
          input.pressed.add(b.dataset.key);
        } else if (b.dataset.toggle) {
          const k = b.dataset.toggle;
          if (input.down.has(k)) {
            input.down.delete(k);
            b.classList.remove('on');
          } else {
            input.down.add(k);
            b.classList.add('on');
          }
        }
      });
    }
  }

  show(on) {
    this.el.classList.toggle('hidden', !on);
    if (!on) {
      this.input.stick.x = this.input.stick.y = 0;
      this.knob.style.transform = '';
    }
  }

  start(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.clientX < window.innerWidth * 0.42 && this.stickId === null) {
        this.stickId = t.identifier;
        this.origin = [t.clientX, t.clientY];
        this.stick.style.left = t.clientX - 60 + 'px';
        this.stick.style.top = t.clientY - 60 + 'px';
        this.stick.classList.add('on');
      } else if (this.lookId === null) {
        this.lookId = t.identifier;
        this.lastLook = [t.clientX, t.clientY];
      }
    }
  }

  move(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.stickId) {
        let dx = (t.clientX - this.origin[0]) / 55;
        let dy = (t.clientY - this.origin[1]) / 55;
        const l = Math.hypot(dx, dy);
        if (l > 1) {
          dx /= l;
          dy /= l;
        }
        this.input.stick.x = dx;
        this.input.stick.y = dy;
        this.knob.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
      } else if (t.identifier === this.lookId) {
        this.input.mouseDX += (t.clientX - this.lastLook[0]) * 1.6;
        this.input.mouseDY += (t.clientY - this.lastLook[1]) * 1.6;
        this.lastLook = [t.clientX, t.clientY];
      }
    }
  }

  end(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this.stickId) {
        this.stickId = null;
        this.input.stick.x = this.input.stick.y = 0;
        this.knob.style.transform = '';
        this.stick.classList.remove('on');
      } else if (t.identifier === this.lookId) {
        this.lookId = null;
      }
    }
  }
}
