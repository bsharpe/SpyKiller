import { Boot } from './scenes/Boot.js';
import { Title } from './scenes/Title.js';
import { Run } from './scenes/Run.js';
import { installDebugHooks } from './debug-hooks.js';
import { installDebugPanel } from './debug-panel.js';
import { opts } from './opts.js';

// 1080x1920 canvas, camera zoom 2: the game works in a 540x960 world and every texture is painted at 2x.
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1080,
  height: 1920,
  backgroundColor: '#05080c',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  fps: { target: 60, smoothStep: true },
  scene: [Boot, Title, Run],
});

if (opts.debug) { installDebugHooks(game); installDebugPanel(); }
