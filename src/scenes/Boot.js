import { makeTextures } from '../art.js';

export class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }
  async create() {
    makeTextures(this);
    // canvas text drawn before the web font loads falls back to a default face
    await Promise.race([document.fonts.load('40px "Russo One"'), new Promise(r => setTimeout(r, 2500))]).catch(() => {});
    this.scene.start('Title');
  }
}
