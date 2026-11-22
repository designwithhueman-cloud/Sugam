// The launch checks on a paid report: what each of the sixteen checks found on desktop and on a phone, in plain words, and what an owner
// could supply to let a blocked one decide. Observations only: nothing here is a confirmed issue or part of any score.
import type { LaunchReport, LaunchCell } from '@/lib/launch/view.ts';

const WORD: Record<string, { label: string; tone: string }> = {
  observed: { label: 'Checked', tone: 'bg-[#dcf3e7] text-[#174a32]' },
  'needs-review': { label: 'Worth a look', tone: 'bg-[#efe9ff] text-[#3b2a7a]' },
  'analyzer-finding': { label: 'Flagged by axe', tone: 'bg-[#fde7e1] text-[#7a1f0b]' },
  'needs-person': { label: 'For a person', tone: 'bg-[#fff1d6] text-[#6b4300]' },
  'not-applicable': { label: 'Does not apply', tone: 'bg-[#f4f2ec] text-neutral-800' },
  'not-run': { label: 'Didn’t run', tone: 'bg-[#f4f2ec] text-neutral-800' },
};
function Cell({ c, vp }: { c?: LaunchCell; vp: string }) {
  if (!c) return <td className="px-3 py-3 align-top text-neutral-600">–</td>;
  const w = WORD[c.outcome] ?? { label: c.outcome, tone: 'bg-[#f4f2ec] text-neutral-800' };
  return (
    <td className="px-3 py-3 align-top">
      <span className={`inline-block rounded-full px-2.5 py-0.5 text-sm font-semibold ${w.tone}`}>{w.label}<span className="sr-only"> on {vp}</span></span>
      <p className="mt-1 text-sm leading-snug text-neutral-800">{c.reason}</p>
      {c.target && <p className="mt-1 break-all font-mono text-xs text-neutral-600">{c.target}</p>}
    </td>
  );
}
export function LaunchChecks({ launch }: { launch: NonNullable<LaunchReport> }) {
  const open = launch.lines.filter((l) => [l.viewports.desktop?.outcome, l.viewports.mobile?.outcome].some((o) => o === 'needs-review' || o === 'analyzer-finding')).length;
  return (
    <section aria-labelledby="launch-h" className="px-5 pb-16 sm:px-10" data-testid="launch-checks">
      <div className="mx-auto max-w-7xl rounded-[1.75rem] border border-black/10 bg-white p-5 sm:p-7">
        <h2 id="launch-h" className="text-2xl font-semibold tracking-tight text-ink">Launch checks</h2>
        <p className="mt-1 max-w-3xl text-base text-neutral-800">{open ? `${open} of ${launch.lines.length} checks are worth a look.` : `None of the ${launch.lines.length} checks needs a look.`} {launch.note}</p>
        {/* Phones: one card per check, both widths stacked (a wide table would push the page sideways). */}
        <ul className="mt-4 space-y-3 md:hidden">{launch.lines.map((l) => (
          <li key={l.entry} className="rounded-xl border border-black/10 p-3" data-testid="launch-line" data-entry={l.entry}>
            <p className="font-semibold text-ink">{l.title}</p><p className="text-sm text-neutral-600">{l.hostRuleId}{l.needs ? ` · needs ${l.needs}` : ''}</p>
            <dl className="mt-2 space-y-2">{(['desktop', 'mobile'] as const).map((vp) => { const c = l.viewports[vp]; const w = c ? WORD[c.outcome] ?? { label: c.outcome, tone: 'bg-[#f4f2ec] text-neutral-800' } : null; return (
              <div key={vp}><dt className="text-sm font-medium text-neutral-600">{vp === 'desktop' ? 'Desktop' : 'Phone'}</dt>
                <dd>{c && w ? <><span className={`inline-block rounded-full px-2.5 py-0.5 text-sm font-semibold ${w.tone}`}>{w.label}</span><span className="mt-1 block text-sm leading-snug text-neutral-800">{c.reason}</span></> : <span className="text-neutral-600">–</span>}</dd></div>); })}</dl>
          </li>))}</ul>
        <div className="mt-4 hidden md:block">
          <table className="w-full table-fixed border-collapse text-left text-[15px]">
            <caption className="sr-only">Launch checks by viewport</caption>
            <thead><tr className="border-b border-black/10 text-sm text-neutral-700"><th scope="col" className="px-3 pb-2 font-semibold">Check</th><th scope="col" className="px-3 pb-2 font-semibold">Desktop (1280px)</th><th scope="col" className="px-3 pb-2 font-semibold">Phone (320px)</th></tr></thead>
            <tbody>{launch.lines.map((l) => (
              <tr key={l.entry} className="border-b border-black/5 last:border-0" data-testid="launch-line" data-entry={l.entry}>
                <th scope="row" className="px-3 py-3 align-top font-normal"><p className="font-semibold text-ink">{l.title}</p><p className="text-sm text-neutral-600">{l.hostRuleId}{l.needs ? ` · needs ${l.needs}` : ''}</p></th>
                <Cell c={l.viewports.desktop} vp="desktop" /><Cell c={l.viewports.mobile} vp="phone" />
              </tr>))}</tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
