// Revamp HUD (design/animation-ux-revamp.md): E1 weapons as drawn icons with ammo ticks, E2 key
// glyphs over what E acts on, C4 a red edge on the side a hit came from and
// a pulse on the last life, F2 the stage card. Phaser objects in the UI scene (no post FX).
import Phaser from 'phaser';
import { audio } from '../audio/mixer';
import { isMelee, MELEE } from '../data/melee';
import { INK } from '../data/palettes';
import { isWeapon, WEAPONS } from '../data/weapons';
import { project } from '../render/camera';
import { paintGrenade } from '../render/canvas/weaponPainter';
import { paintHeld } from '../render/canvas/characterPainter';
import type { GameScene } from '../scenes/GameScene';
import { STAGE_NAMES } from '../scenes/TitleScene';
import { SETTINGS } from '../settings';
import type { Actor, Hand } from '../sim/actor';
import { TUNING } from '../data/tuning';
import { emptyGun, type PickupPlan, pickupPlan } from '../sim/guns';
import { partnerUnderCursor } from '../sim/coop';
import { boostBase, exitSpot, needsBoost, partnerAhead, usableExitAt, waitingInExit } from '../sim/stage';
import { takedownTarget } from '../sim/stealth';

const W = 1920, H = 1080;
const INK_HEX = 0x141416;
const RED = 0xc70f1b;
/** Icon textures: px per H, and the canvas size. */
const ICON_W = 220, ICON_H = 90;

/** Stages whose selector close-up has been shown (once per stage per session). */
const selectorShown = new Set<number>();

export class InkHud {
  private icons: Phaser.GameObjects.Image[] = [];
  private panel: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private glyph: Phaser.GameObjects.Graphics;
  private glyphText: Phaser.GameObjects.Text;
  private glyphVerb: Phaser.GameObjects.Text;
  /** M17: the item's name and ammo after the verb; icons: the item, what it replaces, the chooser rows. */
  private glyphNote: Phaser.GameObjects.Text;
  private promptIcons: Phaser.GameObjects.Image[] = [];
  /** What the prompt points at (a new target pops the glyph) and seconds since it appeared. */
  private glyphKey = '';
  private glyphAge = 0;
  private edges: [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
  private edgeT: [number, number] = [0, 0];
  private low: Phaser.GameObjects.Image;
  private lowT = 0;
  private heart?: number;
  private card?: { root: Phaser.GameObjects.Container; t: number };
  /** M14 gun-fire-mode: the selector close-up (the first switch of a stage), seconds shown and the new setting. */
  private selector?: { g: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; t: number; semi: boolean };

  constructor(private scene: Phaser.Scene, private game: GameScene, stageCard: boolean) {
    makeTextures(scene);
    this.low = scene.add.image(0, 0, 'hud-low').setOrigin(0, 0).setDepth(5).setAlpha(0);
    this.edges = [
      scene.add.image(0, 0, 'hud-edge').setOrigin(0, 0).setDepth(6).setAlpha(0),
      scene.add.image(W, 0, 'hud-edge').setOrigin(1, 0).setFlipX(true).setDepth(6).setAlpha(0),
    ];
    this.panel = scene.add.graphics().setDepth(40);
    for (let i = 0; i < 3; i++) {
      this.icons.push(scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0.5).setDepth(41).setVisible(false));
      this.labels.push(scene.add.text(0, 0, '', { fontFamily: 'Anton', fontSize: '26px', color: '#ffffff', stroke: INK, strokeThickness: 6 }).setOrigin(0, 0.5).setDepth(42).setVisible(false));
    }
    this.glyph = scene.add.graphics().setDepth(80);
    this.glyphText = scene.add.text(0, 0, '', { fontFamily: 'Anton', fontSize: '30px', color: INK }).setOrigin(0.5).setDepth(81);
    this.glyphVerb = scene.add.text(0, 0, '', { fontFamily: 'Anton', fontSize: '24px', color: '#ffffff', stroke: INK, strokeThickness: 6 }).setOrigin(0, 0.5).setDepth(81);
    this.glyphNote = scene.add.text(0, 0, '', { fontFamily: 'Anton', fontSize: '22px', color: '#ffffff', stroke: INK, strokeThickness: 6 }).setOrigin(0, 0.5).setDepth(81).setVisible(false);
    for (let i = 0; i < 4; i++) this.promptIcons.push(scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0.5).setDepth(81).setVisible(false));
    scene.events.once('shutdown', () => {
      if (this.heart !== undefined) audio()?.stop(this.heart, 0.3);
    });

