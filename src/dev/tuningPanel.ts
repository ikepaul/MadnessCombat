// F6 tuning panel (dev only, M13 playtest pass): every number in TUNING, FEEL, GUNS, GRENADE,
// THROWN and DISARM as an editable field with a search box (M14b F: on/off switches as a
// checkbox, number lists one field per entry, for the playtest's A/B switches). Changes apply live (values the sim
// reads each tick) and are saved for the next reload (values derived at load time, like the
// jump's gravity, need that reload). "Copy changes" puts the edited paths and values on the
// clipboard to be written back into src/data/.
import { FEEL } from '../data/feel';
import { DISARM, GRENADE, THROWN } from '../data/melee';
import { TUNING } from '../data/tuning';
import { GUNS } from '../data/weapons';
import { loadOverrides, saveOverrides, setPath, type TuneValue } from './overrides';

const ROOTS: Record<string, object> = { TUNING, FEEL, GUNS, GRENADE, THROWN, DISARM };

let panel: HTMLDivElement | undefined;

/** Every numeric or on/off leaf under the roots (list entries by index): [path, value]. */
function leaves(): [string, TuneValue][] {
  const out: [string, TuneValue][] = [];
  const walk = (o: unknown, path: string) => {
    if (typeof o === 'number' || typeof o === 'boolean') { out.push([path, o]); return; }
    if (typeof o !== 'object' || o === null) return;
    if (Array.isArray(o) && !o.every((v) => typeof v === 'number')) return;
    for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
  };
  for (const [name, root] of Object.entries(ROOTS)) walk(root, name);
  return out;
}

const stepFor = (v: number) => (v === 0 ? 0.01 : Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - 1));

export function toggleTuningPanel(): void {
  if (panel) { panel.remove(); panel = undefined; return; }
  const overrides = loadOverrides();
  const p = (panel = document.createElement('div'));
  Object.assign(p.style, {
    position: 'fixed', top: '0', right: '0', width: '380px', height: '100vh', overflow: 'auto', zIndex: '1000',
    background: 'rgba(20,20,22,0.94)', color: '#e6e6e8', font: '12px/1.4 Inter, sans-serif', padding: '10px', boxSizing: 'border-box',
  });
  // typing here mustn't move the hero or fire debug keys
  p.addEventListener('keydown', (e) => e.stopPropagation());
  p.addEventListener('keyup', (e) => e.stopPropagation());
  const head = document.createElement('div');
  head.innerHTML = '<b>Tuning (F6)</b> · live; derived values need a reload';
  const search = document.createElement('input');
  Object.assign(search.style, { width: '100%', margin: '8px 0', padding: '4px', background: '#2a2b30', color: '#fff', border: '1px solid #555' });
  search.placeholder = 'filter, e.g. juggle, hero, fuse';
  const buttons = document.createElement('div');
  const btn = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    Object.assign(b.style, { marginRight: '6px', background: '#3a3b40', color: '#fff', border: '1px solid #666', padding: '3px 8px', cursor: 'pointer' });
    b.onclick = fn;
    buttons.appendChild(b);
  };
  const list = document.createElement('div');
  btn('Copy changes', () => void navigator.clipboard?.writeText(JSON.stringify(loadOverrides(), null, 2)));
  btn('Reset all (reload)', () => { saveOverrides({}); location.reload(); });
  p.append(head, search, buttons, list);

  const rows: { path: string; row: HTMLDivElement }[] = [];
  for (const [path, value] of leaves()) {
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', justifyContent: 'space-between', gap: '6px', padding: '1px 0' });
    const label = document.createElement('span');
    label.textContent = path;
    label.style.overflowWrap = 'anywhere';
    const input = document.createElement('input');
    const flag = typeof value === 'boolean';
    if (typeof value === 'boolean') { input.type = 'checkbox'; input.checked = value; }
    else { input.type = 'number'; input.step = String(stepFor(value)); input.value = String(value); }
    Object.assign(input.style, { width: flag ? '16px' : '80px', background: '#2a2b30', color: '#fff', border: '1px solid #555' });
    const mark = () => { label.style.color = path in overrides ? '#ff6b73' : '#e6e6e8'; };
    mark();
    input.oninput = () => {
      const v = flag ? input.checked : Number(input.value);
      if (typeof v === 'number' && !Number.isFinite(v)) return;
      const [name, ...rest] = path.split('.');
      if (!setPath(ROOTS[name], rest, v)) return;
      overrides[path] = v;
      saveOverrides(overrides);
      mark();
    };
    row.append(label, input);
    list.appendChild(row);
    rows.push({ path, row });
  }
  search.oninput = () => {
    const q = search.value.toLowerCase();
    for (const r of rows) r.row.style.display = r.path.toLowerCase().includes(q) ? 'flex' : 'none';
  };
  document.body.appendChild(p);
  search.focus();
}
