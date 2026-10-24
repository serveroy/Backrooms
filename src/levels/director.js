// Shared "director" helpers used by level scripts for ambient dread.

/** Glitch exits hiss with static so players can find them by ear. */
export function exitStatic(game, dt, S, type = 'noclip') {
  S.exitT = (S.exitT ?? 1) - dt;
  if (S.exitT > 0) return;
  const p = game.player;
  const ex = game.nearestExit(p.x, p.z, type);
  if (!ex) {
    S.exitT = 2;
    return;
  }
  const d = Math.hypot(ex.x - p.x, ex.z - p.z);
  S.exitT = d < 8 ? 0.7 : d < 18 ? 1.4 : 2.5;
  if (d < 34) {
    game.audio.play('static', { pos: [ex.x, 1.3, ex.z], gain: 0.5, dur: 0.25 + Math.random() * 0.4, ref: 2.5, rolloff: 1.2 });
    if (d < 10 && !S.exitCaption) {
      S.exitCaption = true;
      game.caption('[static crackling nearby]');
    }
  }
}

/**
 * Random ambient events. cfg.events: [[name, weight], ...]
 * cfg.every: [min, max] seconds between events.
 */
export function ambientEvents(game, dt, S, cfg) {
  S.evT = (S.evT ?? cfg.every[0] * 0.5) - dt;
  if (S.evT > 0) return;
  S.evT = cfg.every[0] + Math.random() * (cfg.every[1] - cfg.every[0]);
  const list = cfg.events.filter((e) => e[1] > 0);
  let tot = 0;
  for (const e of list) tot += e[1];
  let r = Math.random() * tot;
  let pick = list[0][0];
  for (const e of list) {
    r -= e[1];
    if (r <= 0) {
      pick = e[0];
      break;
    }
  }
  const p = game.player;
  const a = Math.random() * Math.PI * 2;
  const far = [p.x + Math.cos(a) * 25, 1.5, p.z + Math.sin(a) * 25];
  const near = [p.x + Math.cos(a) * 8, 1.5, p.z + Math.sin(a) * 8];
  const au = game.audio;
  switch (pick) {
    case 'boom':
      au.play('boom', { pos: far, gain: 0.5 });
      game.caption('[a distant thud]');
      break;
    case 'sputterBurst': {
      // a cluster of nearby lights stutters
      const list2 = game.world.nearbyFixtures(p.x, p.z, 12);
      const f = list2[Math.floor(Math.random() * list2.length)];
      if (f) {
        const t0 = game.levelTime;
        game.world.fixtures.overrides.set(f.key, () => (game.levelTime - t0 < 2.2 ? (Math.random() < 0.5 ? 0.05 : 1) : 1));
        setTimeout(() => game.world.fixtures.overrides.delete(f.key), 2500);
        au.play('sputter', { pos: [f.x, f.y, f.z], gain: 0.35 });
      }
      break;
    }
    case 'distantGallop':
      for (let i = 0; i < 5; i++) au.play('gallop', { pos: far, gain: 0.25, delay: i * 0.33 });
      game.caption('[something running, far away]');
      break;
    case 'knock':
      au.play('knock', { pos: near, gain: 0.35 });
      game.caption('[knocking inside the wall]');
      break;
    case 'creak':
      au.play('creak', { pos: near, gain: 0.25 });
      break;
    case 'drip':
      au.play('drip', { pos: near, gain: 0.3 });
      break;
    case 'whisper':
      au.play('whisper', { pos: near, gain: 0.2 });
      game.caption('[whispering]');
      break;
    case 'clank':
      au.play('clank', { pos: near, gain: 0.35 });
      game.caption('[metal clanking]');
      break;
    case 'spark':
      au.play('spark', { pos: near, gain: 0.4 });
      break;
    case 'growl':
      au.play('growl', { pos: far, gain: 0.35 });
      game.caption('[a low growl]');
      break;
    case 'phone':
      au.play('phone', { pos: far, gain: 0.3 });
      game.caption('[a phone ringing somewhere]');
      break;
    case 'piano':
      au.play('piano', { pos: far, gain: 0.25 });
      break;
    case 'party':
      au.play('partyVoice', { pos: far, gain: 0.3 });
      game.caption('[distant laughter]');
      break;
    case 'horn':
      au.play('partyHorn', { pos: far, gain: 0.3 });
      game.caption('[a party horn]');
      break;
    default:
      break;
  }
}