    // C4: which side the hit came from (the attacker's side, else against the push)
    game.world.events.on('hit', (e) => {
      const me = this.me;
      if (!me || e.actorId !== me.id || e.damage <= 0) return;
      const by = game.world.actorById(e.attackerId);
      const left = by ? by.pos.x < me.pos.x : e.dirX > 0;
      this.edgeT[left ? 0 : 1] = 1;
    });
    if (stageCard && game.stageInfo && !game.lab) this.showCard(game.stageInfo.stage);
    // M14: the first selector flip of a stage shows the close-up (our own markings)
    game.world.events.on('fireMode', (e) => {
      if (e.actorId !== this.me?.id) return;
      const key = game.stageInfo?.stage ?? 0;
      if (selectorShown.has(key) && !game.lab) return;
      selectorShown.add(key);
      this.selector?.g.destroy(); this.selector?.text.destroy();
      const g = scene.add.graphics().setDepth(43);
      const text = scene.add.text(0, 0, '', { fontFamily: 'Anton', fontSize: '28px', color: '#ffffff' }).setOrigin(0.5, 0).setDepth(44);
      this.selector = { g, text, t: 0, semi: e.semi };
    });
  }

  private get me(): Actor | undefined {
    return this.game.world.players[this.game.localPlayer];
  }

  /** Once per frame. */
  update(dt: number): void {
    const me = this.me;
    this.drawWeapons(me);
    this.drawPrompt(me, dt);
    this.drawHurt(me, dt);
    this.drawCard(dt);
    this.drawSelector(dt);
  }

  /**
   * The selector close-up: a lever swinging between one dot (single shot) and three dots (full
   * auto) on an ink plate above the weapons, 1 s, then gone. Own drawing, own markings.
   */
  private drawSelector(dt: number): void {
    const sel = this.selector;
    if (!sel) return;
    sel.t += dt;
    const g = sel.g;
    g.clear();
    const cx = 330, cy = H - 360, a = Math.min(1, sel.t / 0.15);
    const fade = Math.max(0, Math.min(1, (1.1 - sel.t) / 0.2));
    g.setAlpha(fade); sel.text.setAlpha(fade);
    g.fillStyle(INK_HEX, 0.92).fillRoundedRect(cx - 120, cy - 70, 240, 150, 16);
    g.lineStyle(4, 0x5b5c61, 1).strokeRoundedRect(cx - 120, cy - 70, 240, 150, 16);
    // marks: one dot left (single), three dots right (auto)
    g.fillStyle(0xffffff, 1).fillCircle(cx - 60, cy - 30, 7);
    for (const dx of [-14, 0, 14]) g.fillCircle(cx + 60 + dx, cy - 30, 6);
    // the lever swings from the old mark to the new one
    const from = sel.semi ? 0.6 : -0.6, to = sel.semi ? -0.6 : 0.6;
    const ang = from + (to - from) * (1 - (1 - a) * (1 - a));
    const lx = cx + Math.sin(ang) * 70, ly = cy + 30 - Math.cos(ang) * 70;
    g.lineStyle(14, 0x8e8f94, 1).lineBetween(cx, cy + 30, lx, ly);
    g.fillStyle(0x8e8f94, 1).fillCircle(cx, cy + 30, 16);
    g.fillStyle(INK_HEX, 1).fillCircle(cx, cy + 30, 6);
    sel.text.setText(sel.semi ? 'SINGLE' : 'AUTO').setPosition(cx, cy + 48);
    if (sel.t > 1.1) { g.destroy(); sel.text.destroy(); this.selector = undefined; }
  }

  // ---------- E1: weapons ----------

  /** One row per hand that holds something (front hand lowest), then grenades; above the life row. */
  private drawWeapons(me?: Actor): void {
    const g = this.panel;
    g.clear();
    const rows: { kind: string; hand?: Hand; mouse?: 0 | 1; count?: number }[] = [];
    me?.hands.forEach((h, i) => { if (h && (isWeapon(h.item) || isMelee(h.item))) rows.push({ kind: h.item, hand: h, mouse: i as 0 | 1 }); });
    if (me && (me.grenades > 0 || me.cook !== undefined)) rows.push({ kind: 'grenade', count: me.grenades });
    const base = H - 120 - (this.game.world.players.length - 1) * 56 - 70;
    this.icons.forEach((im, i) => { im.setVisible(i < rows.length); this.labels[i].setVisible(i < rows.length); });
    rows.forEach((r, i) => {
      const y = base - i * 74;
      let x = 36;
      if (r.mouse !== undefined) { mouseIcon(g, x, y, r.mouse); x += 46; }
      const icon = this.icons[i];
      icon.setTexture(iconKey(this.scene, r.kind)).setPosition(x, y).setScale(0.72);
      x += ICON_W * 0.72 + 6;
      const label = this.labels[i].setPosition(x, y).setColor('#ffffff');
      if (r.kind === 'grenade') { label.setText(me?.cook !== undefined ? 'COOKING' : `×${r.count}`); return; }
      const h = r.hand!;
      if (isMelee(h.item)) { label.setText(''); return; }
      const w = WEAPONS[h.item as keyof typeof WEAPONS];
      if (h.reload > 0) {
        // reload: a bar filling up
        const u = 1 - h.reload / w.reload;
        g.fillStyle(INK_HEX, 1).fillRect(x - 3, y - 10, 126, 20);
        g.fillStyle(0xffffff, 1).fillRect(x, y - 7, 120 * u, 14);
        label.setText('').setVisible(false);
        return;
      }
      if (h.ammo === 0) { label.setText(h.clicked ? 'EMPTY · THROW' : 'EMPTY').setColor('#ff5a50'); return; }
      const spare = (h.spare > 0 ? '  +1' : '') + (w.modes ? (h.semi ? '  SEMI' : '  AUTO') : '');
      if (w.mag <= 12) {
        // a tick per round: white = loaded, hollow = spent
        for (let k = 0; k < w.mag; k++) {
          const tx = x + k * 13;
          g.fillStyle(INK_HEX, 1).fillRect(tx - 2, y - 13, 12, 26);
          g.fillStyle(k < h.ammo ? 0xffffff : 0x3a3b40, 1).fillRect(tx, y - 11, 8, 22);
        }
        label.setPosition(x + w.mag * 13 + 6, y).setText(spare);
      } else {
        // big magazines: a gauge and the count
        g.fillStyle(INK_HEX, 1).fillRect(x - 3, y - 10, 126, 20);
        g.fillStyle(0xffffff, 1).fillRect(x, y - 7, (120 * h.ammo) / w.mag, 14);
        label.setPosition(x + 132, y).setText(`${h.ammo}${spare}`);
      }
    });
  }

  // ---------- E2: prompts ----------

  /** The thing E would act on right now: an exit, a takedown, a weapon on the floor. */
  private promptTarget(me: Actor): { key: string; verb: string; at: [number, number, number]; id: string; plan?: PickupPlan } | undefined {
    const w = this.game.world;
    const exit = usableExitAt(w, me);
    const head: [number, number, number] = [me.pos.x, me.pos.y + 1.35, me.pos.z];
    const ahead = partnerAhead(w, me);
    if (exit) {
      // co-op: a ceiling vent takes a boost; a partner already gone on is followed
      const verb = needsBoost(w, exit) ? (boostBase(w, me) ? 'GO UP' : 'BOOST') : ahead?.id === exit.id ? 'FOLLOW' : exit.kind === 'vent' ? 'GO IN' : exit.kind === 'lift' ? 'RIDE' : 'CLIMB';
      return { key: SETTINGS.keys.use, verb, at: head, id: `exit${exit.kind}${verb}` };
    }
    if (me.traversing?.kind === 'brace') return { key: SETTINGS.keys.use, verb: 'STAND UP', at: [me.pos.x, me.pos.y + 1.1, me.pos.z], id: 'brace' };
    if (w.coop && !me.traversing && me.state === 'free') {
      const base = w.activePlayers.find((q) => q !== me && q.traversing?.kind === 'brace');
      if (base) return { key: '', verb: 'BOOST UP', at: [base.pos.x, base.pos.y + 1.3, base.pos.z], id: 'boostHint' };
      if (ahead) { const s = exitSpot(w, ahead); return { key: '', verb: 'FOLLOW', at: [s.x, 1.4, s.z], id: `follow${ahead.id}` }; }
      if (waitingInExit(w, me)) return { key: '', verb: 'WAITING', at: head, id: 'waiting' };
    }
    // M18 (design/coop-moves.md): glyphs that teach the co-op moves
    const coopHint = w.coop && SETTINGS.coopHints ? this.coopHint(me) : undefined;
    if (coopHint) return coopHint;
    if (me.state !== 'free') return undefined;
    const prey = takedownTarget(w, me);
    if (prey) return { key: SETTINGS.keys.use, verb: 'TAKEDOWN', at: [prey.pos.x, prey.pos.y + 1.3, prey.pos.z], id: `td${prey.id}` };
    // M17: the same plan E would carry out (design/qol-pass.md 2a)
    const plan = pickupPlan(w, me);
    if (!plan || plan.item.kind === 'boombox') return undefined;
    const it = plan.item;
    const verb = plan.verb === 'pull' ? 'PULL' : plan.verb === 'swap' ? 'SWAP' : 'TAKE';
    return { key: SETTINGS.keys.use, verb, at: [it.pos.x, it.pos.y + 0.45, it.pos.z], id: `it${it.id}${plan.verb}${plan.hand}`, plan };
  }

  /** M18: carried, carrying, the partner holding a grunt next to you, the cursor on your partner. */
  private coopHint(me: Actor): { key: string; verb: string; at: [number, number, number]; id: string } | undefined {
    const w = this.game.world, K = SETTINGS.keys;
    const over = (a: Actor, h = 1.35): [number, number, number] => [a.pos.x, a.pos.y + h, a.pos.z];
    // a long key name (SPACE) doesn't fit the key box: it's written out in the word instead
    const glyph = (key: string, verb: string) => (key.length > 1 ? { key: '', verb: `${key} ${verb}` } : { key, verb });
    if (me.carried) return { ...(me.carried === 'overhead' ? glyph(K.grab, `SPIN · ${K.jump} OFF`) : glyph(K.jump, 'OFF')), at: over(me, 1.0), id: `carried${me.carried}` };
    const held = me.holding?.kind === 'actor' ? w.actorById(me.holding.id) : undefined;
    if (held?.carried) return { key: K.grab, verb: 'THROW', at: over(me, 1.6), id: 'carrying' };
    if (me.state !== 'free') return undefined;
    const mate = w.activePlayers.find((p) => p !== me);
    if (!mate) return undefined;
    const victim = mate.holding?.kind === 'actor' ? w.actorById(mate.holding.id) : undefined;
    if (victim && victim.kind !== 'hero' && victim.state === 'grabbed' && Math.abs(victim.pos.x - me.pos.x) < 1.6 && Math.abs(victim.pos.z - me.pos.z) < 0.5) {
      return { key: K.grab, verb: 'TEAR · LMB/RMB HIT', at: over(victim, 1.4), id: `held${victim.id}` };
    }
    const p = this.scene.input.activePointer;
    if (partnerUnderCursor(w, me, [p.x, p.y]) !== mate) return undefined;
    const d = Math.hypot(mate.pos.x - me.pos.x, mate.pos.z - me.pos.z);
    if (!me.hands[0] && !me.hands[1] && Math.abs(mate.pos.x - me.pos.x) <= TUNING.grab.assistRadius && Math.abs(mate.pos.z - me.pos.z) <= TUNING.grab.assistDepth) return { key: K.grab, verb: 'LIFT', at: over(mate), id: 'lift' };
    if ((me.hands[0] || me.hands[1]) && d <= TUNING.coop.pass.range) return { key: K.throw, verb: 'PASS', at: over(mate), id: 'pass' };
    return undefined;
  }

  private drawPrompt(me: Actor | undefined, dt: number): void {
    const g = this.glyph;
    g.clear();
    const t = me ? this.promptTarget(me) : undefined;
    this.glyphText.setVisible(!!t);
    this.glyphVerb.setVisible(!!t);
    for (const im of this.promptIcons) im.setVisible(false);
    this.glyphNote.setVisible(false);
    if (!t) { this.glyphKey = ''; return; }
    if (t.id !== this.glyphKey) { this.glyphKey = t.id; this.glyphAge = 0; }
    this.glyphAge += dt;
    // pops in (1.35 -> 1) and bobs gently
    const pop = 1 + 0.35 * Math.max(0, 1 - this.glyphAge / 0.18);
    const [x, y0] = project(t.at[0], t.at[1], t.at[2]);
    const y = y0 + Math.sin(this.glyphAge * 4) * 3;
    // co-op hints (waiting, follow, boost) are a word with no key
    this.glyphText.setVisible(!!t.key);
    if (!t.key) { this.glyphVerb.setText(t.verb).setOrigin(0.5, 0.5).setPosition(x, y); return; }
    this.glyphVerb.setOrigin(0, 0.5);
    const r = 22 * pop;
    g.fillStyle(INK_HEX, 1).fillRoundedRect(x - r - 4, y - r - 4, (r + 4) * 2, (r + 4) * 2, 10);
    g.fillStyle(0xf2f2f3, 1).fillRoundedRect(x - r, y - r, r * 2, r * 2, 8);
    g.fillStyle(0xc9cacd, 1).fillRect(x - r, y + r - 6 * pop, r * 2, 6 * pop);
    this.glyphText.setText(t.key.toUpperCase()).setPosition(x, y - 2).setScale(pop);
    this.glyphVerb.setText(t.verb).setPosition(x + r + 12, y);
    if (t.plan && me) this.drawPlan(me, t.plan, x + r + 12, y);
  }

  /**
   * M17 (design/qol-pass.md 2d): after the verb, the hand it goes into (a mouse icon), the item's
   * icon, name and ammo, and for a swap what leaves the hand; E held = the hand chooser below.
   */
  private drawPlan(me: Actor, plan: PickupPlan, x0: number, y: number): void {
    const g = this.glyph, it = plan.item;
    let x = x0 + this.glyphVerb.width + 10;
    if (plan.hand !== 'both' && plan.verb !== 'pocket') { mouseIcon(g, x, y, plan.hand); x += 42; }
    const [icon, old, row0, row1] = this.promptIcons;
    icon.setTexture(iconKey(this.scene, it.kind)).setPosition(x, y).setScale(0.5).setAlpha(1).setVisible(true);
    x += ICON_W * 0.5 + 4;
    const name = isWeapon(it.kind) ? WEAPONS[it.kind].name : isMelee(it.kind) ? MELEE[it.kind].name : it.kind === 'grenade' ? 'Grenade +1' : '';
    const empty = emptyGun(it.kind, it.ammo, it.spare);
    const ammo = isWeapon(it.kind) ? (empty ? '  EMPTY' : `  ${it.ammo ?? WEAPONS[it.kind].mag}${(it.spare ?? 1) > 0 ? '+1' : ''}`) : '';
    this.glyphNote.setText(name.toUpperCase() + ammo).setPosition(x, y).setColor(empty ? '#9a9ba0' : '#ffffff').setVisible(true);
    x += this.glyphNote.width + 12;
    const chooser = plan.verb === 'swap' && plan.hand !== 'both' && me.useHeldAt !== undefined && this.game.world.time - me.useHeldAt >= TUNING.qol.holdShow;
    if (plan.verb === 'swap' && plan.replaces[0] && !chooser) {
      // what leaves the hand, dimmed and struck through
      g.lineStyle(4, INK_HEX, 1).lineBetween(x, y, x + 22, y).lineBetween(x + 14, y - 8, x + 22, y).lineBetween(x + 14, y + 8, x + 22, y);
      x += 30;
      const out = plan.replaces[0].item;
      old.setTexture(iconKey(this.scene, out)).setPosition(x, y).setScale(0.45).setAlpha(0.75).setVisible(true);
      // the strike line spans the drawn weapon (iconKey draws it from x 15 at k px per H)
      const len = isWeapon(out) ? WEAPONS[out].length : isMelee(out) ? MELEE[out].length : 0.2;
      const w = (15 + len * Math.min(260, (ICON_W - 30) / len)) * 0.45;
      g.lineStyle(4, INK_HEX, 1).lineBetween(x + 2, y + 10, x + w, y - 10);
    }
    if (!chooser) return;
    // hold E: LMB / RMB rows with what each hand holds now, on an ink plate; the smart pick is brighter
    g.fillStyle(INK_HEX, 0.82).fillRoundedRect(x0 - 10, y + 26, 160, 104, 10);
    [row0, row1].forEach((im, i) => {
      const h = me.hands[i];
      if (!h) return;
      const ry = y + 52 + i * 50;
      mouseIcon(g, x0, ry, i as 0 | 1);
      im.setTexture(iconKey(this.scene, h.item)).setPosition(x0 + 42, ry).setScale(0.45).setAlpha(plan.hand === i ? 1 : 0.5).setVisible(true);
    });
  }

  // ---------- C4: hurt edges, last life ----------

  private drawHurt(me: Actor | undefined, dt: number): void {
    for (const i of [0, 1] as const) {
      this.edgeT[i] = Math.max(0, this.edgeT[i] - dt / 0.5);
      this.edges[i].setAlpha(this.edgeT[i] * this.edgeT[i]);
    }
    const last = !!me && me.maxHp > 1 && me.hp === 1 && me.state !== 'dead' && me.state !== 'downed' && !this.game.cleared;
    if (last) {
      this.lowT += dt;
      // a double beat ~70 per minute
      const ph = (this.lowT * 1.15) % 1;
      const beat = Math.exp(-ph * 9) + 0.6 * Math.exp(-Math.max(0, ph - 0.22) * 9) * (ph > 0.22 ? 1 : 0);
      this.low.setAlpha(Math.min(1, this.lowT / 0.4) * (0.35 + 0.35 * beat));
      if (this.heart === undefined) this.heart = audio()?.play('heartbeat', {});
    } else {
      this.lowT = 0;
      this.low.setAlpha(Math.max(0, this.low.alpha - dt * 2));
      if (this.heart !== undefined) { audio()?.stop(this.heart, 0.6); this.heart = undefined; }
    }
  }

  // ---------- F2: stage card ----------

  /** "STAGE n" and our stage name on an ink band with a red slash: slides in, holds, slides out (2.4 s). */
  private showCard(stage: number): void {
    const s = this.scene;
    const band = s.add.graphics();
    band.fillStyle(INK_HEX, 0.94).fillRect(0, 380, W, 300);
    band.fillStyle(RED, 1);
    band.beginPath(); band.moveTo(0, 640); band.lineTo(W, 590); band.lineTo(W, 612); band.lineTo(0, 664); band.closePath(); band.fillPath();
    const small = s.add.text(220, 420, `STAGE ${stage}`, { fontFamily: 'Anton', fontSize: '54px', color: '#9a9ba0' });
    const big = s.add.text(214, 470, STAGE_NAMES[stage] ?? '', { fontFamily: 'Anton', fontSize: '128px', color: '#f2f2f3', stroke: INK, strokeThickness: 10 });
    this.card = { root: s.add.container(0, 0, [band, small, big]).setDepth(96), t: 0 };
  }

  private drawCard(dt: number): void {
    const c = this.card;
    if (!c) return;
    c.t += dt;
    const ease = (u: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, u)), 3);
    // in over 0.3 s from the left, out over 0.3 s to the right after 2.1 s
    const x = c.t < 2.1 ? -W * (1 - ease(c.t / 0.3)) : W * ease((c.t - 2.1) / 0.3);
    c.root.setX(x);
    if (c.t > 2.4) { c.root.destroy(); this.card = undefined; }
  }
}

