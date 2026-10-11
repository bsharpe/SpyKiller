import { unlock, toggleMusic, isMusicOn } from '../audio.js';
import { FONT, loadHi } from '../opts.js';

const W = 540, H = 960;

export class Title extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    this.scene.launch('Run', { attract: true }); // the bot plays a demo underneath
    this.scene.bringToTop();
    this.cameras.main.setZoom(2).centerOn(W / 2, H / 2);
    const txt = (x, y, s, size, color = '#fff', extra = {}) =>
      this.add.text(x, y, s, { fontFamily: FONT, fontSize: size + 'px', color, ...extra }).setResolution(2).setOrigin(0.5);

    const g = this.add.graphics();
    g.fillGradientStyle(0x05080c, 0x05080c, 0x05080c, 0x05080c, 0.85, 0.85, 0.2, 0.2).fillRect(0, 0, W, H * 0.55);
    g.fillGradientStyle(0x05080c, 0x05080c, 0x05080c, 0x05080c, 0.2, 0.2, 0.85, 0.85).fillRect(0, H * 0.55, W, H * 0.45);

    const title = txt(W / 2, 170, 'SPY KILLER', 64, '#ffffff', { stroke: '#0a1a2a', strokeThickness: 10 });
    const grad = title.context.createLinearGradient(0, 0, 0, title.height);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.5, '#9fe8ff'); grad.addColorStop(1, '#27a2ff');
    title.setFill(grad).setShadow(0, 0, '#27c9ff', 18, true, true);
    this.tweens.add({ targets: title, scale: { from: 0.96, to: 1.03 }, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    txt(W / 2, 228, 'G-6155 INTERCEPTOR', 16, '#ffb74d');

    const controls = [
      ['↑ ↓', 'gas / brake'], ['← →', 'steer'], ['SHIFT', 'gear LO / HI'], ['SPACE / Z', 'machine guns'],
      ['X', 'oil slick'], ['C', 'smoke screen'], ['V', 'missiles (helicopter)'], ['P · M', 'pause · music'],
    ];
    controls.forEach(([k, v], i) => {
      txt(W / 2 - 12, 560 + i * 26, k, 15, '#ffd54f').setOrigin(1, 0.5);
      txt(W / 2 + 12, 560 + i * 26, v, 15, '#dfe8f0').setOrigin(0, 0.5);
    });
    txt(W / 2, 310, 'Drive into the red WEAPONS VAN for special weapons.\nDon\'t shoot civilians. Cars are unlimited until the timer runs out.', 12, '#b8c7d6', { align: 'center', lineSpacing: 6 });
    const start = txt(W / 2, 470, 'PRESS ENTER', 28, '#ffffff', { stroke: '#000', strokeThickness: 6 });
    this.tweens.add({ targets: start, alpha: 0.25, duration: 600, yoyo: true, repeat: -1 });
    const hi = loadHi();
    if (hi) txt(W / 2, 400, `BEST  ${hi}`, 16, '#7dff9a');
    const music = txt(W / 2, 800, `MUSIC ${isMusicOn() ? 'ON' : 'OFF'}  (M)`, 12, '#8fa3b8');

    // Institute of Mayhem badge (its window mark, from instituteofmayhem.com/favicon.svg) linking to the landing page
    this.add.graphics({ x: 16, y: 16 })
      .fillStyle(0x0a0b0a).fillRoundedRect(0, 0, 32, 32, 4).lineStyle(1, 0xffb000, 0.5).strokeRoundedRect(0, 0, 32, 32, 4)
      .fillStyle(0xffb000).fillRect(9, 7, 14, 18)
      .fillStyle(0x0a0b0a).fillRect(15, 7, 2, 18).fillRect(9, 14, 14, 2);
    const iomText = txt(56, 32, 'IoM', 18, '#ffb000').setOrigin(0, 0.5);
    const iom = this.add.zone(12, 12, 92, 40).setOrigin(0).setInteractive({ useHandCursor: true });
    iom.on('pointerover', () => iomText.setColor('#ffffff'));
    iom.on('pointerout', () => iomText.setColor('#ffb000'));
    iom.on('pointerup', () => window.open('https://instituteofmayhem.com/', '_blank', 'noopener'));

    const go = () => { unlock(); this.scene.start('Run', {}); };
    this.input.keyboard.once('keydown-ENTER', go);
    this.input.keyboard.once('keydown-SPACE', go);
    this.input.on('pointerdown', (p, over) => { if (!over.includes(iom)) go(); });
    this.input.keyboard.on('keydown-M', () => { unlock(); music.setText(`MUSIC ${toggleMusic() ? 'ON' : 'OFF'}  (M)`); });
  }
}
