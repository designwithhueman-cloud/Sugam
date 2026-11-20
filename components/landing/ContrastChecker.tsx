'use client';
// Free contrast checker. Two colours in, the WCAG ratio and a pass or fail for each text size out, plus the closest passing
// colour when it fails (the same calculation the scanner uses for its fixes). It checks flat colours only: text over an
// image or gradient needs a person, and the page says so. The result is one polite live region.
import * as React from 'react';
import { CopyButton } from '@/components/CopyButton.tsx';
import { hexToRgb, ratio, suggestForeground } from '@/lib/contrast.ts';

const field = 'min-h-12 w-full rounded-xl border border-black/30 bg-white px-4 text-lg text-ink';
const norm = (v: string) => { const t = v.trim(); return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t) ? (t.startsWith('#') ? t : '#' + t) : null; };

function ColourField({ id, label, value, set }: { id: string; label: string; value: string; set: (v: string) => void }) {
  const ok = norm(value);
  return (
    <div>
      <label htmlFor={id} className="block text-base font-semibold text-ink">{label}</label>
      <div className="mt-2 flex items-center gap-3">
        <input type="color" aria-label={`${label}, colour picker`} value={ok && ok.length === 7 ? ok : '#000000'} onChange={(e) => set(e.target.value)} className="size-12 shrink-0 cursor-pointer rounded-xl border border-black/30 bg-white p-1" />
        <input id={id} value={value} onChange={(e) => set(e.target.value)} spellCheck={false} autoComplete="off" aria-invalid={!ok} aria-describedby={`${id}-hint`} className={field} />
      </div>
      <p id={`${id}-hint`} className={`mt-1 text-sm ${ok ? 'text-neutral-700' : 'text-[#b3261e]'}`}>{ok ? 'Hex colour, such as #1a1a1a' : 'Enter a hex colour such as #1a1a1a'}</p>
    </div>
  );
}

const Row = ({ name, pass }: { name: string; pass: boolean }) => (
  <li className="flex items-center justify-between gap-4 border-b border-black/10 py-3 last:border-0">
    <span className="text-lg text-ink">{name}</span>
    <span className={`rounded-full px-3 py-1 text-base font-semibold ${pass ? 'bg-[#d9f56e] text-ink' : 'bg-[#fde0dc] text-[#7a1710]'}`}>{pass ? 'Passes' : 'Fails'}</span>
  </li>
);

export function ContrastChecker() {
  const [fg, setFg] = React.useState('#767676');
  const [bg, setBg] = React.useState('#ffffff');
  const f = norm(fg), b = norm(bg);
  const rf = f && hexToRgb(f), rb = b && hexToRgb(b);
  const r = rf && rb ? Math.round(ratio(rf, rb) * 100) / 100 : null;
  const sug = f && b && r !== null && r < 4.5 ? suggestForeground(f, b, 4.5) : null;
  const sug3 = f && b && r !== null && r < 3 ? suggestForeground(f, b, 3) : null;
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-6 rounded-[2rem] border border-black/10 bg-white p-6 sm:p-8">
        <ColourField id="cc-fg" label="Text colour" value={fg} set={setFg} />
        <ColourField id="cc-bg" label="Background colour" value={bg} set={setBg} />
        <p aria-hidden className="rounded-2xl border border-black/10 p-5 text-xl font-semibold" style={{ color: f ?? '#000', backgroundColor: b ?? '#fff' }}>Sample text in your colours</p>
      </div>
      <div className="rounded-[2rem] border border-black/10 bg-white p-6 sm:p-8">
        <div role="status" aria-live="polite">
          {r === null ? <p className="text-lg text-neutral-800">Enter two hex colours to see the ratio.</p> : (
            <>
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-vio-deep">Contrast ratio</p>
              <p className="mt-1 text-6xl font-semibold tracking-tight text-ink">{r}<span className="text-3xl text-neutral-700"> : 1</span></p>
              <ul className="mt-6">
                <Row name="Normal text, AA (4.5 : 1)" pass={r >= 4.5} />
                <Row name="Large text, AA (3 : 1)" pass={r >= 3} />
                <Row name="Buttons and field borders (3 : 1)" pass={r >= 3} />
                <Row name="Normal text, AAA (7 : 1)" pass={r >= 7} />
              </ul>
              {sug && (
                <div className="mt-6 rounded-2xl bg-[#f6f5f1] p-4">
                  <p className="text-lg text-ink">Closest text colour that passes for normal text: <b>{sug.color}</b> ({sug.ratio} : 1). It is your colour moved only as far as needed.</p>
                  <div className="mt-3"><CopyButton text={sug.color} label="colour" className="border-ink bg-white text-ink hover:bg-black/5" /></div>
                </div>
              )}
              {!sug && sug3 === null && r < 4.5 && r >= 3 && <p className="mt-6 text-lg text-neutral-800">This passes for large text only. Use a darker or lighter colour for normal-sized text.</p>}
            </>
          )}
        </div>
        <p className="mt-6 text-base leading-relaxed text-neutral-700">This checks two flat colours. Text over a photo or gradient changes from place to place, so it needs a person to check the worst spot.</p>
      </div>
    </div>
  );
}