/** A mouse with the left or right button lit (which button fires this hand). */
function mouseIcon(g: Phaser.GameObjects.Graphics, x: number, y: number, button: 0 | 1): void {
  g.fillStyle(INK_HEX, 1).fillRoundedRect(x - 3, y - 23, 34, 46, 14);
  g.fillStyle(0x5b5c61, 1).fillRoundedRect(x, y - 20, 28, 40, 12);
  g.fillStyle(0xffffff, 1).fillRoundedRect(x + (button ? 15 : 0), y - 20, 13, 18, { tl: button ? 0 : 12, tr: button ? 12 : 0, bl: 0, br: 0 });
  g.fillStyle(INK_HEX, 1).fillRect(x + 13, y - 20, 2, 18);
}

/** The drawn icon for an item kind, made once (the same painters as the game). */
function iconKey(scene: Phaser.Scene, kind: string): string {
  const key = `hud-icon-${kind}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, ICON_W, ICON_H)!;
  const ctx = tex.context;
  const len = isWeapon(kind) ? WEAPONS[kind].length : isMelee(kind) ? MELEE[kind].length : 0.2;
  const k = Math.min(260, (ICON_W - 30) / len);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // a soft light halo so dark guns read on dark rooms
  ctx.shadowColor = 'rgba(255,255,255,0.55)';
  ctx.shadowBlur = 6;
  if (kind === 'grenade') { ctx.translate(ICON_H / 2, ICON_H / 2 + 6); ctx.scale(200, 200); paintGrenade(ctx, false, false); }
  else { ctx.translate(15, ICON_H / 2 + (isMelee(kind) ? 0 : 6)); ctx.scale(k, k); paintHeld(ctx, kind as never); }
  ctx.restore();
  tex.refresh();
  return key;
}

/** Edge gradient (red into ink at the very edge) and the last-life vignette. */
function makeTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists('hud-edge')) {
    const tex = scene.textures.createCanvas('hud-edge', 320, H)!;
    const ctx = tex.context;
    const g = ctx.createLinearGradient(0, 0, 320, 0);
    g.addColorStop(0, 'rgba(120,6,14,0.85)');
    g.addColorStop(0.12, 'rgba(199,15,27,0.6)');
    g.addColorStop(1, 'rgba(199,15,27,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 320, H);
    tex.refresh();
  }
  if (!scene.textures.exists('hud-low')) {
    const tex = scene.textures.createCanvas('hud-low', W, H)!;
    const ctx = tex.context;
    const g = ctx.createRadialGradient(W / 2, H * 0.52, H * 0.42, W / 2, H * 0.52, H * 1.05);
    g.addColorStop(0, 'rgba(140,8,18,0)');
    g.addColorStop(1, 'rgba(140,8,18,0.75)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    tex.refresh();
  }
}
