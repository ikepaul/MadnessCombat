import Phaser from 'phaser';
import { invalidatePoses, LIBRARY, poseSkeleton, sampleClip, serializeLibrary, setPose } from '../anim/clips';
import { aboutFeet, cloneSkeleton, lyingAt, PART_NAMES, type PartName, REST, type Root, rootToWorld, STANDING, type Skeleton, worldToRoot } from '../anim/skeleton';
import { INK, PALETTES } from '../data/palettes';
import { CanvasLayer } from '../render/canvasLayer';
import { paintCharacter } from '../render/canvas/characterPainter';
import { createActor, type HeldItem } from '../sim/actor';

/** Root previews, since some poses are meant to be seen lying or prone. */
const ROOTS: [string, Root][] = [
  ['standing', STANDING],
  ['on the back', lyingAt(-Math.PI / 2)],
  ['face down', lyingAt(Math.PI / 2)],
  ['prone', aboutFeet(Math.PI / 2, 0.92)],
];
const HELD: HeldItem[] = [null, 'baton', 'pistol'];
const BIG = { x: 820, y: 860, scale: 620 };
const PREVIEW = { x: 1560, y: 860, scale: 300 };
const STORE = 'pose-editor';

/**
 * Pose editor lab (/?lab=pose-editor, PLAN.md M2). Click a part and drag it, wheel or Q/E to
 * rotate (Shift = fine), arrows nudge. Poses are stored as data in src/data/poses.json:
 * Save writes the file through the dev server; Copy puts the JSON on the clipboard.
 */
export class PoseEditorScene extends Phaser.Scene {
  private layer!: CanvasLayer;
  private poseName = 'idle';
  private sk: Skeleton = cloneSkeleton(REST);
  private part: PartName = 'handF';
  private rootIdx = 0;
  private heldIdx = 0;
  private clipName = 'punchLight';
  private dragging = false;
  private dirty = false;
  private poseTexts: Phaser.GameObjects.Text[] = [];
  private status!: Phaser.GameObjects.Text;
  private readout!: Phaser.GameObjects.Text;
  private t0 = 0;

  constructor() {
    super('pose-editor');
  }

  create(): void {
    try {
      const s = JSON.parse(sessionStorage.getItem(STORE) ?? '{}');
      if (s.pose && LIBRARY.poses[s.pose]) this.poseName = s.pose;
      if (typeof s.root === 'number') this.rootIdx = s.root;
      if (typeof s.clip === 'string' && LIBRARY.clips[s.clip]) this.clipName = s.clip;
    } catch { /* no saved editor state */ }
    this.cameras.main.setBackgroundColor(PALETTES.neutral.back);
    this.layer = new CanvasLayer(this, 'layer-pose-editor', 0);
    const font = { fontFamily: 'Inter', fontSize: '20px', color: INK };
    this.add.text(40, 24, 'Pose editor', { fontFamily: 'Anton', fontSize: '48px', color: '#f5f5f6', stroke: INK, strokeThickness: 6 });
    this.add.text(40, 92, 'click a part + drag · wheel or Q/E rotate (Shift fine) · arrows nudge · 0 reset part · Tab root · H held item\n[ ] preview clip · N new pose · Ctrl+S save to src/data/poses.json · C copy JSON', { ...font, fontSize: '17px' });
    this.status = this.add.text(40, 1030, '', { ...font, fontSize: '18px' });
    this.readout = this.add.text(1260, 150, '', { ...font, fontSize: '18px', lineSpacing: 6 });
    this.buildPoseList();
    this.openPose(this.poseName);
    this.bindInput();
    this.t0 = this.time.now;
  }

