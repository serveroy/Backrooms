// Entity registry (used by level directors and debugging).
import { Howler } from './howler.js';
import { Smiler } from './smiler.js';
import { Hound } from './hound.js';
import { Deathmoth } from './deathmoth.js';
import { Faceling } from './faceling.js';
import { SkinStealer } from './skinstealer.js';
import { Partygoer } from './partygoer.js';

export const ENTITY_TYPES = {
  howler: Howler,
  smiler: Smiler,
  hound: Hound,
  deathmoth: Deathmoth,
  faceling: Faceling,
  skinstealer: SkinStealer,
  partygoer: Partygoer,
};
