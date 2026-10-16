import { Game } from './game/game.ts';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  if (!canvas) {
    console.error('Canvas element #game-canvas not found');
    return;
  }

  // Create game instance and start the loop
  const game = new Game(canvas);
  game.start();

  // Focus window immediately so keyboard controls work with zero mouse clicks
  window.focus();

  // Expose on window for easy teammate integration or testing
  (window as unknown as { panicDeliveryGame?: Game }).panicDeliveryGame = game;
});
