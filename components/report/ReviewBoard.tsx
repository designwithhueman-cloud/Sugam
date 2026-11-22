'use client';
// The scorecard, the "Fix this first" block, the filterable issue list and the page preview with numbered pins, in one client component so that choosing a
// category, an issue or a pin updates all of them together. Rows arrive already rendered by the server (so plan gating and redaction are untouched); this file
// only filters, numbers and positions them. Scores are the rule engine's own provisional numbers, shown with their coverage; nothing is calculated here.
import * as React from 'react';
import { MapPin, Lock } from 'lucide-react';
import type { Board, Level } from '@/lib/review-view.ts';
import type { ViewportId } from '@/lib/report-types.ts';
import type { PageSummary } from '@/lib/page-summary.ts';
import { reasonLabel, remedyFor } from '@/lib/coverage-copy.ts';

export type BoardItem = {
  id: string; n: number; level: Level; categories: string[]; title: string;
  pin: { viewport: ViewportId; x: number; y: number; w: number; h: number } | null;
  /** One plain sentence on why it matters, where it is, the cropped screenshot (paid plans only) and the fix body. The lead issue has no fix here: it lives above. */
  sentence: string; where: string; review: boolean; visual: React.ReactNode | null; fix: React.ReactNode | null;
  node: React.ReactNode;
};
type Shot = { viewport: ViewportId; src: string; w: number; h: number; vw: number };

export { LEVELS } from '@/lib/levels.ts';
import { LEVELS } from '@/lib/levels.ts';
const band = (n: number) => (n >= 80 ? { c: '#2f7d1f', t: 'text-[#245f17]' } : n >= 50 ? { c: '#c26a00', t: 'text-[#8a4b00]' } : { c: '#c2200c', t: 'text-[#9a1a09]' });

