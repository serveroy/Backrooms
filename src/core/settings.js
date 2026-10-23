// Persistent settings (per-browser convenience; safe if storage is blocked).

export const DEFAULT_SETTINGS = {
  sens: 1.0,
  invertY: false,
  fov: 78,
  master: 0.8,
  sfx: 1.0,
  ambience: 1.0,
  music: 0.8,
  vhs: false,
  grain: true,
  bloom: true,
  renderScale: 1.0,
  viewDist: 2,
  headBob: 1.0,
  captions: true,
  showFps: false,
  brightness: 1.0,
};

const KEY = 'backrooms.settings.v1';

export function loadSettings() {
  let s = {};
  try {
    s = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch (e) {
    s = {};
  }
  return { ...DEFAULT_SETTINGS, ...s };
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {
    /* storage unavailable: settings last for this session only */
  }
}
