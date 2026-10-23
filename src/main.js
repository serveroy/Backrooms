import { Game } from './game.js';

const game = new Game(document.getElementById('game'), document.getElementById('ui'));
// handy for debugging from the console
window.__game = game;

// ?play=level0 skips the menu (development / testing)
const q = new URLSearchParams(location.search);
if (q.get('play')) {
  const { newGameState } = await import('./core/save.js');
  game.state = newGameState(+(q.get('seed') || 12345));
  game.ui.hideMenu();
  game.enterLevel(q.get('play'), { first: true });
}
