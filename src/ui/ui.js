// DOM user interface: menus, HUD, notes, journal, death, endings, camcorder.

import { INTRO_QUOTE } from '../notes.js';

const h = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class UI {
  constructor(root) {
    this.root = root;
    this.screens = {};
    this.cb = {};
    this.buildHUD();
    this.buildVHS();
  }

  on(name, fn) {
    this.cb[name] = fn;
  }

  emit(name, ...a) {
    if (this.cb[name]) this.cb[name](...a);
  }

  screen(name, el) {
    if (this.screens[name]) this.screens[name].remove();
    el.classList.add('screen');
    this.screens[name] = el;
    this.root.appendChild(el);
    return el;
  }

  close(name) {
    if (this.screens[name]) {
      this.screens[name].remove();
      delete this.screens[name];
    }
  }

  isOpen(name) {
    return !!this.screens[name];
  }

  btn(label, fn, opts = {}) {
    const b = h('button', 'btn', esc(label));
    if (opts.disabled) b.disabled = true;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.emit('uiclick');
      fn();
    });
    b.addEventListener('mouseenter', () => this.emit('uihover'));
    return b;
  }

  // ---------------------------------------------------------------- menu

  showMenu({ hasSave, saveInfo }) {
    const el = h('div', 'menu');
    el.appendChild(h('h1', '', 'THE<br>BACKROOMS'));
    el.appendChild(h('div', 'tag', esc(INTRO_QUOTE.split('\n\n')[0])));
    const btns = h('div', 'btns');
    if (hasSave) btns.appendChild(this.btn(`Continue — ${saveInfo}`, () => this.emit('continue')));
    btns.appendChild(this.btn('New Game', () => this.emit('newgame')));
    btns.appendChild(this.btn('Settings', () => this.showSettings('menu')));
    btns.appendChild(this.btn('How to Survive', () => this.showControls('menu')));
    btns.appendChild(this.btn('Credits', () => this.showCredits()));
    el.appendChild(btns);
    el.appendChild(
      h(
        'div',
        'foot',
        'Headphones recommended. Click to capture the mouse, <b>Esc</b> to pause.<br>A fan game inspired by the Backrooms creepypasta (2019), the Backrooms Wikidot community and Kane Pixels\' <i>The Backrooms (Found Footage)</i>.'
      )
    );
    this.screen('menu', el);
  }

  hideMenu() {
    this.close('menu');
  }

  showCredits() {
    const el = h('div', 'overlay');
    const p = h('div', 'panel');
    p.innerHTML = `<h2>CREDITS</h2>
      <p>The Backrooms began as an anonymous 4chan post in May 2019: a single photo of an empty yellow office and a few lines about noclipping out of reality. The quote on the title screen is from that post.</p>
      <p>Levels, entities, Almond Water and the M.E.G. come from the collaborative fiction of the <b>Backrooms Wikidot</b> community (CC BY-SA). The Howler, the Async Research Institute and the camcorder aesthetic are a tribute to <b>Kane Pixels'</b> <i>The Backrooms (Found Footage)</i>.</p>
      <p>This is an unofficial fan game. Every texture, model and sound in it is generated procedurally in your browser.</p>`;
    const b = h('div', 'btns');
    b.appendChild(this.btn('Back', () => this.close('credits')));
    p.appendChild(b);
    el.appendChild(p);
    this.screen('credits', el);
  }

  showControls(from) {
    const el = h('div', 'overlay');
    const p = h('div', 'panel');
    p.innerHTML = `<h2>HOW TO SURVIVE</h2>
      <div class="keys">
        <kbd>W A S D</kbd><span>Move</span>
        <kbd>Mouse</kbd><span>Look</span>
        <kbd>Shift</kbd><span>Sprint (uses stamina, makes noise)</span>
        <kbd>Ctrl / C</kbd><span>Crouch — quieter, slower</span>
        <kbd>Space</kbd><span>Jump</span>
        <kbd>E</kbd><span>Interact / pick up / open doors</span>
        <kbd>F</kbd><span>Flashlight (drains battery)</span>
        <kbd>Q</kbd><span>Drink Almond Water (restores thirst + sanity)</span>
        <kbd>R</kbd><span>Eat a Royal Ration (restores health)</span>
        <kbd>Tab / J</kbd><span>Journal: notes found, current level</span>
        <kbd>V</kbd><span>Camcorder (VHS found-footage view)</span>
        <kbd>Esc</kbd><span>Pause</span>
      </div>
      <h3>Staying alive</h3>
      <p><b>Thirst</b> drains over time. <b>Sanity</b> drains faster in the dark and near entities; at low sanity you will see and hear things that aren't there. Almond Water fixes both. Batteries keep your flashlight alive.</p>
      <p>Each level has its own way out. On Level 0 it's a <b>glitching wall</b> — listen for static and walk into it. Read the notes you find: other wanderers and the M.E.G. left instructions for every level and every entity.</p>`;
    const b = h('div', 'btns');
    b.appendChild(this.btn('Back', () => this.close('controls')));
    p.appendChild(b);
    el.appendChild(p);
    this.screen('controls', el);
    void from;
  }

  showSettings(from, settings, onChange) {
    settings = settings || this.settings;
    onChange = onChange || this.onSettings;
    this.settings = settings;
    this.onSettings = onChange;
    const el = h('div', 'overlay');
    const p = h('div', 'panel');
    p.appendChild(h('h2', '', 'SETTINGS'));
    const row = (label, input, valFn) => {
      const r = h('div', 'row');
      r.appendChild(h('label', '', esc(label)));
      const wrap = h('div', '');
      wrap.style.display = 'flex';
      wrap.style.alignItems = 'center';
      wrap.appendChild(input);
      if (valFn) {
        const v = h('span', 'val', valFn());
        wrap.appendChild(v);
        input.addEventListener('input', () => (v.textContent = valFn()));
      }
      r.appendChild(wrap);
      p.appendChild(r);
    };
    const slider = (key, min, max, step, fmt = (v) => v) => {
      const i = h('input');
      i.type = 'range';
      i.min = min;
      i.max = max;
      i.step = step;
      i.value = settings[key];
      i.addEventListener('input', () => {
        settings[key] = parseFloat(i.value);
        onChange(settings, key);
      });
      return [i, () => fmt(settings[key])];
    };
    const check = (key) => {
      const i = h('input');
      i.type = 'checkbox';
      i.checked = !!settings[key];
      i.addEventListener('change', () => {
        settings[key] = i.checked;
        onChange(settings, key);
      });
      return i;
    };
    const pct = (v) => Math.round(v * 100) + '%';
    let s;
    s = slider('sens', 0.2, 3, 0.05, (v) => v.toFixed(2));
    row('Mouse sensitivity', ...s);
    row('Invert mouse Y', check('invertY'));
    s = slider('fov', 60, 100, 1, (v) => v + '°');
    row('Field of view', ...s);
    s = slider('master', 0, 1, 0.01, pct);
    row('Master volume', ...s);
    s = slider('ambience', 0, 1, 0.01, pct);
    row('Ambience (hum, room tone)', ...s);
    s = slider('music', 0, 1, 0.01, pct);
    row('Music', ...s);
    row('VHS camcorder mode', check('vhs'));
    row('Film grain', check('grain'));
    row('Bloom', check('bloom'));
    s = slider('brightness', 0.6, 1.6, 0.05, pct);
    row('Brightness', ...s);
    s = slider('renderScale', 0.4, 1, 0.05, pct);
    row('Render scale (performance)', ...s);
    s = slider('viewDist', 1, 3, 1, (v) => ['', 'Near', 'Normal', 'Far'][v]);
    row('View distance', ...s);
    s = slider('headBob', 0, 1.5, 0.05, pct);
    row('Head bob', ...s);
    row('Sound captions', check('captions'));
    row('Show FPS', check('showFps'));
    const b = h('div', 'btns');
    b.appendChild(this.btn('Back', () => this.close('settings')));
    p.appendChild(b);
    el.appendChild(p);
    this.screen('settings', el);
    void from;
  }

  // ---------------------------------------------------------------- pause

  showPause() {
    const el = h('div', 'overlay');
    const p = h('div', 'panel');
    p.appendChild(h('h2', '', 'PAUSED'));
    const b = h('div', 'btns');
    b.style.flexDirection = 'column';
    b.style.alignItems = 'flex-start';
    b.style.gap = '4px';
    b.appendChild(this.btn('Resume', () => this.emit('resume')));
    b.appendChild(this.btn('Journal', () => this.emit('journal')));
    b.appendChild(this.btn('Settings', () => this.showSettings('pause')));
    b.appendChild(this.btn('How to Survive', () => this.showControls('pause')));
    b.appendChild(this.btn('Save & Quit to Menu', () => this.emit('quit')));
    p.appendChild(b);
    el.appendChild(p);
    this.screen('pause', el);
  }

  hidePause() {
    this.close('pause');
    this.close('settings');
    this.close('controls');
  }

  // ---------------------------------------------------------------- click to play

  showClickToPlay(text = 'Click to continue') {
    const el = h('div', '');
    el.style.cursor = 'pointer';
    el.appendChild(h('div', 'click-hint', esc(text)));
    el.addEventListener('click', () => this.emit('clickplay'));
    this.screen('click', el);
  }

  hideClickToPlay() {
    this.close('click');
  }

  // ---------------------------------------------------------------- loading

  showLoading(text, sub = '') {
    const el = h('div', 'loading');
    const w = h('div', '');
    w.appendChild(h('div', 'txt', esc(text)));
    if (sub) w.appendChild(h('div', 'sub', esc(sub).replace(/\n/g, '<br>')));
    el.appendChild(w);
    this.screen('loading', el);
  }

  hideLoading() {
    this.close('loading');
  }

  // ---------------------------------------------------------------- HUD

  buildHUD() {
    const hud = (this.hud = h('div', 'hud hidden'));
    this.cross = h('div', 'crosshair');
    hud.appendChild(this.cross);
    this.promptEl = h('div', 'prompt hidden');
    hud.appendChild(this.promptEl);
    const stats = h('div', 'stats');
    this.statEls = {};
    for (const [k, ico] of [
      ['health', '+'],
      ['sanity', '◎'],
      ['thirst', '▿'],
      ['stamina', '»'],
      ['battery', '▮'],
    ]) {
      const s = h('div', 'stat');
      s.appendChild(h('span', 'ico', ico));
      const bar = h('div', 'bar');
      const fill = h('i', '');
      bar.appendChild(fill);
      s.appendChild(bar);
      s.title = k;
      stats.appendChild(s);
      this.statEls[k] = { el: s, fill, shown: 1 };
    }
    hud.appendChild(stats);
    this.hotbar = h('div', 'hotbar');
    hud.appendChild(this.hotbar);
    this.toastWrap = h('div', 'toast-wrap');
    hud.appendChild(this.toastWrap);
    this.capWrap = h('div', 'caption-wrap');
    hud.appendChild(this.capWrap);
    this.introEl = h('div', 'intro hidden');
    hud.appendChild(this.introEl);
    this.objEl = h('div', 'objective');
    hud.appendChild(this.objEl);
    this.fpsEl = h('div', 'fps hidden');
    hud.appendChild(this.fpsEl);
    this.root.appendChild(hud);
  }

  showHUD(on) {
    this.hud.classList.toggle('hidden', !on);
  }

  setStats(p, t) {
    const vals = {
      health: p.health,
      sanity: p.sanity,
      thirst: p.thirst,
      stamina: p.stamina,
      battery: p.battery,
    };
    for (const k in vals) {
      const e = this.statEls[k];
      const v = Math.max(0, Math.min(100, vals[k]));
      e.fill.style.width = v.toFixed(1) + '%';
      const low = v < 25;
      e.el.classList.toggle('low', low);
      // hide full bars to keep the screen clean
      let show = v < 99 || low;
      if (k === 'battery') show = p.flashlight || v < 30;
      if (k === 'health') show = v < 99;
      e.el.style.opacity = show ? '1' : '0';
    }
    void t;
  }

  setInventory(inv) {
    const key = `${inv.almond}|${inv.battery}|${inv.ration}`;
    if (key === this._invKey) return;
    this._invKey = key;
    this.hotbar.innerHTML = '';
    const slot = (n, label, k) => {
      const s = h('div', 'slot' + (n ? '' : ' empty'), `<b>${n}</b>${esc(label)}<br><span style="opacity:.6">[${k}]</span>`);
      this.hotbar.appendChild(s);
    };
    slot(inv.almond, 'Almond W.', 'Q');
    slot(inv.ration, 'Ration', 'R');
    slot(inv.battery, 'Battery', 'auto');
  }

  setPrompt(text, key = 'E') {
    if (!text) {
      this.promptEl.classList.add('hidden');
      this.cross.classList.remove('active');
      return;
    }
    if (this._prompt !== text) {
      this.promptEl.innerHTML = `<kbd>${esc(key)}</kbd>${esc(text)}`;
      this._prompt = text;
    }
    this.promptEl.classList.remove('hidden');
    this.cross.classList.add('active');
  }

  toast(msg) {
    const t = h('div', 'toast', esc(msg));
    this.toastWrap.appendChild(t);
    setTimeout(() => t.remove(), 3500);
    while (this.toastWrap.children.length > 4) this.toastWrap.firstChild.remove();
  }

  caption(msg) {
    if (!this.captions) return;
    const t = h('div', 'caption', esc(msg));
    this.capWrap.appendChild(t);
    setTimeout(() => t.remove(), 3100);
    while (this.capWrap.children.length > 3) this.capWrap.firstChild.remove();
  }

  levelIntro(level) {
    const el = this.introEl;
    el.innerHTML = '';
    el.classList.remove('hidden');
    el.style.opacity = '1';
    const lv = h('div', 'lv', '');
    const nm = h('div', 'nm', '');
    const cls = h('div', 'cls', '');
    const tags = h('div', 'tags', '');
    el.append(lv, nm, cls, tags);
    const full = [
      [lv, 'LEVEL ' + level.number],
      [nm, level.name],
      [cls, 'Survival Difficulty: ' + level.survival],
    ];
    let i = 0;
    let c = 0;
    clearInterval(this._introTimer);
    this._introTimer = setInterval(() => {
      if (i >= full.length) {
        clearInterval(this._introTimer);
        for (const tg of level.tags || []) tags.appendChild(h('span', '', esc(tg)));
        clearTimeout(this._introFade);
        this._introFade = setTimeout(() => (el.style.opacity = '0'), 6500);
        return;
      }
      const [node, text] = full[i];
      c++;
      node.textContent = text.slice(0, c);
      if (c >= text.length) {
        i++;
        c = 0;
      }
    }, 45);
  }

  setObjective(text) {
    if (this._obj === text) return;
    this._obj = text;
    this.objEl.style.opacity = '0';
    clearTimeout(this._objT);
    this._objT = setTimeout(() => {
      this.objEl.textContent = text || '';
      this.objEl.style.opacity = text ? '1' : '0';
    }, 400);
  }

  setFps(fps, show) {
    this.fpsEl.classList.toggle('hidden', !show);
    if (show) this.fpsEl.textContent = fps.toFixed(0) + ' FPS';
  }

  // ---------------------------------------------------------------- notes / journal

  showNote(note, onClose) {
    const el = h('div', 'note-screen');
    const p = h('div', 'paper ' + (note.kind === 'async' ? 'async' : note.kind === 'meg' ? 'meg' : ''));
    const hdr = note.kind === 'async' ? 'Async Research Institute' : note.kind === 'meg' ? 'Major Explorer Group' : 'Torn notebook page';
    p.appendChild(h('div', 'hdr', esc(hdr)));
    if (note.stamp) p.appendChild(h('div', 'stamp', esc(note.stamp)));
    if (note.title) p.appendChild(h('h4', '', esc(note.title)));
    p.appendChild(h('p', '', esc(note.body)));
    if (note.sig) p.appendChild(h('div', 'sig', esc(note.sig)));
    p.appendChild(h('div', 'close-hint', 'click or press E / Esc to close'));
    el.appendChild(p);
    el.addEventListener('click', () => onClose && onClose());
    this.screen('note', el);
  }

  hideNote() {
    this.close('note');
  }

  showJournal({ notes, level, deaths, time, onClose, onOpenNote }) {
    const el = h('div', 'overlay journal');
    const p = h('div', 'panel');
    p.appendChild(h('h2', '', 'JOURNAL'));
    p.appendChild(
      h(
        'p',
        '',
        `Currently on <b>Level ${esc(level.number)} — ${esc(level.name)}</b>. ${esc(level.hint || '')}<br>Time in the Backrooms: ${esc(time)} · Deaths: ${deaths}`
      )
    );
    p.appendChild(h('h3', '', `Notes found (${notes.length})`));
    const list = h('div', 'list');
    if (!notes.length) list.appendChild(h('p', '', 'Nothing yet. Wanderers leave notes on the floor near walls.'));
    for (const n of notes) {
      const e = h('div', 'entry', `${esc(n.title || 'Untitled')} <small>${esc(n.kind === 'async' ? 'ASYNC' : n.kind === 'meg' ? 'M.E.G.' : 'wanderer')} · ${esc(n.levelName || '')}</small>`);
      e.addEventListener('click', () => onOpenNote(n));
      list.appendChild(e);
    }
    p.appendChild(list);
    const b = h('div', 'btns');
    b.appendChild(this.btn('Close', () => onClose()));
    p.appendChild(b);
    el.appendChild(p);
    this.screen('journal', el);
  }

  hideJournal() {
    this.close('journal');
  }

  // ---------------------------------------------------------------- death / ending

  showDeath({ cause, text, onRetry, onMenu }) {
    const el = h('div', 'death');
    el.appendChild(h('h1', '', 'YOU DIED'));
    el.appendChild(h('p', '', esc(text || '')));
    el.appendChild(h('p', '', `<span style="opacity:.6">${esc(cause || '')}</span>`));
    const b = h('div', 'btns');
    b.appendChild(this.btn('Wake up', onRetry));
    b.appendChild(this.btn('Main menu', onMenu));
    el.appendChild(b);
    this.screen('death', el);
  }

  hideDeath() {
    this.close('death');
  }

  showEnding({ title, paragraphs, stats, onMenu }) {
    const el = h('div', 'ending');
    el.appendChild(h('h1', '', esc(title)));
    for (const para of paragraphs) el.appendChild(h('p', '', esc(para)));
    if (stats) el.appendChild(h('div', 'stats-line', esc(stats)));
    const b = h('div', 'btns');
    b.style.marginTop = '26px';
    b.appendChild(this.btn('Main menu', onMenu));
    el.appendChild(b);
    el.style.opacity = '0';
    el.style.transition = 'opacity 3s';
    this.screen('ending', el);
    requestAnimationFrame(() => (el.style.opacity = '1'));
  }

  // ---------------------------------------------------------------- camcorder

  buildVHS() {
    const v = (this.vhsEl = h('div', 'vhs hidden'));
    v.innerHTML = `<div class="corner c1"></div><div class="corner c2"></div><div class="corner c3"></div><div class="corner c4"></div>
      <div class="rec"><i></i>REC</div><div class="mode">SP</div><div class="batt"></div>
      <div class="time"></div><div class="counter"></div>`;
    this.vhsTime = v.querySelector('.time');
    this.vhsCounter = v.querySelector('.counter');
    this.vhsBatt = v.querySelector('.batt');
    this.root.appendChild(v);
  }

  setVHS(on) {
    this.vhsEl.classList.toggle('hidden', !on);
  }

  updateVHS(elapsed, battery) {
    if (this.vhsEl.classList.contains('hidden')) return;
    // the timestamp starts at the moment you noclipped in
    const start = this.vhsStart || (this.vhsStart = new Date(1996, 4, 12, 0, 13, 0).getTime());
    const d = new Date(start + elapsed * 1000);
    const mon = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getMonth()];
    let hh = d.getHours();
    const ap = hh >= 12 ? 'PM' : 'AM';
    hh = hh % 12 || 12;
    const p2 = (n) => String(n).padStart(2, '0');
    const txt = `${ap} ${hh}:${p2(d.getMinutes())}<br>${mon}. ${p2(d.getDate())} ${d.getFullYear()}`;
    if (txt !== this._vt) {
      this.vhsTime.innerHTML = txt;
      this._vt = txt;
    }
    const s = Math.floor(elapsed);
    const c = `${Math.floor(s / 3600)}:${p2(Math.floor(s / 60) % 60)}:${p2(s % 60)}`;
    if (c !== this._vc) {
      this.vhsCounter.textContent = c;
      this._vc = c;
    }
    const bars = Math.ceil(battery / 25);
    const b = '▮'.repeat(bars) + '▯'.repeat(4 - bars);
    if (b !== this._vb) {
      this.vhsBatt.textContent = b;
      this._vb = b;
    }
  }
}
