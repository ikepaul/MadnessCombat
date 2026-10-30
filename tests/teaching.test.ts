// M14b ENC-20 / ENC-13: the teaching map. Every verb of the controls list is taught by a stage
// caption, or is a known gap listed in NEVER; a verb that loses its caption (or a new verb with
// none) fails here. Captions name keys through `{key:action}` (fillKeys), never hard-coded, so
// they follow the player's bindings.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYS } from '../src/settings';

const DIR = join(__dirname, '../src/data/stages');
/** Every caption / card string in the stage scripts (single-quoted literals passed to card() or caption()). */
const CAPTIONS: string[] = readdirSync(DIR).filter((f) => f.endsWith('.ts')).flatMap((f) => {
  const src = readFileSync(join(DIR, f), 'utf8');
  const out: string[] = [];
  for (const m of src.matchAll(/(?:card\(|caption\(s, |Caption: |text: )(['"])((?:\\.|(?!\1).)*)\1/g)) out.push(m[2]);
  return out;
});

/** Verb -> what a caption teaching it says. */
const TEACHING: Record<string, RegExp> = {
  'move / walk up': /Go and have a word/,
  'get up, low sweep, finisher': /\{key:dive\} into him for a low sweep/,
  'grab & throw': /\{key:grab\} grabs one of them/,
  launcher: /cursor high launches him/,
  'prone dodge': /\{key:dive\}.*(flat|Down)|Down!.*\{key:dive\}/,
  jump: /\{key:jump\}/,
  grenade: /hold \{key:grenade\} to cook|Cook a grenade/,
  'pick up / pull (E)': /Pick it up \(\{key:use\}\)|pull it out/,
  'empty-gun throw': /press again to throw it|Empty guns: throw them/,
  'split aim': /\{key:split\}/,
  'takedown (wire)': /press \{key:use\}: with empty hands, the wire/,
  steal: /take it off him/,
  catch: /just before it hits catches it/,
  pin: /Pin him/,
  'human shield': /as a shield/,
  interrogation: /walk up and press \{key:use\}/,
  'ladder / lift / hatch / vent': /ladder|The lift|hatch|vent/,
  'knife throw': /LMB throws a knife/,
  disarm: /knock(s)? (the gun|one) out of (his|a) hand/,
};

/** Known gaps (design/audit/enc.md ENC-20): taught on the controls page only, for now. */
const NEVER: Record<string, RegExp> = {
  reload: /{key:reload}/, 'Q throw': /{key:throw}/, 'fire mode': /{key:fireMode}/, 'juggle spike / head punt': /spike|head punt/,
  'over-the-shoulder shot': /over.the.shoulder/, 'flying kick': /flying kick/, rage: /{key:rage}/, 'co-op moves': /partner/,
};

describe('teaching map (ENC-20)', () => {
  it('found the captions', () => expect(CAPTIONS.length).toBeGreaterThan(40));

  it('every taught verb has its caption', () => {
    const missing = Object.entries(TEACHING).filter(([, re]) => !CAPTIONS.some((c) => re.test(c))).map(([v]) => v);
    expect(missing).toEqual([]);
  });

  it('the known gaps are still gaps (taught now: move it to TEACHING)', () => {
    expect(Object.entries(NEVER).filter(([, re]) => CAPTIONS.some((c) => re.test(c))).map(([v]) => v)).toEqual([]);
  });

  it('captions name bindable keys through {key:action} only', () => {
    const keys = new Set(Object.values(DEFAULT_KEYS).map((k) => k.length === 1 ? k : k[0] + k.slice(1).toLowerCase()));
    keys.add('Ctrl');
    const hard = CAPTIONS.filter((c) => {
      const plain = c.replace(/\{key:\w+\}/g, '');
      return [...keys].some((k) => (k.length === 1 ? new RegExp(`(\\(${k}\\)|press ${k}\\b|: ${k}\\b|\\b${k} (at|under|to|grabs|again)\\b)`) : new RegExp(`\\b${k}\\b`)).test(plain));
    });
    expect(hard).toEqual([]);
    for (const c of CAPTIONS) for (const m of c.matchAll(/\{key:(\w+)\}/g)) expect(DEFAULT_KEYS, c).toHaveProperty(m[1]);
  });
});
