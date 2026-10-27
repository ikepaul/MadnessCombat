import Phaser from 'phaser';
import { INK } from '../data/palettes';
import '../labs/aiLabs';
import '../labs/gunLabs';
import '../labs/meleeLabs';
import '../labs/movementLabs';
import '../labs/comboLabs';
import '../labs/qolLabs';
import '../labs/coopLabs';
import '../labs/stage4Labs';
import '../labs/toolLabs';
import '../labs/throwLabs';
import '../labs/enemyLabs';
import '../labs/bossLabs';
import '../labs/hazardLabs';
import '../labs/stage2Labs';
import '../labs/stage3Labs';
import { allLabSlugs, getLab } from '../labs/registry';

/** `/?lab` with no slug: every expected lab, built ones clickable. */
export class LabIndexScene extends Phaser.Scene {
  constructor() {
    super('lab-index');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#a9aaae');
    this.add.text(60, 40, 'Replica labs', { fontFamily: 'Anton', fontSize: '64px', color: '#f5f5f6', stroke: INK, strokeThickness: 8 });
    this.add.text(60, 130, 'Built labs are white and open on click; grey ones are not built yet (see PLAN.md).', {
      fontFamily: 'Inter', fontSize: '20px', color: INK,
    });
    const slugs = allLabSlugs();
    const perCol = Math.ceil(slugs.length / 3);
    slugs.forEach((slug, i) => {
      const built = !!getLab(slug);
      const t = this.add.text(60 + Math.floor(i / perCol) * 600, 190 + (i % perCol) * 40, `${built ? '●' : '○'}  ${slug}`, {
        fontFamily: 'Inter', fontSize: '24px', color: built ? '#ffffff' : '#5b5c61',
      });
      if (built) t.setInteractive({ useHandCursor: true }).on('pointerdown', () => (window.location.search = `?lab=${slug}`));
    });
  }
}