function Ring({ score }: { score: number | null }) {
  const r = 54, C = 2 * Math.PI * r; const b = score == null ? null : band(score);
  const [on, setOn] = React.useState(false); React.useEffect(() => { const t = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(t); }, []);
  return (
    <div className="relative size-40 shrink-0 sm:size-48" role="img" aria-label={score == null ? 'No overall score yet' : `Overall readiness ${score} out of 100`}>
      <svg viewBox="0 0 128 128" className="size-full -rotate-90" aria-hidden>
        <circle cx="64" cy="64" r={r} fill="none" stroke="#ece9e2" strokeWidth="12" />
        {score != null && <circle cx="64" cy="64" r={r} fill="none" stroke={b!.c} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${on ? (C * score) / 100 : 0} ${C}`} className="transition-[stroke-dasharray] duration-1000 ease-out motion-reduce:transition-none" />}
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className={`text-6xl font-semibold leading-none tracking-tight ${b ? b.t : 'text-neutral-500'}`} data-testid="overall-score">{score ?? '–'}</span>
        <span className="mt-1 text-sm font-medium text-neutral-600">{score == null ? 'not scored' : 'out of 100'}</span>
      </div>
    </div>
  );
}


function Tab({ label, score, issues, critical, active, onClick, id, panel, onKey }: { label: string; score: number | null; issues: number; critical: number; active: boolean; onClick: () => void; id: string; panel: string; onKey: (e: React.KeyboardEvent) => void }) {
  const b = score == null ? null : band(score);
  return (
    <button type="button" role="tab" id={id} aria-selected={active} aria-controls={panel} tabIndex={active ? 0 : -1} onClick={onClick} onKeyDown={onKey} data-testid="cat-tile"
      className={`flex w-full shrink-0 items-center justify-between gap-3 whitespace-nowrap rounded-xl border-l-4 px-3 py-2.5 text-left text-base transition-colors md:w-full ${active ? 'border-[#5b2fd0] bg-[#efe9ff] font-semibold text-ink' : 'border-transparent text-neutral-800 hover:bg-black/5'}`}>
      <span className="truncate">{label}</span>
      <span className="flex items-center gap-2">
        {critical > 0 ? <span aria-label={`${critical} critical`} title={`${critical} critical`} className="grid size-5 place-items-center rounded-full bg-[#c2310f] text-xs font-bold text-white">{critical}</span> : issues > 0 ? <span className="text-xs text-neutral-600">{issues}</span> : null}
        {score != null && <span className={`text-sm font-bold ${b!.t}`}>{score}</span>}
      </span>
    </button>
  );
}

/** "No issues" only means something next to how many checks ran: a category where most checks did not run says so instead. */
function emptyLine(cat: Board['cats'][number] | undefined, cats: Board['cats'], filtered: boolean): string {
  if (filtered) return 'No issues at this level in what was checked.';
  const scope = cat ? [cat] : cats; const skipped = scope.reduce((n, c) => n + c.notRun.length, 0); const ran = scope.reduce((n, c) => n + c.ran, 0);
  if (!skipped) return `No issues in ${cat ? 'this category' : 'any category'} in what was checked.`;
  return `No issues found in the ${ran} check${ran === 1 ? '' : 's'} that ran. ${skipped} check${skipped === 1 ? '' : 's'} didn’t run, so this is not a clean result; see why below.`;
}

/** Each rule of the scan's snapshot that did not run: its id, the skip reason saved with the scan, and what would let it run. */
function WhyNotRun({ cats }: { cats: Board['cats'] }) {
  const rows = cats.flatMap((c) => c.notRun.map((r) => ({ ...r, cat: c.label })));
  if (!rows.length) return null;
  const many = cats.length > 1;
  return (
    <details className="mt-8 rounded-2xl ring-1 ring-black/10" data-testid="why-not-run">
      <summary className="min-h-11 cursor-pointer px-5 py-3 text-lg font-semibold text-ink">Why checks didn’t run ({rows.length})</summary>
      <div className="overflow-x-auto px-5 pb-5" tabIndex={0} role="region" aria-label="Checks that didn’t run, scrolls sideways on small screens">
        <table className="w-full min-w-[40rem] text-left text-base">
          <caption className="sr-only">Checks that didn’t run on this scan, with the saved reason and what would let each one run</caption>
          <thead><tr className="border-b border-black/10 text-sm text-neutral-600"><th scope="col" className="py-2 pr-3">Rule</th>{many && <th scope="col" className="py-2 pr-3">Category</th>}<th scope="col" className="py-2 pr-3">Saved reason</th><th scope="col" className="py-2">What would let it run</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-b border-black/5 align-top" data-testid="not-run-row" data-rule={r.id} data-reason={r.reason ?? 'unavailable'}>
              <th scope="row" className="py-2 pr-3 font-normal"><span className="font-mono text-sm font-semibold">{r.id}</span><span className="block text-neutral-700">{r.title}</span></th>
              {many && <td className="py-2 pr-3">{r.cat}</td>}
              <td className="py-2 pr-3">{reasonLabel(r.reason)}</td>
              <td className="py-2">{remedyFor(r.reason)}</td>
            </tr>))}</tbody>
        </table>
      </div>
    </details>
  );
}

function Num({ it }: { it: BoardItem }) {
  return <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: LEVELS[it.level].pin }} aria-label={`Issue ${it.n}`}>{it.n}</span>;
}
function Chip({ it }: { it: BoardItem }) {
  return <span className={`mb-1 inline-block rounded-full px-2.5 py-0.5 text-sm font-semibold ${LEVELS[it.level].chip}`}>{LEVELS[it.level].label}</span>;
}

/** One line that tells the reader what this category's score is about before they read any issue. */
function story(pool: BoardItem[], cat: string | null, skipped = 0): string {
  const c = pool.filter((i) => i.level === 'critical').length, fix = pool.filter((i) => !i.review).length, look = pool.length - fix; const s = (n: number) => (n === 1 ? '' : 's');
  const where = cat ? `in ${cat}` : 'on this page';
  if (c) return `${c} critical issue${s(c)} ${c === 1 ? 'is' : 'are'} holding this score down${fix > c ? `, with ${fix - c} more to fix` : ''}. Start with the first one.`;
  if (fix) return `Nothing critical ${where}. ${fix} thing${s(fix)} to fix${look ? ` and ${look} worth a look` : ''}, most important first.`;
  if (look) return `Nothing to fix ${where}. ${look} thing${s(look)} ${look === 1 ? 'is' : 'are'} worth a look by a person, because a check could not decide.`;
  return skipped ? `Nothing found ${where} so far, but ${skipped} check${s(skipped)} didn’t run.` : `No problems found ${where} in what was checked.`;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
/** Why a category (or the whole page) has no number, in one short line. */
function unscoredLine(cat: Board['cats'][number] | undefined, ov: Board['overall']): string {
  if (cat) return cat.observationsOnly ? 'Observations only: this category is never scored.' : cat.unscored ? `${cat.unscored}.` : `No score: ${plural(cat.missing, 'required check')} didn’t run.`;
  return ov ? `No overall score: ${ov.total - ov.assessed} of ${ov.total} categories are missing required checks.` : 'No score for this scan.';
}

function CatHeader({ name, sub, score, final, story: line, unscored }: { name: string; sub: string; score: number | null; final: boolean; story: string; unscored: string }) {
  return (
    <header data-testid="cat-summary">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0"><h3 className="text-4xl font-semibold tracking-[-0.03em] text-ink">{name}</h3><p className="mt-1 text-lg text-neutral-700">{sub}</p></div>
        <div className="sm:text-right">{score == null ? <p className="max-w-[14rem] text-base text-neutral-700" data-testid="cat-unscored">{unscored}</p>
          : <><p className="text-5xl font-semibold leading-none tracking-[-0.03em] text-ink" data-testid="cat-score"><span className="text-[#5b2fd0]">{score}</span><span className="text-neutral-900">/100</span></p>
          <p className="mt-1.5 text-base text-neutral-700">{final ? 'Final score' : 'Score'}</p></>}</div>
      </div>
      {score != null && <div aria-hidden className="mt-5 h-1.5 overflow-hidden rounded-full bg-[#ece9e2]"><span className="block h-full rounded-full" style={{ width: `${score}%`, background: band(score).c }} /></div>}
      <p className="mt-4 max-w-3xl text-lg text-ink" data-testid="cat-story">{line}</p>
    </header>
  );
}

function Hero({ it, cat, isLead, open, onToggle }: { it: BoardItem; cat: string | null; isLead: boolean; open: boolean; onToggle: () => void }) {
  const eyebrow = it.review ? (cat ? `Top observation in ${cat}` : 'Top observation') : cat ? `Biggest problem in ${cat}` : 'Biggest problem on this page';
  return (
    <article className="mt-8 border-t border-black/10 pt-8" aria-labelledby={`hero-${it.id}`} data-testid="cat-hero">
      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold"><span className={`rounded-full px-3 py-1 text-base ${LEVELS[it.level].chip}`}>{LEVELS[it.level].label}</span><span className="uppercase tracking-[0.14em] text-neutral-600">{eyebrow}</span>{isLead && <span className="rounded-full bg-ink px-3 py-0.5 text-white">Also your first fix</span>}</p>
      <h4 id={`hero-${it.id}`} className="mt-3 max-w-3xl text-balance text-3xl font-semibold leading-[1.1] tracking-[-0.025em] text-ink sm:text-[2.5rem] [overflow-wrap:anywhere]">{it.title}</h4>
      {it.sentence && <p className="mt-3 max-w-2xl text-xl leading-relaxed text-neutral-800 [overflow-wrap:anywhere]">{it.sentence}</p>}
      {it.visual ? <div className="mt-6">{it.visual}</div>
        : <p className="mt-5 inline-flex max-w-full items-center gap-2 rounded-full border-2 border-[#5b2fd0] bg-[#f6f2ff] px-4 py-1.5 text-base font-semibold text-[#432099] [overflow-wrap:anywhere]" data-testid="hero-where"><MapPin aria-hidden className="size-4 shrink-0" />{it.where}</p>}
      <div className="mt-6">
        {isLead || !it.fix ? <a href="#first-h" className="inline-flex min-h-12 items-center rounded-full bg-ink px-6 text-lg font-semibold text-white hover:bg-neutral-800">View fix</a>
          : <button type="button" aria-expanded={open} aria-controls={`herofix-${it.id}`} onClick={onToggle} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-6 text-lg font-semibold text-white hover:bg-neutral-800">{open ? 'Hide fix' : it.review ? 'Why it is flagged' : 'View fix'}<span aria-hidden className={`transition-transform ${open ? 'rotate-180' : ''}`}>⌄</span></button>}
      </div>
      {it.fix && !isLead && <div id={`herofix-${it.id}`} hidden={!open} className="mt-5 max-w-3xl" data-testid="other-row"><span className="sr-only">{it.title}</span>{it.fix}</div>}
    </article>
  );
}

function ScoreDetails({ cat, ov, pool }: { cat: Board['cats'][number] | undefined; ov: Board['overall']; pool: BoardItem[] }) {
  const count = (l: Level) => pool.filter((i) => i.level === l).length;
  return (
    <details className="group mt-10 border-t border-black/10" data-testid="score-details">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between text-xl font-semibold text-ink [&::-webkit-details-marker]:hidden">Score details<span aria-hidden className="text-2xl transition-transform group-open:rotate-180">⌄</span></summary>
      <div className="grid gap-4 pb-2 text-base text-neutral-800 sm:grid-cols-2">
        <p>{cat ? `${cat.coveragePct}% of this category’s checks reached a decision. ${cat.score != null ? 'Every required check ran, so it has a score.' : cat.observationsOnly ? 'It holds observations only and is never scored.' : `${plural(cat.missing, 'required check')} didn’t run, so it has no score.`}`
          : ov ? `${ov.coveragePct}% of all checks reached a decision and ${ov.assessed} of ${ov.total} categories had every required check run.${ov.score == null ? ` ${ov.why.join(' ')}` : ''}` : 'No score could be calculated for this scan.'}</p>
        <ul className="flex flex-wrap gap-2" aria-label="Issues here by severity">{(['critical', 'high', 'medium', 'review'] as Level[]).map((l) => <li key={l} className={`rounded-full px-3 py-1 font-semibold ${LEVELS[l].chip}`}>{count(l)} {LEVELS[l].label}</li>)}</ul>
      </div>
    </details>
  );
}

function Thumb({ it, shot }: { it: BoardItem; shot: Shot }) {
  const pin = it.pin!; const mob = shot.viewport === 'mobile';
  const ww = Math.min(shot.w, Math.max(mob ? 280 : 360, pin.w * 1.8)); const wh = Math.min(shot.h, ww * 0.62);
  const x = Math.min(Math.max(0, pin.x + pin.w / 2 - ww / 2), shot.w - ww); const y = Math.min(Math.max(0, pin.y + pin.h / 2 - wh / 2), shot.h - wh);
  const col = LEVELS[it.level].pin;
  return (
    <div aria-hidden className="relative w-full overflow-hidden rounded-xl border border-black/15 bg-[#f1f0ec] sm:w-44 sm:shrink-0" style={{ aspectRatio: `${ww} / ${wh}` }} data-testid="issue-thumb">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shot.src} alt="" className="absolute max-w-none select-none" style={{ width: `${(shot.w / ww) * 100}%`, left: `-${(x / ww) * 100}%`, top: `-${(y / wh) * 100}%`, height: 'auto' }} />
      <span className="absolute rounded-[3px] border-2" style={{ left: `${((pin.x - x) / ww) * 100}%`, top: `${((pin.y - y) / wh) * 100}%`, width: `${(pin.w / ww) * 100}%`, height: `${(pin.h / wh) * 100}%`, borderColor: col, background: `${col}22` }} />
    </div>
  );
}

function Preview({ shots, items, activeId, onPick, locked }: { shots: Shot[]; items: BoardItem[]; activeId: string | null; onPick: (id: string) => void; locked: boolean }) {
  const have = shots.filter((s) => items.some((i) => i.pin?.viewport === s.viewport));
  const [vp, setVp] = React.useState<ViewportId>(have[0]?.viewport ?? 'desktop');
  const box = React.useRef<HTMLDivElement>(null); const [w, setW] = React.useState(520);
  React.useEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(([e]) => setW(e.contentRect.width)); ro.observe(el); return () => ro.disconnect(); }, [have.length]);
  const active = items.find((i) => i.id === activeId);
  React.useEffect(() => { if (active?.pin && active.pin.viewport !== vp && have.some((s) => s.viewport === active.pin!.viewport)) setVp(active.pin.viewport); }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const shot = shots.find((s) => s.viewport === vp) ?? have[0];
  const scale = shot ? Math.min(shot.viewport !== 'desktop' ? 1.1 : 1, Math.max(0.15, (w - 24) / shot.w)) : 1;
  React.useEffect(() => {
    if (!active?.pin || !shot || active.pin.viewport !== shot.viewport || !box.current) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    box.current.scrollTo({ top: Math.max(0, active.pin.y * scale - 120), behavior: reduce ? 'auto' : 'smooth' });
  }, [activeId, vp, scale]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!shot) return (
    <div className="rounded-2xl border border-dashed border-black/20 bg-white p-5 text-base text-neutral-800" data-testid="preview-empty">
      <p className="font-semibold text-ink">Page preview</p>
      <p className="mt-1">{locked ? 'The screenshot with every issue pinned on it is part of a paid plan.' : 'None of these issues points at one spot on the page, so there is nothing to pin.'}</p>
    </div>);
  const pins = items.filter((i) => i.pin?.viewport === shot.viewport);
  return (
    <section aria-label="Page preview with issue pins" className="flex min-h-0 flex-col rounded-2xl border border-black/10 bg-white p-3" data-testid="preview">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-3">
        <p className="text-base font-semibold text-ink">Page preview <span className="font-normal text-neutral-700">· {pins.length} pinned</span></p>
        {have.length > 1 && (
          <div role="group" aria-label="Preview size" className="inline-flex rounded-full bg-[#f1f0ec] p-1 text-sm font-semibold">
            {have.map((s) => <button key={s.viewport} type="button" aria-pressed={s.viewport === shot.viewport} onClick={() => setVp(s.viewport)} className={`min-h-9 rounded-full px-4 ${s.viewport === shot.viewport ? 'bg-ink text-white' : 'text-ink'}`}>{s.viewport === 'desktop' ? 'Desktop' : `Phone ${s.vw}px`}</button>)}
          </div>)}
      </div>
      <div ref={box} tabIndex={0} role="region" aria-label={`Screenshot at ${shot.vw}px with numbered pins`} className="relative h-[22rem] overflow-auto sm:h-[26rem] rounded-xl bg-[#ece9e2] p-3 lg:h-[calc(100vh-13rem)]">
        <div className="relative mx-auto bg-white shadow" style={{ width: shot.w * scale, height: shot.h * scale }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot.src} alt="" width={shot.w * scale} height={shot.h * scale} className="block select-none" draggable={false} />
          {pins.map((i) => {
            const p = i.pin!; const on = i.id === activeId; const col = LEVELS[i.level].pin;
            return (
              <button key={i.id} type="button" onClick={() => onPick(i.id)} aria-pressed={on} aria-label={`Issue ${i.n}: ${i.title}`}
                className={`absolute rounded-[3px] border-2 ${i.level === 'review' ? 'border-dashed' : ''} ${on ? 'z-20' : 'z-10'}`}
                style={{ left: p.x * scale, top: p.y * scale, width: Math.max(12, p.w * scale), height: Math.max(12, p.h * scale), borderColor: col, background: on ? `${col}33` : `${col}14`, boxShadow: on ? `0 0 0 4px ${col}40` : undefined }}>
                <span aria-hidden className={`absolute -left-3 -top-3 grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs font-bold text-white ring-2 ring-white ${on ? 'scale-125' : ''}`} style={{ background: col }}>{i.n}</span>
              </button>);
          })}
        </div>
      </div>
      <p className="px-1 pt-2 text-sm text-neutral-700">Numbers match the list. Select a pin to jump to its issue{items.some((i) => !i.pin) ? '; issues without a pin affect the whole page or have no single spot' : ''}.</p>
    </section>
  );
}

const STATUS: Record<string, string> = { insufficient: 'Couldn’t score', observation: 'Observation only', not_applicable: 'Not applicable', unknown: 'Not reviewed' };
/** All nine categories by confirmed issues, highest first: score or scoring status, issues, and how many admitted rules were scored here. */
/** Free: the findings after the first fix, as locked rows. The server sent only each row's severity and category; there is no text to reveal. */
function LockedFindings({ summary }: { summary: PageSummary }) {
  const label = new Map(summary.categories.map((c) => [c.code, c.label]));
  const rows = summary.locked; if (!rows.length) return null;
  const groups = [...new Set(rows.map((r) => r.category))].map((c) => ({ c, items: rows.filter((r) => r.category === c) })).sort((a, b) => b.items.length - a.items.length);
  return (
    <section aria-labelledby="locked-h" className="mt-10" data-testid="locked-findings">
      <h2 id="locked-h" className="flex flex-wrap items-center gap-3 text-3xl font-semibold tracking-tight text-ink"><Lock aria-hidden className="size-7 text-[#432099]" />{rows.length} more finding{rows.length === 1 ? '' : 's'}, locked</h2>
      <p className="mt-1 max-w-3xl text-base text-neutral-700">Each one has its exact element, evidence and a complete fix in Creator and Agency. Your first fix above is free.</p>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {groups.map((g) => (
          <div key={g.c || 'other'} className="rounded-[1.5rem] bg-white p-5 ring-1 ring-black/10">
            <p className="text-lg font-semibold text-ink">{label.get(g.c) ?? 'Other'} <span className="font-normal text-neutral-600">· {g.items.length}</span></p>
            <ul className="mt-3 space-y-2" aria-label={`Locked findings in ${label.get(g.c) ?? 'other categories'}`}>
              {g.items.map((r, i) => (
                <li key={i} className="flex items-center gap-3 rounded-xl bg-[#f6f5f1] px-3 py-2.5" data-testid="locked-row">
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-sm font-semibold ${LEVELS[r.level].chip}`}>{LEVELS[r.level].label}</span>
                  <span aria-hidden className="h-3 flex-1 rounded-full bg-neutral-300/80 blur-[3px]" style={{ maxWidth: `${55 + ((i * 37) % 40)}%` }} />
                  <Lock aria-hidden className="size-4 shrink-0 text-neutral-500" /><span className="sr-only">Locked finding</span>
                </li>))}
            </ul>
          </div>))}
      </div>
    </section>
  );
}

