// Game orchestrator: modes, level flow, survival systems, audio mix,
// camera and post-processing.

import * as THREE from 'three';
import { World } from './world/world.js';
import { G } from './world/materials.js';
import { setAnisotropy } from './world/textures.js';
import './world/textures_industrial.js';
import './world/textures_interior.js';
import { CELL, F_GLITCH, F_SOLID, F_BLOCK } from './world/layout.js';
import { PostFX } from './render/post.js';
import { Input } from './core/input.js';
import { AudioEngine } from './audio/audio.js';
import { UI } from './ui/ui.js';
import { Player } from './player/player.js';
import { Items, ITEM_NAMES } from './items.js';
import { EntityManager } from './entities/base.js';
import { ENTITY_TYPES } from './entities/index.js';
import { getLevel } from './levels/index.js';
import { loadSettings, saveSettings } from './core/settings.js';
import { loadGame, saveGame, newGameState } from './core/save.js';
import { NOTES, notesForLevel, noteById, INTRO_QUOTE } from './notes.js';
import { strHash, hashf, clamp } from './core/rng.js';

const MENU_SEED = 7331;

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.settings = loadSettings();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setClearColor(0x000000, 1);
    setAnisotropy(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.04, 140);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.camForward = new THREE.Vector3(0, 0, -1);
    this.world = new World(this.scene);
    this.post = new PostFX(this.renderer, this.scene, this.camera);
    this.input = new Input(canvas);
    this.audio = new AudioEngine();
    this.ui = new UI(uiRoot);
    this.player = new Player(this.world);
    this.items = new Items(this);
    this.entities = new EntityManager(this);
    this.world.onChunkBuilt = (c) => {
      this.items.onChunkBuilt(c);
      this.onChunkInteract(c, true);
    };
    this.world.onChunkRemoved = (c) => {
      this.items.onChunkRemoved(c);
      this.onChunkInteract(c, false);
    };
    this.world.fixtures.onSputter = (f) => this.onSputter(f);
    this.interactables = new Map();
    this.mode = 'boot';
    this.state = null;
    this.level = null;
    this.levelTime = 0;
    this.noise = 0;
    this.playerLight = 1;
    this.fear = 0;
    this.damageFlash = 0;
    this.glitch = 0;
    this.fade = 1;
    this.blink = 0;
    this.redTint = 0;
    this.lightT = 0;
    this.humT = 0;
    this.heartT = 0;
    this.saveT = 30;
    this.breathT = 0;
    this.camPose = {};
    this.fps = 60;
    this.levelState = {};
    this.lightScale = 1;
    this.vhsOn = this.settings.vhs;
    this.applySettings();
    this.bindUI();
    this.input.onLockChange = (locked) => this.onLockChange(locked);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.last = performance.now();
    this.enterMenu();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ================================================================ setup

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, 1.5) * this.settings.renderScale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, pr);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  applySettings(key) {
    const s = this.settings;
    this.player.sens = 0.0022 * s.sens;
    this.player.invertY = s.invertY;
    this.audio.setVolumes({ master: s.master, ambience: s.ambience, music: s.music });
    this.post.setBloom(s.bloom);
    this.post.u.uGrain.value = s.grain ? 0.045 : 0;
    this.ui.captions = s.captions;
    this.world.loadRadius = s.viewDist;
    if (key === 'vhs') this.setVHS(s.vhs);
    if (key === 'renderScale') this.resize();
    saveSettings(s);
  }

  setVHS(on) {
    this.vhsOn = on;
    this.settings.vhs = on;
    this.ui.setVHS(on && (this.mode === 'play' || this.mode === 'loading'));
  }

  bindUI() {
    const ui = this.ui;
    ui.settings = this.settings;
    ui.onSettings = (s, key) => this.applySettings(key);
    ui.on('newgame', () => {
      this.audio.start();
      this.newGame();
    });
    ui.on('continue', () => {
      this.audio.start();
      this.continueGame();
    });
    ui.on('resume', () => this.resume());
    ui.on('quit', () => {
      this.persist();
      this.enterMenu();
    });
    ui.on('journal', () => this.openJournal(true));
    ui.on('clickplay', () => {
      this.audio.start();
      this.input.lock();
    });
    ui.on('uiclick', () => this.audio.play('click', { gain: 0.15 }));
  }

  // ================================================================ menu / flow

  enterMenu() {
    this.mode = 'menu';
    this.input.unlock();
    this.ui.showHUD(false);
    this.ui.setVHS(false);
    this.ui.hidePause();
    this.ui.hideDeath();
    this.ui.close('ending');
    this.ui.close('journal');
    this.ui.hideNote();
    this.ui.hideLoading();
    this.ui.hideClickToPlay();
    this.entities.clear();
    this.items.clear();
    this.level = getLevel('level0');
    this.state = { seed: MENU_SEED, picked: {}, notes: [], inv: {}, deaths: 0 };
    this.world.setLevel(this.level, MENU_SEED);
    this.applyLevelLook(this.level);
    const sp = this.findSpawn(this.level, MENU_SEED);
    this.menuCam = { x: sp.x, z: sp.z, yaw: sp.yaw, t: 0, turn: 0 };
    this.player.place(sp.x, sp.z, sp.yaw);
    this.fade = 1;
    const save = loadGame();
    const info = save ? `Level ${getLevel(save.levelId).number}` : '';
    this.ui.showMenu({ hasSave: !!save, saveInfo: info });
    if (this.audio.ready) this.startAmbience(this.level);
  }

  newGame() {
    const seed = (Math.random() * 1e9) | 0;
    this.state = newGameState(seed);
    this.ui.hideMenu();
    this.introSequence();
  }

  continueGame() {
    const s = loadGame();
    if (!s) return this.newGame();
    this.state = s;
    this.ui.hideMenu();
    this.enterLevel(s.levelId, { fromSave: true });
  }

  introSequence() {
    this.mode = 'intro';
    this.ui.showLoading('', INTRO_QUOTE);
    this.audio.stopAllLayers();
    // a mundane moment, then you lean on a wall that isn't there
    setTimeout(() => {
      if (this.mode !== 'intro') return;
      this.audio.play('noclip');
      this.glitch = 1;
      setTimeout(() => {
        if (this.mode !== 'intro') return;
        this.enterLevel('level0', { first: true });
      }, 1600);
    }, 7000);
    this.ui.screens.loading.addEventListener('click', () => {
      if (this.mode === 'intro') {
        this.audio.play('noclip');
        this.enterLevel('level0', { first: true });
      }
    });
  }

  findSpawn(level, seed) {
    const sp = level.spawnPoint(seed, this.world);
    // nudge to the nearest open cell
    const gx = Math.floor(sp.x / CELL);
    const gz = Math.floor(sp.z / CELL);
    for (let r = 0; r < 30; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          let ok = true;
          for (let oz = -1; oz <= 1 && ok; oz++) for (let ox = -1; ox <= 1; ox++) if (this.world.flagsG(gx + dx + ox, gz + dz + oz) & (F_SOLID | F_BLOCK | F_GLITCH)) ok = false;
          if (ok) return { x: (gx + dx + 0.5) * CELL, z: (gz + dz + 0.5) * CELL, yaw: sp.yaw };
        }
      }
    }
    return sp;
  }

  levelSeed(id) {
    return (this.state.seed ^ strHash(id)) >>> 0;
  }

  enterLevel(id, opts = {}) {
    const level = getLevel(id);
    this.mode = 'loading';
    this.ui.hideMenu();
    this.ui.hidePause();
    this.ui.hideDeath();
    this.ui.close('ending');
    this.ui.showHUD(false);
    this.ui.showLoading(`LEVEL ${level.number}`, level.name);
    this.entities.clear();
    this.items.clear();
    this.interactables.clear();
    this.clearLevelObjects();
    this.redTint = 0;
    this.level = level;
    this.levelState = {};
    this.levelTime = 0;
    const seed = this.levelSeed(id);
    this.world.setLevel(level, seed);
    this.applyLevelLook(level);
    const sp = this.findSpawn(level, seed);
    const p = this.player;
    p.place(sp.x, sp.z, sp.yaw);
    p.frozen = false;
    p.noclipping = false;
    const st = this.state;
    if (opts.fromSave || opts.carry) {
      p.health = st.stats.health;
      p.sanity = st.stats.sanity;
      p.thirst = st.stats.thirst;
      p.battery = st.stats.battery;
    }
    if (opts.first) p.resetStats();
    p.stamina = 100;
    p.exhausted = false;
    if (!st.visited.includes(id)) st.visited.push(id);
    st.levelId = id;
    this.persist();
    this.loadingT = 0;
    this.pendingIntro = true;
    this.glitch = Math.max(this.glitch, 0.6);
    this.fade = 1;
    if (this.audio.ready) this.startAmbience(level);
    if (level.onEnter) level.onEnter(this);
  }

  applyLevelLook(level) {
    const c = level.config;
    G.uFogColor.value.setRGB(...c.fogColor);
    G.uFogDensity.value = c.fogDensity;
    this.setLightScale(1);
    const g = c.grade || {};
    this.post.u.uTint.value.set(...(g.tint || [1, 1, 1]));
    this.post.u.uSat.value = g.saturation ?? 1;
    this.post.u.uContrast.value = g.contrast ?? 1;
    this.baseExposure = c.exposure ?? 1;
    this.post.u.uVignette.value = c.vignette ?? 0.32;
    this.scene.background = new THREE.Color(...c.fogColor);
    G.uWaterLevel.value = c.waterLevel ?? -999;
    this.points = [];
    for (const v of G.uPointPos.value) v.w = 0;
    this.camera.far = c.far ?? 140;
    this.camera.updateProjectionMatrix();
  }

  startAmbience(level) {
    const a = this.audio;
    a.stopAllLayers();
    const c = level.config;
    a.setReverb(c.reverb || { size: 1, decay: 1.2, wet: 0.25 });
    if ((c.hum ?? 1) > 0) a.startHum();
    a.startRoomTone();
    a.setRoomTone(c.roomTone ?? 0.05, c.roomCutoff ?? 180);
    if (level.ambience) level.ambience(this, a);
  }

  onLockChange(locked) {
    if (locked) {
      this.ui.hideClickToPlay();
      if (this.mode === 'paused') this.resume();
    } else if (this.mode === 'play') {
      this.pause();
    }
  }

  pause() {
    if (this.mode !== 'play') return;
    this.mode = 'paused';
    this.ui.showPause();
    this.persist();
    if (this.audio.ctx) this.audio.ctx.suspend();
  }

  resume() {
    if (this.mode !== 'paused' && this.mode !== 'journal') return;
    this.ui.hidePause();
    this.ui.hideJournal();
    this.mode = 'play';
    if (this.audio.ctx) this.audio.ctx.resume();
    this.input.lock();
    if (!this.input.locked) this.ui.showClickToPlay('Click to continue');
  }

  persist() {
    if (!this.state || !this.state.version || this.mode === 'menu') return;
    const p = this.player;
    this.state.stats = { health: Math.max(25, p.health), sanity: Math.max(20, p.sanity), thirst: Math.max(20, p.thirst), battery: p.battery };
    saveGame(this.state);
  }

  // ================================================================ interactables

  onChunkInteract(chunk, added) {
    const L = chunk.layout;
    const used = (this.state && this.state.picked && this.state.picked[this.level.id]) || [];
    L.interact.forEach((it, i) => {
      const id = `i:${L.cx},${L.cz},${i}`;
      if (added) this.interactables.set(id, { ...it, id, used: used.includes(id) });
      else this.interactables.delete(id);
    });
  }

  findInteractable(eye, dir) {
    let best = null;
    let bs = -1;
    for (const it of this.interactables.values()) {
      if (it.used && it.once) continue;
      if (it.hidden) continue;
      const y = it.y ?? 1.0;
      const dx = it.x - eye.x;
      const dy = y - eye.y;
      const dz = it.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > (it.reach ?? 2.2)) continue;
      const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / d;
      if (dot < (it.cone ?? 0.8)) continue;
      if (dot > bs) {
        best = it;
        bs = dot;
      }
    }
    return best;
  }

  // ================================================================ gameplay helpers

  toast(msg) {
    this.ui.toast(msg);
  }

  /** Scene objects owned by the current level (removed on level change). */
  addLevelObject(obj) {
    this.levelObjects = this.levelObjects || [];
    this.levelObjects.push(obj);
    this.scene.add(obj);
  }

  clearLevelObjects() {
    for (const o of this.levelObjects || []) this.scene.remove(o);
    this.levelObjects = [];
  }

  /** Brief dynamic point light (sparks, muzzle of a flare...). */
  flashPoint(x, y, z, color, radius = 5, dur = 0.2) {
    this.points = this.points || [];
    this.points.push({ x, y, z, color, radius, t: dur, dur });
    if (this.points.length > 4) this.points.shift();
  }

  updatePoints(dt) {
    const P = G.uPointPos.value;
    const C = G.uPointCol.value;
    const list = this.points || [];
    for (let i = list.length - 1; i >= 0; i--) {
      list[i].t -= dt;
      if (list[i].t <= 0) list.splice(i, 1);
    }
    for (let i = 0; i < 4; i++) {
      const p = list[i];
      if (!p) {
        P[i].w = 0;
        continue;
      }
      const k = (p.t / p.dur) * (Math.random() < 0.3 ? 0.4 : 1);
      P[i].set(p.x, p.y, p.z, p.radius);
      C[i].set(p.color[0] * k, p.color[1] * k, p.color[2] * k);
    }
  }

  /** Global multiplier on all fixture light (blackouts). */
  setLightScale(k) {
    this.lightScale = k;
    G.uLightScale.value = k;
  }

  caption(msg) {
    this.ui.caption(msg);
  }

  pickNoteFor(itemId, assigned) {
    const pool = notesForLevel(this.level.id).filter((n) => !this.state.notes.includes(n.id) && !assigned.has(n.id));
    if (!pool.length) return null;
    // prefer the level's notes in order, so the story reads well
    return pool[0].id;
  }

  hurtPlayer(dmg, cause, src) {
    const p = this.player;
    if (this.mode !== 'play') return;
    p.damage(dmg);
    this.damageFlash = Math.min(1, this.damageFlash + dmg / 50);
    this.audio.play('hurt');
    if (src && src.x !== undefined) {
      // knockback away from the attacker
      const dx = p.x - src.x;
      const dz = p.z - src.z;
      const l = Math.hypot(dx, dz) || 1;
      p.vx += (dx / l) * 5;
      p.vz += (dz / l) * 5;
    }
    p.sanity = Math.max(0, p.sanity - dmg * 0.25);
    if (p.health <= 0) this.die(cause);
  }

  onEntityNoticed() {
    this.audio.play('stinger', { gain: 0.3 });
    this.fear = Math.min(1, this.fear + 0.6);
  }

  onSputter(f) {
    const p = this.player;
    const d = Math.hypot(f.x - p.x, f.z - p.z);
    if (d < 14 && this.mode === 'play') this.audio.play('sputter', { pos: [f.x, f.y, f.z], gain: 0.22 });
  }

  die(cause) {
    if (this.mode === 'dead') return;
    this.mode = 'dead';
    this.state.deaths = (this.state.deaths || 0) + 1;
    this.input.unlock();
    this.audio.play('stinger', { gain: 0.5, base: 140, dur: 3 });
    const flavor = [
      'The lights keep humming. They will hum long after you are gone.',
      'Somewhere, a fluorescent tube flickers once, as if in acknowledgment.',
      'The carpet will be damp where you fell. It always is.',
      'Your camera keeps recording for another forty-one minutes.',
    ];
    this.ui.showHUD(false);
    this.ui.setVHS(false);
    this.ui.showDeath({
      cause,
      text: flavor[Math.floor(Math.random() * flavor.length)],
      onRetry: () => this.respawn(),
      onMenu: () => {
        this.persist();
        this.enterMenu();
      },
    });
  }

  respawn() {
    const p = this.player;
    this.ui.hideDeath();
    p.resetStats();
    p.sanity = 75;
    p.thirst = 70;
    this.state.stats = { health: 100, sanity: 75, thirst: 70, battery: Math.max(40, p.battery) };
    this.enterLevel(this.state.levelId, { carry: true });
  }

  /** Begin a transition to another level (noclip or door). */
  transition(target, kind = 'noclip') {
    if (this.mode !== 'play') return;
    this.mode = 'transition';
    this.transT = 0;
    this.transKind = kind;
    this.transTarget = target;
    const p = this.player;
    p.frozen = true;
    if (kind === 'noclip') {
      this.audio.play('noclip');
      this.caption('[reality tears]');
    } else if (kind === 'door') {
      this.audio.play('door');
    } else if (kind === 'fall') {
      this.audio.play('noclip');
    } else if (kind === 'elevator') {
      this.audio.play('ding');
    }
  }

  finishTransition() {
    const t = this.transTarget;
    if (typeof t === 'function') return t();
    if (t === 'ending') return this.ending('escape');
    this.state.stats = {
      health: this.player.health,
      sanity: this.player.sanity,
      thirst: this.player.thirst,
      battery: this.player.battery,
    };
    this.enterLevel(t, { carry: true });
  }

  ending(kind) {
    this.mode = 'ending';
    this.input.unlock();
    this.ui.showHUD(false);
    this.ui.setVHS(false);
    this.audio.stopAllLayers();
    const st = this.state;
    const mins = Math.floor(st.playTime / 60);
    const stats = `Time in the Backrooms: ${mins} min · Levels visited: ${st.visited.length} · Notes found: ${st.notes.length}/${NOTES.length} · Deaths: ${st.deaths}`;
    const endings = this.level.endings || {};
    const e = endings[kind] || {
      title: 'ESCAPED?',
      paragraphs: ['You step through the door into sunlight.'],
    };
    this.ui.showEnding({
      title: e.title,
      paragraphs: e.paragraphs,
      stats,
      onMenu: () => this.enterMenu(),
    });
    st.completed = true;
    st.levelId = 'level0';
    saveGame({ ...st, version: 1 });
  }

  // ================================================================ actions

  useAlmond() {
    const inv = this.state.inv;
    const p = this.player;
    if (inv.almond <= 0) return this.toast('No Almond Water');
    if (p.thirst > 97 && p.sanity > 97) return this.toast("You're not thirsty");
    inv.almond--;
    p.thirst = Math.min(100, p.thirst + 45);
    p.sanity = Math.min(100, p.sanity + 35);
    p.health = Math.min(100, p.health + 8);
    this.audio.play('drink');
    this.toast('Almond Water. The buzzing in your head fades.');
  }

  useRation() {
    const inv = this.state.inv;
    const p = this.player;
    if (inv.ration <= 0) return this.toast('No Royal Rations');
    if (p.health > 97) return this.toast("You're not hurt");
    inv.ration--;
    p.health = Math.min(100, p.health + 45);
    p.thirst = Math.max(0, p.thirst - 5);
    this.audio.play('eat');
    this.toast('Royal Ration. Dry, but it helps.');
  }

  pickup(it) {
    const inv = this.state.inv;
    if (it.type === 'note') {
      const note = noteById(it.noteId);
      this.items.remove(it);
      if (note && !this.state.notes.includes(note.id)) this.state.notes.push(note.id);
      this.audio.play('page');
      this.openNote(note);
      return;
    }
    if (it.type === 'almond') {
      if (inv.almond >= 6) return this.toast('You can\'t carry more Almond Water');
      inv.almond++;
    } else if (it.type === 'battery') {
      inv.battery++;
    } else if (it.type === 'ration') {
      inv.ration++;
    }
    this.items.remove(it);
    this.audio.play('pickup');
    this.toast(`Picked up ${ITEM_NAMES[it.type]}`);
  }

  openNote(note) {
    if (!note) return;
    this.mode = 'note';
    this.ui.showNote(note, () => this.closeNote());
  }

  closeNote() {
    this.ui.hideNote();
    if (this.mode === 'note') {
      this.mode = 'play';
      if (!this.input.locked) this.ui.showClickToPlay('Click to continue');
    }
  }

  openJournal(fromPause = false) {
    const prev = this.mode;
    this.mode = 'journal';
    this.ui.hidePause();
    const notes = this.state.notes.map((id) => {
      const n = noteById(id);
      return n ? { ...n, levelName: `Level ${getLevel(n.level).number}` } : null;
    }).filter(Boolean);
    const mins = Math.floor((this.state.playTime || 0) / 60);
    this.ui.showJournal({
      notes,
      level: this.level,
      deaths: this.state.deaths || 0,
      time: `${mins} min`,
      onClose: () => {
        this.ui.hideJournal();
        if (fromPause || prev === 'paused') {
          this.mode = 'paused';
          this.ui.showPause();
        } else {
          this.mode = 'play';
          this.input.lock();
          if (!this.input.locked) this.ui.showClickToPlay('Click to continue');
        }
      },
      onOpenNote: (n) => {
        this.ui.showNote(n, () => this.ui.hideNote());
      },
    });
  }

  // ================================================================ main loop

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    if (this.debugFreeze) {
      this.last = now;
      if (this.debugFreeze > 0 && this.debugFreeze !== true) this.debugFreeze--;
      else return;
    }
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 0.016;
    dt = Math.min(dt, 0.05);
    this.fps += (1 / dt - this.fps) * 0.05;
    const t = now / 1000;
    G.uTime.value = t;
    this.post.u.uTime.value = t;
    this.world.fixtures.update(t);

    switch (this.mode) {
      case 'menu':
        this.updateMenu(dt);
        break;
      case 'intro':
        this.fade = 1;
        break;
      case 'loading':
        this.updateLoading(dt);
        break;
      case 'play':
        this.updatePlay(dt);
        break;
      case 'transition':
        this.updateTransition(dt);
        break;
      case 'dead':
        this.fade = Math.min(0.75, this.fade + dt * 0.5);
        break;
      case 'note':
        if (this.input.hit('interact') || this.input.hit('pause')) this.closeNote();
        this.updateAudio(dt);
        break;
      case 'journal':
        if (this.input.hit('journal')) {
          this.ui.hideJournal();
          this.mode = 'play';
          this.input.lock();
          if (!this.input.locked) this.ui.showClickToPlay('Click to continue');
        }
        break;
      default:
        break;
    }
    if (this.mode !== 'play') this.input.consumeMouse();
    this.updateCameraAndFX(dt);
    this.input.endFrame();
    this.post.render(dt);
  }

  /** Debug: spawn an entity in front of the player. */
  debugSpawn(name, dist = 4, opts = {}) {
    const C = ENTITY_TYPES[name];
    const p = this.player;
    const x = p.x - Math.sin(p.yaw) * dist;
    const z = p.z - Math.cos(p.yaw) * dist;
    const e = this.entities.add(new C(this, x, z, opts));
    if (opts.state) e.setState(opts.state);
    e.yaw = p.yaw + Math.PI;
    return e;
  }

  /** Debug: render one frame and return the canvas as a data URL. */
  snapshot(type = 'image/jpeg') {
    this.updateCameraAndFX(0.016);
    this.post.render(0.016);
    return this.canvas.toDataURL(type, 0.92);
  }

  updateMenu(dt) {
    const m = this.menuCam;
    const w = this.world;
    m.t += dt;
    // drift slowly down the corridors, turning at walls
    const fx = -Math.sin(m.yaw);
    const fz = -Math.cos(m.yaw);
    const ahead = w.rayDist(m.x, m.z, fx, fz, 4);
    if (ahead < 2.2) m.turn = m.turn || (Math.random() < 0.5 ? 1 : -1);
    else if (ahead > 3.5) m.turn = 0;
    m.yaw += m.turn * dt * 0.45;
    if (ahead > 1.2) {
      m.x += fx * dt * 0.55;
      m.z += fz * dt * 0.55;
    }
    const p = this.player;
    p.x = m.x;
    p.z = m.z;
    p.yaw = m.yaw;
    p.pitch = Math.sin(m.t * 0.13) * 0.05;
    p.y = 0;
    p.flashlight = false;
    this.world.update(m.x, m.z);
    this.fade = Math.max(0, this.fade - dt * 0.4);
    if (this.audio.ready) {
      if (!this.audio.layers.hum) this.startAmbience(this.level);
      this.updateAudio(dt);
    }
  }

  updateLoading(dt) {
    const p = this.player;
    this.world.update(p.x, p.z);
    this.loadingT += dt;
    const ready = this.world.missingNear(p.x, p.z, 1) === 0;
    if (ready && this.loadingT > 0.6) {
      this.ui.hideLoading();
      this.ui.showHUD(true);
      this.ui.setVHS(this.vhsOn);
      this.mode = 'play';
      p.place(p.x, p.z, p.yaw);
      if (this.pendingIntro) {
        this.pendingIntro = false;
        setTimeout(() => this.ui.levelIntro(this.level), 900);
      }
      if (!this.input.locked) this.ui.showClickToPlay('Click to look around');
    }
  }

  updateTransition(dt) {
    this.transT += dt;
    const k = this.transKind;
    const p = this.player;
    if (k === 'noclip' || k === 'fall') {
      this.glitch = Math.min(1, this.transT / 0.8);
      if (k === 'fall') {
        p.y -= dt * 4 * this.transT;
      }
      this.fade = clamp((this.transT - 0.9) / 0.6, 0, 1);
    } else {
      this.fade = clamp(this.transT / 0.9, 0, 1);
    }
    p.update(dt, null);
    this.world.update(p.x, p.z);
    if (this.transT > (k === 'elevator' ? 2.6 : 1.6)) this.finishTransition();
  }

  updatePlay(dt) {
    const p = this.player;
    const inp = this.input;
    const st = this.state;
    this.levelTime += dt;
    st.playTime = (st.playTime || 0) + dt;

    // ---- look
    const [mdx, mdy] = inp.consumeMouse();
    if (inp.locked) p.look(mdx, mdy);

    // ---- actions
    if (inp.hit('pause') && inp.down.has('KeyP')) {
      this.input.unlock();
      this.pause();
      return;
    }
    if (inp.hit('flashlight')) {
      if (p.battery <= 0 && st.inv.battery <= 0) {
        this.toast('Flashlight is dead');
        this.audio.play('click');
      } else {
        p.flashlight = !p.flashlight;
        this.audio.play('click');
      }
    }
    if (inp.hit('drink')) this.useAlmond();
    if (inp.hit('eat')) this.useRation();
    if (inp.hit('journal')) {
      this.input.unlock();
      this.openJournal(false);
      return;
    }
    if (inp.hit('camcorder')) {
      this.setVHS(!this.vhsOn);
      saveSettings(this.settings);
      this.audio.play('click');
    }

    // ---- movement
    p.onStep = (intensity) => this.footstep(intensity);
    p.onLand = (impact) => {
      this.audio.footstep(this.surfaceAt(p.x, p.z), 1.4);
      if (impact > 7) this.hurtPlayer((impact - 7) * 12, 'Fell');
    };
    p.update(dt, inp);
    this.world.update(p.x, p.z);

    // ---- noise the player makes (entities listen to this)
    const moving = p.speedNow > 0.4;
    const targetNoise = !moving ? 0 : p.sprinting ? 1 : p.crouching ? 0.12 : 0.45;
    this.noise += (targetNoise - this.noise) * Math.min(1, dt * 4);

    // ---- exits: walked into a glitch wall?
    const gx = Math.floor(p.x / CELL);
    const gz = Math.floor(p.z / CELL);
    if (this.world.flagsG(gx, gz) & F_GLITCH) {
      const ex = this.nearestExit(p.x, p.z, 'noclip');
      this.transition(ex ? ex.target : this.level.defaultExit || 'level1', 'noclip');
      return;
    }
    // falling out of the world (pits / voids)
    if (p.y < -6) {
      const target = this.level.fallTarget || this.level.defaultExit || 'level0';
      this.transition(target, 'fall');
      return;
    }

    // ---- interaction
    const eye = this.camera.position;
    const dir = this.camForward;
    const item = this.items.findTarget(eye, dir);
    const inter = item ? null : this.findInteractable(eye, dir);
    if (item) this.ui.setPrompt(item.type === 'note' ? 'Read note' : `Pick up ${ITEM_NAMES[item.type]}`);
    else if (inter) this.ui.setPrompt(inter.prompt || 'Use');
    else this.ui.setPrompt(null);
    if (inp.hit('interact')) {
      if (item) this.pickup(item);
      else if (inter) this.useInteractable(inter);
    }
    this.items.update(dt);

    // ---- survival stats
    this.updateStats(dt);
    if (this.mode !== 'play') return;

    // ---- level director + entities
    if (this.level.director) this.level.director(this, dt, this.levelState);
    const dist = this.entities.update(dt);
    const du = G.uDisturb.value;
    for (let i = 0; i < 2; i++) {
      const e = dist[i];
      if (e) du[i].set(e.x, 1, e.z, e.disturb);
      else du[i].set(0, 0, 0, 0);
    }
    this.fear = Math.max(0, this.fear - dt * 0.08);
    this.updatePoints(dt);

    // ---- autosave
    this.saveT -= dt;
    if (this.saveT <= 0) {
      this.saveT = 30;
      this.persist();
    }

    this.updateAudio(dt);
    this.ui.setStats(p);
    this.ui.setInventory(st.inv);
    this.ui.setFps(this.fps, this.settings.showFps);
    this.ui.updateVHS(st.playTime || 0, p.battery);
    if (this.level.objective) this.ui.setObjective(this.level.objective(this));
  }

  markUsed(it) {
    it.used = true;
    const st = this.state;
    (st.picked[this.level.id] ||= []).push(it.id);
  }

  useInteractable(it) {
    const L = this.level;
    if (L.interactHandler && L.interactHandler(this, it) !== false) return;
    const inv = this.state.inv;
    switch (it.type) {
      case 'exit':
        if (it.locked) {
          this.toast(it.lockedMsg || 'It won\'t budge.');
          this.audio.play('knock', { count: 1, gain: 0.3 });
          return;
        }
        it.used = true;
        this.transition(it.target, it.kind || 'door');
        break;
      case 'crate': {
        if (it.used) {
          this.toast('Empty.');
          return;
        }
        this.markUsed(it);
        this.audio.play('creak', { dur: 0.5, gain: 0.25 });
        const table = L.config.loot || [['almond', 1]];
        const n = 1 + (Math.random() < 0.45 ? 1 : 0);
        const got = [];
        for (let k = 0; k < n; k++) {
          let tot = 0;
          for (const e of table) tot += e[1];
          let r = Math.random() * tot;
          let pick = table[0][0];
          for (const e of table) {
            r -= e[1];
            if (r <= 0) {
              pick = e[0];
              break;
            }
          }
          if (pick === 'almond' && inv.almond >= 6) pick = 'battery';
          inv[pick] = (inv[pick] || 0) + 1;
          got.push(ITEM_NAMES[pick]);
        }
        this.audio.play('pickup');
        this.toast('Found: ' + got.join(', '));
        break;
      }
      case 'cooler': {
        if (it.used) {
          this.toast('The jug is empty.');
          return;
        }
        if (inv.almond >= 6) {
          this.toast("You can't carry more Almond Water");
          return;
        }
        this.markUsed(it);
        inv.almond++;
        this.audio.play('drink', { gain: 0.3 });
        this.toast('Filled a bottle with Almond Water');
        break;
      }
      default:
        break;
    }
  }

  /**
   * Find a spawn position around the player.
   * opts: { min, max, noLOS, dark (max light), notInView, tries, clear }
   */
  findSpawnSpot(opts = {}) {
    const p = this.player;
    const w = this.world;
    const min = opts.min ?? 15;
    const max = opts.max ?? 30;
    const clear = opts.clear ?? 1;
    for (let t = 0; t < (opts.tries ?? 40); t++) {
      const a = Math.random() * Math.PI * 2;
      const d = min + Math.random() * (max - min);
      const x = p.x + Math.cos(a) * d;
      const z = p.z + Math.sin(a) * d;
      if (!w.isChunkReady(x, z)) continue;
      const gx = Math.floor(x / CELL);
      const gz = Math.floor(z / CELL);
      let ok = true;
      for (let oz = -clear; oz <= clear && ok; oz++) {
        for (let ox = -clear; ox <= clear; ox++) {
          if (w.flagsG(gx + ox, gz + oz) & (F_SOLID | F_BLOCK | F_GLITCH)) {
            ok = false;
            break;
          }
        }
      }
      if (!ok) continue;
      if (w.floorG(gx, gz) < -10) continue;
      if (opts.noLOS && w.los(p.x, p.z, x, z)) continue;
      if (opts.los && !w.los(p.x, p.z, x, z)) continue;
      if (opts.notInView) {
        const dx = x - p.x;
        const dz = z - p.z;
        const l = Math.hypot(dx, dz);
        const f = this.camForward;
        if ((dx * f.x + dz * f.z) / (l * Math.hypot(f.x, f.z) || 1) > 0.35) continue;
      }
      if (opts.dark !== undefined) {
        const l = w.lightAt(x, 1.5, z);
        if ((l[0] + l[1] + l[2]) / 3 > opts.dark) continue;
      }
      if (opts.zone !== undefined && w.zoneAt(x, z) !== opts.zone) continue;
      return { x: (gx + 0.5) * CELL, z: (gz + 0.5) * CELL };
    }
    return null;
  }

  nearestExit(x, z, type) {
    let best = null;
    let bd = 1e9;
    for (const c of this.world.chunks.values()) {
      for (const e of c.layout.exits) {
        if (type && e.type !== type) continue;
        const d = Math.hypot(e.x - x, e.z - z);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
    }
    return best;
  }

  surfaceAt(x, z) {
    const p = this.player;
    if (p.inWater > 0.05) return 'water';
    if (this.level.surfaceAt) return this.level.surfaceAt(this, x, z);
    return this.level.config.footsteps || 'carpet';
  }

  footstep(intensity) {
    const p = this.player;
    this.audio.footstep(this.surfaceAt(p.x, p.z), intensity);
  }

  updateStats(dt) {
    const p = this.player;
    const st = this.state;
    // sample light at the player a few times a second
    this.lightT -= dt;
    if (this.lightT <= 0) {
      this.lightT = 0.2;
      const l = this.world.lightAt(p.x, p.y + 1.2, p.z);
      this.playerLight = (l[0] + l[1] + l[2]) / 3 * G.uLightScale.value;
    }
    const dark = this.playerLight < 0.09;
    const cfg = this.level.config;
    // thirst
    p.thirst -= dt * (cfg.thirstRate ?? 0.1) * (p.sprinting ? 1.8 : 1);
    if (p.thirst <= 0) {
      p.thirst = 0;
      p.health -= dt * 0.6;
      if (p.health <= 0) return this.die('Died of thirst');
    }
    // sanity
    let sd = cfg.sanityRate ?? 0.05;
    if (dark) sd += p.flashlight ? 0.12 : 0.4;
    sd += this.fear * 0.7;
    if (p.thirst < 20) sd += 0.12;
    if (this.playerLight > 0.6 && this.fear < 0.1) sd -= 0.08;
    p.sanity = clamp(p.sanity - sd * dt, 0, 100);
    if (p.sanity <= 0) {
      p.health -= dt * 0.9;
      if (p.health <= 0) return this.die('Lost your mind');
    }
    // health regen
    if (p.thirst > 40 && p.hurtTimer > 12 && p.health < 100 && p.sanity > 10) p.health = Math.min(100, p.health + dt * 0.25);
    // flashlight battery
    if (p.flashlight) {
      p.battery -= dt * (cfg.batteryDrain ?? 0.4);
      if (p.battery <= 0) {
        if (st.inv.battery > 0) {
          st.inv.battery--;
          p.battery = 100;
          this.toast('Swapped in fresh batteries');
          this.audio.play('click');
        } else {
          p.battery = 0;
          p.flashlight = false;
          this.toast('Your flashlight dies');
          this.audio.play('click');
        }
      }
    }
    // hallucinations
    if (this.level.hallucinate !== false) this.hallucinate(dt);
  }

  hallucinate(dt) {
    const p = this.player;
    const s = p.sanity;
    this.hallT = (this.hallT ?? 8) - dt;
    if (this.hallT > 0 || s > 60) return;
    this.hallT = 6 + Math.random() * (s / 4 + 6);
    const r = Math.random();
    const a = Math.random() * Math.PI * 2;
    const pos = [p.x + Math.cos(a) * 5, p.y + 1.5, p.z + Math.sin(a) * 5];
    if (r < 0.35) {
      this.audio.play('whisper', { pos, gain: 0.22 });
      this.caption('[whispering]');
    } else if (r < 0.55 && s < 45) {
      const behind = [p.x + Math.sin(p.yaw) * 3, p.y, p.z + Math.cos(p.yaw) * 3];
      for (let i = 0; i < 4; i++) this.audio.footstep(this.surfaceAt(p.x, p.z), 0.6, behind);
      this.caption('[footsteps behind you]');
    } else if (r < 0.7) {
      this.audio.play('knock', { pos, gain: 0.3 });
      this.caption('[knocking]');
    } else if (r < 0.85 && s < 35) {
      this.blink = 1;
    } else {
      this.audio.play('static', { gain: 0.12, dur: 0.3 });
    }
  }

  // ================================================================ audio + camera

  updateAudio(dt) {
    const a = this.audio;
    if (!a.ready) return;
    const p = this.player;
    const cam = this.camera;
    const f = this.camForward;
    a.setListener([cam.position.x, cam.position.y, cam.position.z], [f.x, f.y, f.z]);
    // hum loudness from nearby lit fixtures
    this.humT -= dt;
    if (this.humT <= 0) {
      this.humT = 0.25;
      const list = this.world.nearbyFixtures(p.x, p.z, 9, this._fx || (this._fx = []));
      let h = 0;
      for (const fx of list) {
        const e = this.world.fixtures.byKey.get(fx.key);
        const k = e ? e.last : 1;
        const d2 = (fx.x - p.x) ** 2 + (fx.z - p.z) ** 2 + 1;
        h += (k * (fx.hum ?? 1)) / d2;
      }
      const lvl = clamp(h * 2.2, 0, 1) * (this.level.config.hum ?? 1) * G.uLightScale.value;
      a.setHum(lvl);
    }
    if (this.mode !== 'play') return;
    // heartbeat when afraid or hurt
    const stress = Math.max(this.fear, 1 - this.player.health / 100, (40 - p.sanity) / 40);
    this.heartT -= dt;
    if (stress > 0.25 && this.heartT <= 0) {
      this.heartT = 1.15 - stress * 0.55;
      a.play('heartbeat', { gain: 0.25 + stress * 0.45 });
    }
    // breathing when exhausted
    this.breathT -= dt;
    if ((p.exhausted || p.stamina < 25) && this.breathT <= 0) {
      this.breathT = 0.95;
      a.play('breath', { inhale: true, dur: 0.45, gain: 0.22 });
      a.play('breath', { delay: 0.48, dur: 0.4, gain: 0.18 });
    }
  }

  updateCameraAndFX(dt) {
    const p = this.player;
    const cam = this.camera;
    const pose = p.cameraPose(this.camPose);
    const bobScale = this.settings.headBob;
    cam.position.set(p.x + (pose.x - p.x) * bobScale, p.eyeY + (pose.y - p.eyeY) * bobScale, p.z + (pose.z - p.z) * bobScale);
    cam.rotation.set(pose.pitch, pose.yaw, pose.roll * bobScale);
    cam.updateMatrixWorld();
    this.camForward.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const fov = this.settings.fov + p.fovKick * 5 + (p.sanity < 30 ? Math.sin(G.uTime.value * 0.7) * (30 - p.sanity) * 0.08 : 0);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    // flashlight follows the camera with a little lag (it's in your hand)
    const fl = G.uFlashDir.value;
    this._fd = this._fd || new THREE.Vector3(0, 0, -1);
    this._fd.lerp(this.camForward, Math.min(1, dt * 14)).normalize();
    fl.copy(this._fd);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    G.uFlashPos.value.copy(cam.position).addScaledVector(right, 0.12).add(new THREE.Vector3(0, -0.12, 0));
    let flash = p.flashlight && p.battery > 0 && this.mode !== 'menu' ? 1 : 0;
    if (flash) {
      // weak battery flicker + entity interference
      if (p.battery < 12 && Math.random() < 0.08) flash *= 0.3;
      const du = G.uDisturb.value[0];
      if (du.w > 0 && Math.hypot(du.x - p.x, du.z - p.z) < du.w && Math.random() < 0.18) flash *= 0.15;
      flash *= 0.55 + 0.45 * Math.min(1, p.battery / 30);
    }
    const fc = this.level?.config.flashColor || [1.0, 0.97, 0.9];
    const fp = (this.level?.config.flashPower ?? 1.8) * flash;
    G.uFlashColor.value.set(fc[0] * fp, fc[1] * fp, fc[2] * fp);
    G.uFlashCone.value.z = this.level?.config.flashRange ?? 22;

    // post FX
    const u = this.post.u;
    const sanityFx = clamp((60 - p.sanity) / 60, 0, 1);
    const playing = this.mode === 'play' || this.mode === 'transition' || this.mode === 'note' || this.mode === 'journal' || this.mode === 'paused';
    u.uSanity.value = playing ? sanityFx : 0;
    G.uSanity.value = playing ? sanityFx * sanityFx : 0;
    this.damageFlash = Math.max(0, this.damageFlash - dt * 0.9);
    u.uDamage.value = this.damageFlash + (playing && p.health < 30 ? (30 - p.health) / 60 : 0);
    if (this.mode !== 'transition') this.glitch = Math.max(0, this.glitch - dt * 0.8);
    u.uGlitch.value = this.glitch;
    if (this.mode === 'play' && this.fade > 0) this.fade = Math.max(0, this.fade - dt * 0.7);
    u.uFade.value = this.fade;
    this.blink = Math.max(0, this.blink - dt * 1.6);
    u.uBlink.value = Math.sin(this.blink * Math.PI);
    u.uVHS.value = this.vhsOn && this.mode !== 'menu' ? 1 : 0;
    u.uExposure.value = (this.baseExposure ?? 1) * this.settings.brightness;
    u.uRedTint.value = this.redTint;
  }
}
