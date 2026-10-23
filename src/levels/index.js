// Level registry. Order here is irrelevant; progression lives in each
// level's exits.
import level0 from './level0.js';

export const LEVELS = {
  level0,
};

export function getLevel(id) {
  const L = LEVELS[id];
  if (!L) throw new Error('Unknown level ' + id);
  return L;
}
