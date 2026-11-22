'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CopyButton } from '@/components/CopyButton.tsx';

type Early = { title: string; summary: string; evidence: string[]; plainChange: string; prompts: Record<string, string>; shotUrl: string | null; viewport: { width: number } };
const BUILDERS: [string, string][] = [['lovable', 'Lovable'], ['bolt', 'Bolt'], ['v0', 'v0'], ['cursor', 'Cursor']];

type Stage = 'loaded' | 'action' | 'screenshots' | 'rules' | 'keyboard' | 'done';
type Stages = { desktop: Stage[]; mobile: Stage[]; performance?: 'running' | 'done' | 'skipped' };
const SCREEN_STEPS: [Stage, string][] = [['loaded', 'Open the page'], ['action', 'Check the main button'], ['screenshots', 'Take screenshots'], ['rules', 'Run accessibility rules'], ['keyboard', 'Press Tab through the page']];

export function ScanProgress({ id, url }: { id: string; url: string }) {
  const router = useRouter();
  const [st, setSt] = React.useState<{ status: string; progress?: { step: string; percent: number; stages?: Stages } | null; error?: { message: string } | null; early?: Early | null }>({ status: 'queued' });
  const [t0] = React.useState(() => Date.now()); const [now, setNow] = React.useState(t0);
  React.useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  React.useEffect(() => {
    let t: ReturnType<typeof setTimeout>; let live = true;
    const poll = async () => {
      const r = await fetch(`/api/scans/${id}`).then((x) => x.json()).catch(() => null);
      if (!live) return;
      if (r) { setSt(r); if (r.status === 'completed' || r.status === 'failed') { router.refresh(); return; } }
      t = setTimeout(poll, 1200);
    };
    poll(); return () => { live = false; clearTimeout(t); };
  }, [id, router]);
  const pct = Math.max(2, Math.min(100, st.progress?.percent ?? 2)); const stg = st.progress?.stages; const secs = Math.round((now - t0) / 1000);
  const after = pct >= 80; const step = st.status === 'queued' ? 'Waiting for a free scanner…' : st.progress?.step || 'Starting the browser…';
  const later: [string, boolean, boolean][] = [
    ['Measure loading speed on a phone', stg?.performance === 'done' || pct >= 92, pct >= 84 && pct < 92],
    ['Group findings and write fixes', pct >= 97, pct >= 92 && pct < 97],
    ['Save your report', st.status === 'completed', pct >= 97],
  ];
  return (
    <main id="main" className="px-5 pb-20 pt-10 sm:px-10 sm:pt-16">
      <style>{`@keyframes av-stripes{to{background-position:40px 0}}@keyframes av-beam{0%{top:0}100%{top:calc(100% - 3px)}}
        .av-bar{background-image:linear-gradient(45deg,rgba(255,255,255,.22) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.22) 50%,rgba(255,255,255,.22) 75%,transparent 75%);background-size:40px 40px;animation:av-stripes 1s linear infinite}
        .av-beam{animation:av-beam 1.6s ease-in-out infinite alternate}
        @media (prefers-reduced-motion:reduce){.av-bar,.av-beam{animation:none}}`}</style>
      <div className="mx-auto max-w-3xl rounded-[2rem] bg-[#e6f9b6] p-6 sm:p-10">
        <h1 className="text-center text-4xl font-semibold tracking-[-0.03em] text-ink sm:text-5xl">Reviewing your site</h1>
        <p className="mt-2 break-all text-center text-lg text-neutral-800">{url}</p>
        <div className="mt-8 flex items-end justify-between gap-4">
          <p role="status" aria-live="polite" className="text-xl font-semibold text-ink" data-testid="scan-step">{step}</p>
          <p className="shrink-0 text-right"><span className="text-4xl font-semibold tabular-nums text-ink" data-testid="scan-pct">{pct}%</span><span className="block text-sm tabular-nums text-neutral-700">{secs}s elapsed</span></p>
        </div>
        <div className="mt-3 h-4 overflow-hidden rounded-full bg-white" role="progressbar" aria-label="Scan progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="av-bar h-full rounded-full bg-ink transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Screen name="Desktop" width={1280} done={stg?.desktop ?? []} active={!after && st.status !== 'queued'} phone={false} />
          <Screen name="Phone" width={390} done={stg?.mobile ?? []} active={!after && st.status !== 'queued'} phone />
        </div>
        <ol className="mt-5 space-y-2 rounded-2xl bg-white/70 p-4 text-base" aria-label="After both screens">
          {later.map(([label, done, now]) => <Check key={label} label={label} state={done ? 'done' : now ? 'now' : 'todo'} />)}
        </ol>
        <p className="mt-5 text-center text-sm text-neutral-800">Nothing is clicked or submitted on your page. If we find something that blocks your main button, it shows up below straight away.</p>
      </div>
      {st.early && <EarlyBlocker b={st.early} />}
    </main>
  );
}