  private buildPoseList(): void {
    for (const t of this.poseTexts) t.destroy();
    this.poseTexts = Object.keys(LIBRARY.poses).map((name, i) =>
      this.add.text(40, 160 + i * 34, name, { fontFamily: 'Inter', fontSize: '22px', color: INK })
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.openPose(name)),
    );
  }

  private openPose(name: string): void {
    if (this.dirty) this.commit();
    this.poseName = name;
    this.sk = cloneSkeleton(poseSkeleton(name));
    this.dirty = false;
    // preview a clip that uses this pose, if the current one doesn't
    if (!LIBRARY.clips[this.clipName]?.keys.some((k) => k[1] === name)) {
      const c = Object.entries(LIBRARY.clips).find(([, def]) => def.keys.some((k) => k[1] === name));
      if (c) this.clipName = c[0];
    }
    this.remember();
  }

  private remember(): void {
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ pose: this.poseName, root: this.rootIdx, clip: this.clipName }));
    } catch { /* storage blocked */ }
  }

  /** Write the edited skeleton into the live library (every actor picks it up). */
  private commit(): void {
    setPose(this.poseName, this.sk);
    this.dirty = false;
  }

  private get root(): Root {
    return ROOTS[this.rootIdx][1];
  }

  /** Part position in actor-local H (the item hangs off the front hand). */
  private partLocal(p: PartName): [number, number] {
    if (p === 'item') return [this.sk.handF[0] + this.sk.item[0], this.sk.handF[1] + this.sk.item[1]];
    return [this.sk[p][0], this.sk[p][1]];
  }

  private toScreen(lx: number, ly: number): [number, number] {
    const [dx, dy] = rootToWorld(this.root, 1, lx, ly);
    return [BIG.x + dx * BIG.scale, BIG.y - dy * BIG.scale];
  }

  private toLocal(sx: number, sy: number): [number, number] {
    return worldToRoot(this.root, 1, (sx - BIG.x) / BIG.scale, -(sy - BIG.y) / BIG.scale);
  }

  private bindInput(): void {
    const kb = this.input.keyboard!;
    kb.addCapture(['TAB', 'UP', 'DOWN', 'LEFT', 'RIGHT']);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x < 300) return; // the pose list
      let best: PartName | undefined, bestD = 60;
      for (const k of PART_NAMES) {
        if (k === 'item' && !HELD[this.heldIdx]) continue;
        const [x, y] = this.toScreen(...this.partLocal(k));
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bestD) { best = k; bestD = d; }
      }
      if (best) { this.part = best; this.dragging = true; }
    });
    this.input.on('pointerup', () => (this.dragging = false));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging) return;
      const [lx, ly] = this.toLocal(p.x, p.y);
      if (this.part === 'item') { this.sk.item[0] = lx - this.sk.handF[0]; this.sk.item[1] = ly - this.sk.handF[1]; }
      else { this.sk[this.part][0] = lx; this.sk[this.part][1] = ly; }
      this.dirty = true;
    });
    const shift = kb.addKey('SHIFT');
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.rotate(Math.sign(dy) * (shift.isDown ? 0.01 : 0.05)));
    kb.on('keydown-Q', () => this.rotate(shift.isDown ? -0.01 : -0.05));
    kb.on('keydown-E', () => this.rotate(shift.isDown ? 0.01 : 0.05));
    const nudge = (dx: number, dy: number) => {
      const step = shift.isDown ? 0.001 : 0.005;
      this.sk[this.part][0] += dx * step;
      this.sk[this.part][1] += dy * step;
      this.dirty = true;
    };
    kb.on('keydown-LEFT', () => nudge(-1, 0));
    kb.on('keydown-RIGHT', () => nudge(1, 0));
    kb.on('keydown-UP', () => nudge(0, -1));
    kb.on('keydown-DOWN', () => nudge(0, 1));
    kb.on('keydown-ZERO', () => { this.sk[this.part] = [...REST[this.part]]; this.dirty = true; });
    kb.on('keydown-TAB', () => { this.rootIdx = (this.rootIdx + 1) % ROOTS.length; this.remember(); });
    kb.on('keydown-H', () => (this.heldIdx = (this.heldIdx + 1) % HELD.length));
    const clips = () => Object.keys(LIBRARY.clips);
    kb.on('keydown-OPEN_BRACKET', () => { const c = clips(); this.clipName = c[(c.indexOf(this.clipName) - 1 + c.length) % c.length]; this.t0 = this.time.now; this.remember(); });
    kb.on('keydown-CLOSED_BRACKET', () => { const c = clips(); this.clipName = c[(c.indexOf(this.clipName) + 1) % c.length]; this.t0 = this.time.now; this.remember(); });
    kb.on('keydown-N', () => {
      const name = window.prompt('New pose name (copies the current pose):', `${this.poseName}2`);
      if (!name || LIBRARY.poses[name]) return;
      this.commit();
      setPose(name, this.sk);
      this.buildPoseList();
      this.openPose(name);
    });
    kb.on('keydown-S', (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      void this.save();
    });
    kb.on('keydown-C', () => {
      this.commit();
      void navigator.clipboard.writeText(serializeLibrary()).then(() => this.flash('copied poses.json to the clipboard'));
    });
  }

  private rotate(d: number): void {
    this.sk[this.part][2] += d;
    this.dirty = true;
  }

  private async save(): Promise<void> {
    this.commit();
    try {
      const res = await fetch('/__poses', { method: 'POST', body: serializeLibrary() });
      this.flash(res.ok ? 'saved src/data/poses.json' : `save failed: ${await res.text()}`);
    } catch (e) {
      this.flash(`save failed (dev server only): ${String(e)}`);
    }
  }

  private flash(msg: string): void {
    this.status.setText(msg);
    this.time.delayedCall(4000, () => this.status.text === msg && this.status.setText(''));
  }

  update(time: number): void {
    if (this.dirty) { setPose(this.poseName, this.sk); invalidatePoses(); }
    for (const t of this.poseTexts) t.setColor(t.text === this.poseName ? '#ffffff' : INK).setFontStyle(t.text === this.poseName ? 'bold' : '');
    const pal = PALETTES.neutral;
    const ctx = this.layer.ctx;
    this.layer.clear();
    // floor line + onion skin of the rest pose
    ctx.strokeStyle = 'rgba(20,20,22,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(360, BIG.y); ctx.lineTo(1880, BIG.y); ctx.stroke();
    const held = HELD[this.heldIdx];
    const actor = createActor('hero', 0, 9, 1, { held, root: this.root });
    ctx.globalAlpha = 0.18;
    paintCharacter(ctx, actor, pal, 0, { blood: false, placement: BIG, skeleton: REST });
    ctx.globalAlpha = 1;
    paintCharacter(ctx, actor, pal, 0, { blood: false, placement: BIG, skeleton: this.sk });
    // selected part marker
    const [mx, my] = this.toScreen(...this.partLocal(this.part));
    ctx.strokeStyle = '#ff8c00'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(mx, my, 26, 0, Math.PI * 2); ctx.stroke();
    for (const k of PART_NAMES) {
      if (k === 'item' && !held) continue;
      const [x, y] = this.toScreen(...this.partLocal(k));
      ctx.fillStyle = k === this.part ? '#ff8c00' : 'rgba(255,140,0,0.5)';
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
    }
    // clip preview, looping with a short hold at the end
    const clip = LIBRARY.clips[this.clipName];
    const len = clip ? clip.keys[clip.keys.length - 1][0] / 30 : 0;
    const t = ((time - this.t0) / 1000) % (len + 0.5);
    const grunt = createActor('grunt', 0, 9, 1, { held });
    paintCharacter(ctx, grunt, pal, time / 1000, { blood: false, placement: PREVIEW, skeleton: sampleClip(this.clipName, Math.min(t, len)) });
    this.layer.upload();

    const p = this.sk[this.part];
    this.readout.setText([
      `pose  ${this.poseName}${this.dirty ? ' *' : ''}`,
      `part  ${this.part}`,
      `x ${p[0].toFixed(3)}   y ${p[1].toFixed(3)}   r ${p[2].toFixed(2)}`,
      `root  ${ROOTS[this.rootIdx][0]}  (Tab)`,
      `held  ${held ?? 'none'}  (H)`,
      '',
      `preview clip  ${this.clipName}  ([ ])`,
      `${clip?.keys.map(([f, n]) => `${f}:${n}`).join('  ') ?? ''}`,
      '',
      'Clips (frame, pose, easing) are edited',
      'in poses.json; timings must match',
      'TUNING.melee (startup/active/recovery).',
    ].join('\n'));
  }
}