function CategorySummary({ summary, onPick, locked }: { summary: PageSummary; onPick: (boardLabel: string) => void; locked: boolean }) {
  return (
    <section aria-labelledby="catsum-h" className="mt-10" data-testid="category-summary">
      <h2 id="catsum-h" className="text-3xl font-semibold tracking-tight text-ink">Categories by confirmed issues</h2>
      <p className="mt-1 max-w-3xl text-base text-neutral-700">Highest first. Each category is scored from its built-in checks; where the evidence is not enough, it says “Couldn’t score” and why.</p>
      <div aria-hidden className="mt-5 hidden grid-cols-[2rem_minmax(0,1fr)_8rem_7rem_7rem] gap-x-3 px-5 pb-2 text-sm font-semibold uppercase tracking-[0.1em] text-neutral-600 sm:grid"><span /><span>Category</span><span className="text-right">Score</span><span className="text-right">Issues</span><span className="text-right">Scored rules</span></div>
      <ol className="mt-2 divide-y divide-black/10 overflow-hidden rounded-[1.5rem] bg-white ring-1 ring-black/10 sm:mt-0">
        {summary.categories.map((c, i) => (
          <li key={c.code} className={`grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-2 p-4 sm:grid-cols-[2rem_minmax(0,1fr)_8rem_7rem_7rem] sm:items-center sm:p-5 ${c.firstFix ? 'bg-[#f3fbd9]' : ''}`} data-testid="catsum-row" data-code={c.code}>
            <span aria-hidden className="pt-0.5 text-lg font-semibold text-neutral-500">{i + 1}</span>
            <div className="min-w-0">
              <p className="text-lg font-semibold text-ink">{c.label}</p>
              {c.status !== 'scored' && <p className="text-sm text-neutral-700 [overflow-wrap:anywhere]" data-testid="catsum-reason">{c.note}</p>}
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-base">
                {locked && (['critical', 'high', 'medium', 'review'] as Level[]).filter((k) => c.severity[k] > 0).map((k) => <span key={k} className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${LEVELS[k].chip}`}>{c.severity[k]} {LEVELS[k].label}</span>)}
                {!locked && c.issues > 0 && <button type="button" onClick={() => onPick(c.boardLabel)} className="font-semibold text-[#5b2fd0] underline underline-offset-4 hover:text-[#432099]">Show {c.label} issues</button>}
                {c.firstFix && <a href="#first-h" className="font-semibold text-[#3b5b00] underline underline-offset-4" data-testid="catsum-first">Fix this first is in this category ↑</a>}
              </div>
            </div>
            <dl className="col-span-2 grid grid-cols-3 gap-2 sm:contents">
              <div className="sm:text-right"><dt className="text-sm text-neutral-600 sm:sr-only">Score</dt><dd className="text-lg font-semibold text-ink" data-testid="catsum-score">{c.score != null ? <>{c.score}<span className="text-neutral-500">/100</span></> : <span className="text-base text-neutral-700">{STATUS[c.status]}</span>}</dd></div>
              <div className="sm:text-right"><dt className="text-sm text-neutral-600 sm:sr-only">Confirmed issues</dt><dd className="text-lg font-semibold text-ink" data-testid="catsum-issues">{c.issues}<span className="hidden text-sm font-normal text-neutral-600 sm:inline"> issue{c.issues === 1 ? '' : 's'}</span></dd></div>
              <div className="sm:text-right"><dt className="text-sm text-neutral-600 sm:sr-only">Scored rules</dt><dd className="text-lg font-semibold text-ink" data-testid="catsum-rules">{c.scoredRules}<span className="hidden text-sm font-normal text-neutral-600 sm:inline"> scored rule{c.scoredRules === 1 ? '' : 's'}</span></dd></div>
            </dl>
          </li>))}
      </ol>
    </section>
  );
}

export function ReviewBoard({ board, primary, lead, items, shots, locked, domain, summary }: { board: Board; primary: React.ReactNode; lead: BoardItem | null; items: BoardItem[]; shots: Shot[]; locked: boolean; domain: string; summary?: PageSummary | null }) {
  const [cat, setCat] = React.useState<string | null>(null); const [lvl, setLvl] = React.useState<Level | null>(null); const [activeId, setActive] = React.useState<string | null>(null);
  const shown = items.filter((i) => (!cat || i.categories.includes(cat)) && (!lvl || i.level === lvl));
  const leadShown = lead && (!cat || lead.categories.includes(cat)) && (!lvl || lead.level === lvl) ? lead : null; const total = shown.length + (leadShown ? 1 : 0);
  const pool = [...(leadShown ? [leadShown] : []), ...shown];
  // In a category the biggest problem leads, even when it is also the first fix above; on "All" the first fix is already the hero of the page, so the next one leads.
  const hero = pool[0] ?? null; const rest = shown.filter((i) => i !== hero); const leadRow = !!leadShown && hero !== leadShown;
  const [heroOpen, setHeroOpen] = React.useState(false); const [open, setOpen] = React.useState<Set<string>>(new Set());
  React.useEffect(() => setHeroOpen(false), [cat, lvl]);
  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const showPreview = !locked && shots.length > 0;
  const ov = board.overall; const t = summary ? summary.severity : board.totals;   // the summary counts every item, also on Free where the items are withheld
  // Every category gets a tab (observation-only ones too), so the per-category counts add up to the All total.
  const tabs = [...board.cats].sort((x, y) => y.critical - x.critical || y.issues - x.issues || (x.score ?? 101) - (y.score ?? 101)); const curCat = board.cats.find((c) => c.label === cat);
  const onTabKey = (e: React.KeyboardEvent) => { const order: (string | null)[] = [null, ...tabs.map((c) => c.label)]; const k = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0; if (!k) return; e.preventDefault(); const nx = order[(order.indexOf(cat) + k + order.length) % order.length]; setCat(nx); document.getElementById(`tab-${nx ?? 'all'}`)?.focus(); };
  const verdict = t.critical ? `${t.critical} critical issue${t.critical === 1 ? '' : 's'} to fix before launch` : t.high ? `${t.high} issue${t.high === 1 ? '' : 's'} to fix before launch` : 'No blocking issues in what was checked';
  const pick = (id: string, fromPin: boolean) => { setActive(id); setOpen((o) => new Set(o).add(id)); if (fromPin) document.getElementById(`issue-${id}`)?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
  const showOn = (id: string) => { setActive(id); if (window.matchMedia('(max-width: 1279px)').matches) document.getElementById('page-preview')?.scrollIntoView({ block: 'start' }); };
  const withPin = [...(lead?.pin ? [lead] : []), ...shown.filter((i) => i.pin)];
  return (
    <>
      <section aria-labelledby="score-h" className="relative mt-8 overflow-hidden rounded-[1.75rem] bg-white p-5 shadow-[0_24px_60px_-40px_rgba(60,30,140,.5)] ring-1 ring-black/10 sm:p-8" data-testid="scorecard">
        <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-[#d9f56e]/60 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-24 -left-10 size-72 rounded-full bg-[#5b2fd0]/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
          <Ring score={summary ? summary.score : ov?.score ?? null} />
          <div className="min-w-0 flex-1">
            <h1 id="score-h" className="text-balance text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">{summary ? (summary.score == null ? <>Page score: <span className="text-neutral-600">couldn’t score</span></> : <>Page score: <span className={band(summary.score).t}>{summary.score}</span><span className="text-neutral-500">/100</span></>) : ov?.score == null ? `Review of ${domain}` : <>Launch readiness: <span className={band(ov.score).t}>{ov.score}</span></>}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-lg font-semibold text-ink"><span data-testid="verdict">{verdict}</span>{!summary && ov?.score != null && ov.status !== 'final' && <span className="rounded-full bg-[#efe9ff] px-3 py-0.5 text-sm text-[#432099]">Provisional</span>}</p>
            <p className="mt-1 max-w-2xl text-base text-neutral-700" data-testid="score-status">{summary ? (summary.score != null ? `${summary.contributing} of ${summary.scorable} categories scored. The page score is their simple average, from built-in checks only (never AI), so it is the same on every plan.` : summary.reason) : !ov ? 'No score could be calculated for this scan.' : ov.score != null ? `Every required check ran. ${ov.coveragePct}% of all checks reached a decision.` : `No score yet: ${ov.assessed} of ${ov.total} categories had every required check run. ${ov.why.join(' ')}`}</p>
            {summary && <dl className="mt-4 grid max-w-xl grid-cols-3 gap-2" data-testid="page-totals">
              <div className="rounded-2xl bg-[#fde7e1] px-4 py-3"><dt className="text-sm font-semibold text-[#7a1f0b]">Confirmed issues</dt><dd className="text-3xl font-semibold leading-tight text-ink" data-testid="total-issues">{summary.issues}</dd></div>
              <div className="rounded-2xl bg-[#efe9ff] px-4 py-3"><dt className="text-sm font-semibold text-[#432099]">Fixes</dt><dd className="text-3xl font-semibold leading-tight text-ink" data-testid="total-fixes">{summary.fixes}</dd></div>
              <div className="rounded-2xl bg-[#f1f0ec] px-4 py-3"><dt className="text-sm font-semibold text-neutral-700">To review</dt><dd className="text-3xl font-semibold leading-tight text-ink">{summary.observations}</dd></div>
            </dl>}
            {summary && summary.fixes !== summary.issues && <p className="mt-2 text-sm text-neutral-700">{summary.issues} confirmed issue{summary.issues === 1 ? '' : 's'}, grouped into {summary.fixes} fix{summary.fixes === 1 ? '' : 'es'}: one change can resolve several.</p>}
            {t.critical + t.high + t.medium + t.review > 0 && <div aria-hidden className="mt-4 flex h-3 max-w-xl gap-0.5 overflow-hidden rounded-full">{(['critical', 'high', 'medium', 'review'] as Level[]).filter((k) => t[k] > 0).map((k) => <span key={k} className="h-full" style={{ flexGrow: t[k], background: LEVELS[k].pin }} />)}</div>}
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Issues by severity">
              {(['critical', 'high', 'medium', 'review'] as Level[]).map((k) => (
                <li key={k}><button type="button" aria-pressed={lvl === k} disabled={t[k] === 0} onClick={() => setLvl(lvl === k ? null : k)} data-testid={`sev-${k}`}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-base font-semibold disabled:opacity-45 ${lvl === k ? 'ring-2 ring-ink ' : ''}${LEVELS[k].chip}`}><span className="text-xl leading-none">{t[k]}</span>{LEVELS[k].label}</button></li>))}
            </ul>
          </div>
        </div>
      </section>

      <div className="mt-6">{primary}</div>

      {summary && <CategorySummary summary={summary} locked={locked} onPick={(label) => { setCat(label); document.getElementById('issues-h')?.scrollIntoView({ block: 'start' }); }} />}
      {locked && summary ? <LockedFindings summary={summary} /> : <>

      <section aria-labelledby="issues-h" className="mt-12" data-testid="others">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="issues-h" className="text-3xl font-semibold tracking-tight text-ink">{board.cats.some((c) => c.score != null) ? 'Scores and issues by category' : 'Issues by category'}</h2>
            <p className="mt-1 text-base text-neutral-700">{board.cats.some((c) => c.score != null) ? 'Pick a category to see its score and only its issues.' : 'Pick a category to see only its issues.'} Each issue says what is wrong, why it matters and where it is.</p>
          </div>
          {lvl && <button type="button" onClick={() => setLvl(null)} className="min-h-11 rounded-full border border-black/25 bg-white px-4 text-base font-semibold text-ink hover:bg-black/5">Clear severity filter</button>}
        </div>
        <div className="mt-5 overflow-hidden rounded-[1.5rem] bg-white ring-1 ring-black/10 md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="border-b border-black/10 p-3 md:border-b-0 md:border-r md:p-4">
          <p className="hidden px-3 pb-2 text-xl font-semibold text-ink md:block">Categories</p>
          <div role="tablist" aria-label="Categories" aria-orientation="vertical" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            <Tab id="tab-all" panel="issues-panel" label="All categories" score={ov?.score ?? null} issues={t.critical + t.high + t.medium + t.review} critical={t.critical} active={cat === null} onClick={() => setCat(null)} onKey={onTabKey} />
            {tabs.map((c) => <Tab key={c.label} id={`tab-${c.label}`} panel="issues-panel" label={c.label} score={c.score} issues={c.issues + c.review} critical={c.critical} active={cat === c.label} onClick={() => setCat(c.label)} onKey={onTabKey} />)}
          </div>
        </div>
        <div role="tabpanel" id="issues-panel" aria-labelledby={`tab-${cat ?? 'all'}`} className="min-w-0 p-5 sm:p-8">
          <CatHeader name={curCat ? curCat.label : 'All categories'} sub={[curCat?.label === 'Mobile' ? `Phone · ${[...new Set(shots.filter((x) => x.viewport !== 'desktop').map((x) => x.vw))].sort((a, b) => b - a).join(' and ') || 390}px wide` : null, `${total} issue${total === 1 ? '' : 's'}${lvl ? ` (${LEVELS[lvl].label} only)` : ''}`].filter(Boolean).join(' · ')}
            score={curCat ? curCat.score : ov?.score ?? null} final={(curCat ? curCat.status : ov?.status) === 'final'} story={story(pool, cat, (curCat ? [curCat] : board.cats).reduce((n, c) => n + c.notRun.length, 0))} unscored={unscoredLine(curCat, ov)} />
          {hero && <Hero it={hero} cat={cat} isLead={hero === lead} open={heroOpen} onToggle={() => setHeroOpen((o) => !o)} />}
          {total === 0 && <p className="mt-8 rounded-2xl bg-[#f3fbd9] p-5 text-lg text-ink" data-testid="cat-empty">{emptyLine(curCat, board.cats, !!lvl)}</p>}
          {(rest.length > 0 || leadRow) && (
            <div className={`mt-10 grid items-start gap-6 ${showPreview ? 'xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]' : ''}`}>
              <div className="min-w-0">
                <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-neutral-600">{hero ? `Also in ${cat ?? 'this review'}` : 'Issues'} · {rest.length + (leadRow ? 1 : 0)}</h4>
                <ol className="mt-3 divide-y divide-black/10 border-y border-black/10" data-testid="issue-list">
                  {leadRow && <li className="flex items-start gap-3 py-4" data-testid="lead-row">
                    <Num it={lead!} />
                    <span className="min-w-0 flex-1"><Chip it={lead!} /><span className="block text-lg font-semibold leading-snug text-ink">{lead!.title}</span>
                      <a href="#first-h" className="mt-1 inline-block text-base font-semibold text-[#5b2fd0] underline underline-offset-4 hover:text-[#432099]">Your first fix, shown at the top ↑</a></span>
                  </li>}
                  {rest.map((i) => { const isOpen = open.has(i.id); const sh = i.pin ? shots.find((x) => x.viewport === i.pin!.viewport) : undefined; return (
                    <li key={i.id} id={`issue-${i.id}`} className={`scroll-mt-24 ${i.id === activeId ? 'bg-[#f6f2ff]' : ''}`}>
                      <button type="button" aria-expanded={isOpen} aria-controls={`body-${i.id}`} onClick={() => toggle(i.id)} className="flex w-full items-start gap-3 py-4 text-left hover:bg-black/[.02]">
                        <Num it={i} />
                        <span className="min-w-0 flex-1"><Chip it={i} /><span className="block text-lg font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{i.title}</span><span className="mt-0.5 block text-base text-neutral-700 [overflow-wrap:anywhere]">{i.where}</span></span>
                        <span aria-hidden className={`mt-1 text-2xl leading-none text-neutral-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}>⌄</span>
                      </button>
                      <div id={`body-${i.id}`} hidden={!isOpen} className="pb-5 pl-10">
                        {(sh || i.pin) && <div className="mb-4 flex flex-wrap items-center gap-3">{sh && <Thumb it={i} shot={sh} />}{i.pin && showPreview && <button type="button" onClick={() => showOn(i.id)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-black/25 px-4 text-base font-semibold text-ink hover:bg-black/5"><MapPin aria-hidden className="size-4" />Show on page</button>}</div>}
                        {i.node}
                      </div>
                    </li>); })}
                </ol>
              </div>
              {showPreview && <div id="page-preview" className="scroll-mt-4 xl:sticky xl:top-4"><Preview shots={shots} items={withPin} activeId={activeId} onPick={(id) => pick(id, true)} locked={locked} /></div>}
            </div>)}
          <WhyNotRun cats={curCat ? [curCat] : board.cats} />
          <ScoreDetails cat={curCat} ov={ov} pool={pool} />
        </div>
        </div>
      </section>
      </>}
    </>
  );
}
