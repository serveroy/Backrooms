// Save game: one slot. Position is not stored — you wake up at the level's
// entry point, which suits the Backrooms just fine.

const KEY = 'backrooms.save.v1';

export function loadGame() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && s.version === 1 && s.levelId) return s;
  } catch (e) {
    /* ignore */
  }
  return null;
}

export function saveGame(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, version: 1, savedAt: Date.now() }));
    return true;
  } catch (e) {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) {
    /* ignore */
  }
}

export function newGameState(seed) {
  return {
    version: 1,
    seed,
    levelId: 'level0',
    stats: { health: 100, sanity: 100, thirst: 100, battery: 100 },
    inv: { almond: 1, battery: 0, ration: 0 },
    notes: [],
    picked: {},
    visited: ['level0'],
    deaths: 0,
    playTime: 0,
    startedAt: Date.now(),
  };
}
