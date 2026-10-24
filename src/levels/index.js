// Level registry. Progression lives in each level's exits:
//   0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> (ending)
//   0 ~> 37 (rare noclip) -> 4      1 ~> Fun (balloon door) -> 1
//   2 ~> ! (red corridor) -> 3
import level0 from './level0.js';
import level1 from './level1.js';
import level2 from './level2.js';
import level3 from './level3.js';
import level4 from './level4.js';
import level5 from './level5.js';
import level6 from './level6.js';
import level7 from './level7.js';
import level37 from './level37.js';
import levelfun from './levelfun.js';
import levelrun from './levelrun.js';

export const LEVELS = {
  level0,
  level1,
  level2,
  level3,
  level4,
  level5,
  level6,
  level7,
  level37,
  levelfun,
  levelrun,
};

export function getLevel(id) {
  const L = LEVELS[id];
  if (!L) throw new Error('Unknown level ' + id);
  return L;
}
