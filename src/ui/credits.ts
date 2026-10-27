// The credits screen's text (PLAN.md M13): assets/CREDITS.md as plain lines, no markup. The
// CC-BY attributions there are required.
import creditsMd from '../../assets/CREDITS.md?raw';

export function creditsText(): string {
  return creditsMd
    .split('\n')
    .filter((l) => !l.startsWith('Shown on') && l.trim() !== '')
    .map((l) => l.replace(/^#+\s*/, '').replace(/\*\*/g, '').replace(/^-\s*/, '• '))
    .join('\n');
}