function Check({ label, state }: { label: string; state: 'done' | 'now' | 'todo' }) {
  return (
    <li className="flex items-center gap-2.5" data-state={state}>
      <span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${state === 'done' ? 'bg-ink text-[#d9f56e]' : state === 'now' ? 'border-2 border-ink' : 'border-2 border-black/20'}`}>{state === 'done' ? '✓' : state === 'now' ? <span className="size-2 animate-pulse rounded-full bg-ink motion-reduce:animate-none" /> : null}</span>
      <span className={state === 'todo' ? 'text-neutral-600' : 'text-ink'}>{label}<span className="sr-only">{state === 'done' ? ' (done)' : state === 'now' ? ' (in progress)' : ' (to do)'}</span></span>
    </li>
  );
}

/** One screen size: a small device outline with a scanning line while it is being checked, and its own checklist. */
function Screen({ name, width, done, active, phone }: { name: string; width: number; done: Stage[]; active: boolean; phone: boolean }) {
  const finished = done.includes('done'); const next = SCREEN_STEPS.find(([k]) => !done.includes(k))?.[0];
  return (
    <section className="flex gap-3 rounded-2xl bg-white/70 p-4 sm:gap-4" aria-label={`${name}, ${width}px wide`}>
      <div aria-hidden className={`relative shrink-0 overflow-hidden rounded-lg border-2 border-ink bg-white ${phone ? 'h-16 w-9 sm:h-28 sm:w-14' : 'h-12 w-16 sm:h-20 sm:w-28'}`}>
        <div className="m-1.5 h-1.5 w-2/3 rounded bg-black/15" /><div className="mx-1.5 h-1 w-1/2 rounded bg-black/10" /><div className="mx-1.5 mt-1.5 h-3 w-1/3 rounded bg-black/25" />
        {active && !finished && <div className="av-beam absolute inset-x-0 h-[3px] bg-[#5b2fd0] shadow-[0_0_10px_#5b2fd0]" />}
        {finished && <div className="absolute inset-0 grid place-items-center bg-[#d9f56e]/85 text-2xl font-bold text-ink">✓</div>}
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-ink">{name} <span className="font-normal text-neutral-700">· {width}px</span></p>
        <ol className="mt-1.5 space-y-1 text-sm">{SCREEN_STEPS.map(([k, l]) => <Check key={k} label={l} state={done.includes(k) ? 'done' : active && k === next ? 'now' : 'todo'} />)}</ol>
      </div>
    </section>
  );
}

/** A blocker the scan has already confirmed, with its evidence and fix, shown while the rest of the scan runs. */
function EarlyBlocker({ b }: { b: Early }) {
  const tools = BUILDERS.filter(([k]) => b.prompts[k]); const [tool, setTool] = React.useState(tools[0]?.[0] ?? 'lovable');
  return (
    <section aria-labelledby="early-h" data-testid="early-blocker" className="mx-auto mt-6 max-w-2xl rounded-[2rem] bg-white p-6 ring-2 ring-[#c2310f] sm:p-8">
      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold"><span className="rounded-full bg-[#c2310f] px-3 py-0.5 text-white">Blocks the main action</span><span className="text-neutral-700">Found while scanning · phone, {b.viewport.width}px wide</span></p>
      <h2 id="early-h" className="mt-3 text-2xl font-semibold leading-snug tracking-tight text-ink sm:text-3xl">{b.title}</h2>
      <p className="mt-2 text-lg text-neutral-800">{b.summary}</p>
      {b.shotUrl && <img src={b.shotUrl} alt={`Phone screen at ${b.viewport.width}px wide, as measured: ${b.summary}`} className="mt-4 max-h-[28rem] w-auto rounded-xl ring-1 ring-black/10" />}
      <h3 className="mt-5 text-base font-semibold text-ink">Evidence</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-base text-neutral-800 [overflow-wrap:anywhere]" data-testid="early-evidence">{b.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
      <h3 className="mt-5 text-base font-semibold text-ink">What to change</h3>
      <p className="mt-1 text-base text-neutral-800">{b.plainChange}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="text-base font-semibold text-ink" htmlFor="early-tool">Builder</label>
        <select id="early-tool" value={tool} onChange={(e) => setTool(e.target.value)} className="min-h-11 rounded-xl border border-black/20 bg-white px-3 text-base">{tools.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <CopyButton text={b.prompts[tool] ?? ''} label="Copy fix" />
      </div>
      <p className="mt-4 text-sm text-neutral-700">The full report is still being built. It confirms this finding and lists everything else.</p>
    </section>
  );
}
