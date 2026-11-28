'use client';
// Saved flows for a project: list, create from JSON, run, and read the last run step by step. All checks happen on the server
// (plan, membership, policy); this component only calls /api/projects/:id/flows and /api/flows/:id.
import * as React from 'react';
import { Button } from '@/components/ui/button.tsx';
import { blockedSummary, compareRuns, plainStep } from '@/packages/flow-engine/insights.ts';
import { Badge, StepList } from './flow-steps.tsx';
import { describeAssertion } from '@/packages/flow-engine/journeys.ts';
import type { Assertion, DiscoveryResult, Journey } from '@/packages/contracts/index.ts';

type Row = { id: string; name: string; version: number; steps: number; startUrl: string; lastRun: { status: string; at: string } | null };
type Proposal = { id: string; flowId: string; kind: string; reason: string };
type Disc = { id: string; status: string; error: string | null; startUrl: string; result: DiscoveryResult | null; saved: Record<string, { flowId: string; name: string }> };
type Cond = { a: Assertion; keep: boolean };
type CmpSide = { status: string; failedStep: string | null; failure: string | null; inconclusive: string | null };
type CmpRun = { id: string; status: string; error: string | null; result: { steps: Step[] } | null } | null;
type Cmp = { id: string; version: number; status: string; verdict: string | null; detail: { headline: string; detail: string; published: CmpSide; preview: CmpSide } | null; publishedOrigin: string; previewOrigin: string; published: CmpRun; preview: CmpRun };
const PURPOSE: Record<string, string> = { booking: 'Booking', signup: 'Sign-up', pricing: 'Pricing', contact: 'Contact', login: 'Sign-in page (opened, never signed in)', other: 'Page' };
type Step = { stepId: string; action: string; status: string; ms: number; urlAfter: string | null; error: string | null; assertions: { passed: boolean; observed: string; assertion: { type: string } }[] };
type Run = { id: string; version?: number; status: string; error: string | null; startedAt: string; result: { attempts?: number; flaky?: boolean; steps: Step[]; consoleErrors: string[]; failedRequests: { url: string; status: number | null }[]; ms: number } | null };

const EXAMPLE = JSON.stringify({ name: 'Open the pricing page', startUrl: 'https://example.com/', steps: [{ id: 'pricing', action: 'click', selector: 'a[href="/pricing"]', expect: [{ type: 'url_contains', value: '/pricing' }, { type: 'visible', selector: 'h1' }] }] }, null, 2);

export function FlowsPanel({ projectId, canDelete, initial, initialProposals = [], siteUrl = null, canCompare = false }: { projectId: string; canDelete: boolean; initial: Row[]; initialProposals?: Proposal[]; siteUrl?: string | null; canCompare?: boolean }) {
  const [cmp, setCmp] = React.useState<Record<string, Cmp | undefined>>({}); const [cmpBusy, setCmpBusy] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState(initial); const [proposals, setProposals] = React.useState<Proposal[]>(initialProposals);
  const [disc, setDisc] = React.useState<Disc | null>(null); const [finding, setFinding] = React.useState(false); const [conds, setConds] = React.useState<Record<string, Cond[]>>({}); const [extra, setExtra] = React.useState<Record<string, string>>({}); const [jname, setJname] = React.useState<Record<string, string>>({});
  const [json, setJson] = React.useState(EXAMPLE); const [msg, setMsg] = React.useState<string | null>(null); const [busy, setBusy] = React.useState<string | null>(null);
  const [runs, setRuns] = React.useState<Record<string, Run | undefined>>({}); const [prev, setPrev] = React.useState<Record<string, Run | undefined>>({}); const [open, setOpen] = React.useState<string | null>(null);
  // the newest run, and the finished run before it, which a before/after comparison needs
  // only runs of the same approved version are compared: a new version starts a fresh baseline
  function take(id: string, list: Run[] | undefined) { const latest = list?.[0]; if (latest) setRuns((x) => ({ ...x, [id]: latest })); setPrev((x) => ({ ...x, [id]: list?.slice(1).find((r) => r.result && (r.status === 'passed' || r.status === 'failed' || r.status === 'blocked') && (r.version ?? 1) === (latest?.version ?? 1)) })); }

  async function api(method: string, path: string, body?: unknown) {
    const r = await fetch(path, { method, headers: { 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { ok: r.ok, status: r.status, data: (await r.json().catch(() => null)) as Record<string, any> | null };
  }
  async function reload() { const r = await api('GET', `/api/projects/${projectId}/flows`); if (r.ok) { setProposals((r.data!.proposals as Proposal[]) ?? []); setRows((r.data!.flows as any[]).map((f) => ({ id: f.id, name: f.name, version: f.version ?? 1, steps: f.definition?.steps?.length ?? 0, startUrl: f.definition?.startUrl ?? '', lastRun: f.lastRun ? { status: f.lastRun.status, at: f.lastRun.startedAt } : null }))); } }

  // ---- journey discovery: find candidate journeys from the site's address, let the owner say what success means, save them as flows ----
  const seed = (d: Disc) => { const c: Record<string, Cond[]> = {}; for (const j of d.result?.journeys ?? []) c[j.id] = ((j.steps[j.steps.length - 1] as { expect?: Assertion[] }).expect ?? []).map((a) => ({ a, keep: true })); setConds((x) => ({ ...c, ...x })); };
  React.useEffect(() => { let off = false; (async () => { const g = await api('GET', `/api/projects/${projectId}/discoveries`); const d = g.data?.discovery as Disc | null | undefined; if (!off && d?.status === 'done') { setDisc(d); seed(d); } })(); return () => { off = true; }; }, [projectId]);   // eslint-disable-line react-hooks/exhaustive-deps
  async function findJourneys() {
    setMsg(null); setFinding(true); const r = await api('POST', `/api/projects/${projectId}/discoveries`, {}); if (!r.ok) { setFinding(false); setMsg(r.data?.message ?? 'Could not start.'); return; }
    for (let i = 0; i < 80; i++) { const g = await api('GET', `/api/discoveries/${r.data!.id}`); const d = g.data?.discovery as Disc | undefined; if (d && d.status !== 'running') { setDisc(d); if (d.status === 'done') seed(d); else setMsg(d.error ?? 'Looking for journeys did not complete.'); break; } await new Promise((res) => setTimeout(res, 1500)); }
    setFinding(false); await reload();
  }
  async function saveJourney(j: Journey) {
    if (!disc) return; const keep = (conds[j.id] ?? []).filter((c) => c.keep).map((c) => c.a); const add = (extra[j.id] ?? '').trim(); if (add) keep.push({ type: 'text_contains', text: add });
    setBusy(`j-${j.id}`); const r = await api('POST', `/api/discoveries/${disc.id}/accept`, { journeyId: j.id, name: (jname[j.id] ?? '').trim() || undefined, success: keep.length ? keep : undefined }); setBusy(null);
    if (!r.ok) { setMsg(r.data?.message ?? 'Could not save this journey.'); return; }
    setMsg('Saved.'); const g = await api('GET', `/api/discoveries/${disc.id}`); if (g.ok) setDisc(g.data!.discovery as Disc); await reload();
  }
  async function decide(p: Proposal, decision: 'accept' | 'dismiss') { setBusy(`p-${p.id}`); const r = await api('POST', `/api/proposals/${p.id}`, { decision }); setBusy(null); setMsg(r.ok ? (decision === 'accept' ? 'The change was approved as a new version.' : 'The change was dismissed. The approved flow is unchanged.') : (r.data?.message ?? 'Could not apply that.')); await reload(); }

  // ---- compare the same approved version on the published site and on the preview (manual) ----
  async function loadCmp(id: string) { const g = await api('GET', `/api/flows/${id}/comparisons`); const c = (g.data?.comparisons as Cmp[] | undefined)?.[0]; if (c) setCmp((x) => ({ ...x, [id]: c })); return c; }
  async function compare(id: string) {
    setMsg(null); setCmpBusy(id); const r = await api('POST', `/api/flows/${id}/comparisons`); if (!r.ok) { setCmpBusy(null); setMsg(r.data?.message ?? 'Could not start the comparison.'); return; }
    for (let i = 0; i < 160; i++) { const c = await loadCmp(id); if (c && c.id === r.data!.id && c.status === 'done') break; await new Promise((res) => setTimeout(res, 1500)); }
    setCmpBusy(null);
  }
  async function create() {
    setMsg(null); let body: unknown; try { body = JSON.parse(json); } catch { setMsg('That is not valid JSON.'); return; }
    setBusy('create'); const r = await api('POST', `/api/projects/${projectId}/flows`, body); setBusy(null);
    if (!r.ok) { setMsg(r.data?.message ?? 'The flow could not be saved.'); return; }
    setMsg('Saved.'); await reload();
  }
  async function run(id: string) {
    setMsg(null); setBusy(id); const r = await api('POST', `/api/flows/${id}/runs`); if (!r.ok) { setBusy(null); setMsg(r.data?.message ?? 'The run could not start.'); return; }
    setOpen(id);
    for (let i = 0; i < 120; i++) {
      const g = await api('GET', `/api/flows/${id}/runs`); const list = g.data?.runs as Run[] | undefined; const latest = list?.[0]; take(id, list);
      if (latest && latest.status !== 'running') break; await new Promise((res) => setTimeout(res, 1500));
    }
    setBusy(null); await reload();
  }
  async function remove(id: string) { if (!confirm('Delete this flow and its run history?')) return; const r = await api('DELETE', `/api/flows/${id}`); if (!r.ok) setMsg(r.data?.message ?? 'Could not delete.'); await reload(); }
  async function show(id: string) { if (open === id) { setOpen(null); return; } setOpen(id); if (canCompare) void loadCmp(id); const g = await api('GET', `/api/flows/${id}/runs`); take(id, g.data?.runs as Run[] | undefined); }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <section aria-labelledby="flows-h" className="min-w-0">
        <h2 id="flows-h" className="mb-3 text-lg font-semibold text-ink">Your flows</h2>
        {rows.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-slate-600">No flows yet. Paste one on the right to start.</p>}
        <ul className="space-y-3">
          {rows.map((f) => { const r = runs[f.id]; return (
            <li key={f.id} data-testid="flow-row" className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0"><p className="truncate font-semibold text-ink">{f.name}{f.version > 1 && <span data-testid="flow-version" className="ml-2 text-xs font-normal text-slate-600">version {f.version}</span>}</p><p className="truncate text-sm text-slate-600" title={f.startUrl}>{f.steps} step{f.steps === 1 ? '' : 's'} · {f.startUrl}</p></div>
                <div className="flex items-center gap-2">{f.lastRun && <Badge s={f.lastRun.status} />}
                  <Button size="sm" variant="outline" onClick={() => show(f.id)} aria-expanded={open === f.id}>{open === f.id ? 'Hide result' : 'Last result'}</Button>
                  <Button size="sm" disabled={busy === f.id} onClick={() => run(f.id)}>{busy === f.id ? 'Running…' : 'Run'}</Button>
                  {canCompare && <Button size="sm" variant="outline" disabled={cmpBusy === f.id} onClick={() => compare(f.id)}>{cmpBusy === f.id ? 'Comparing…' : 'Compare preview with published'}</Button>}
                  {canDelete && <Button size="sm" variant="ghost" onClick={() => remove(f.id)} aria-label={`Delete ${f.name}`}>Delete</Button>}</div>
              </div>
              {proposals.filter((p) => p.flowId === f.id).map((p) => <div key={p.id} data-testid="flow-proposal" data-kind={p.kind} className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><p className="font-semibold">{p.kind === 'changed' ? 'Your site changed: review the proposed change' : 'This journey was not found on your site'}</p><p className="mt-1">{p.reason}</p><p className="mt-1">Your approved flow (version {f.version}) keeps running until you accept a change.</p><div className="mt-2 flex gap-2">{p.kind === 'changed' && <Button size="sm" disabled={busy === `p-${p.id}`} onClick={() => decide(p, 'accept')}>Approve as version {f.version + 1}</Button>}<Button size="sm" variant="outline" disabled={busy === `p-${p.id}`} onClick={() => decide(p, 'dismiss')}>Keep the approved flow</Button></div></div>)}
              {cmp[f.id]?.status === 'done' && cmp[f.id]!.detail && (() => { const c = cmp[f.id]!; const d = c.detail!; const tone = c.verdict === 'preview_regression' ? 'bg-red-50 text-red-900' : c.verdict === 'passed_both' ? 'bg-emerald-50 text-emerald-900' : c.verdict === 'inconclusive' ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-800';
                return <div data-testid="env-compare" data-verdict={c.verdict} className="mt-3 rounded-lg border border-slate-200 p-3 text-sm">
                  <div className={`rounded-lg p-3 ${tone}`}><p className="font-semibold">Published vs preview, version {c.version}: {d.headline}</p><p className="mt-1">{d.detail}</p></div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">{(['published', 'preview'] as const).map((env) => { const run = c[env]; const sd = d[env]; return (
                    <div key={env} data-testid={`env-${env}`} data-status={sd.status} className="min-w-0 rounded-lg border border-slate-200 p-3">
                      <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">{env === 'published' ? 'Published' : 'Preview'}<Badge s={run?.status ?? 'error'} /></p><p className="break-all text-xs text-slate-600">{env === 'published' ? c.publishedOrigin : c.previewOrigin}</p>
                      {sd.inconclusive && <p data-testid="env-inconclusive" className="mt-2 rounded-lg bg-amber-50 p-2 text-amber-900">Not usable as evidence: {sd.inconclusive}</p>}
                      {run?.result ? <div className="mt-2"><StepList steps={run.result.steps} /></div> : <p className="mt-2 text-slate-600">{run?.error ?? 'No result.'}</p>}
                    </div>); })}</div>
                </div>; })()}
              {open === f.id && <div className="mt-4 border-t border-slate-200 pt-3" data-testid="flow-result">
                {!r ? <p className="text-sm text-slate-600">No runs yet.</p> : <>
                  <p className="mb-2 flex items-center gap-2 text-sm text-slate-700"><Badge s={r.status} /><span data-testid="run-version" className="text-slate-600">version {r.version ?? 1}</span>{r.result ? `${(r.result.ms / 1000).toFixed(1)} s` : ''}{r.error ? ` ${r.error}` : ''}</p>
                  {r.result?.flaky && <p data-testid="flaky" className="mb-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This flow did not give the same answer twice, so Avara ran it again. {r.status === 'passed' ? 'It passed on the second try, which means it works sometimes. Treat it as unreliable.' : 'It failed at a different step each time, so the cause is unclear.'}</p>}
                  {r.status === 'blocked' && r.result && (() => { const b = blockedSummary(r.result as never); return b ? <div data-testid="flow-unverified" className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><p className="font-semibold">Could not verify this flow</p><p className="mt-1">{b.sentence}</p>{b.notChecked > 0 && <p className="mt-1">{b.notChecked} later step{b.notChecked === 1 ? '' : 's'} not checked. Check this part by hand, or on a copy of your site.</p>}</div> : null; })()}
                  {r.result && !prev[f.id]?.result && r.status !== 'running' && <p data-testid="flow-first-run" className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-800">This is the first run of version {r.version ?? 1}, so there is no earlier run of this version to compare it with.</p>}
                  {r.result && prev[f.id]?.result && r.status !== 'running' && (() => { const c = compareRuns(prev[f.id]!.result as never, r.result as never); return <div data-testid="flow-compare" data-result={c.result} className={`mb-3 rounded-lg p-3 text-sm ${c.result === 'regressed' ? 'bg-red-50 text-red-900' : c.result === 'fixed' || c.result === 'now_verified' ? 'bg-emerald-50 text-emerald-900' : c.result.startsWith('could_not_verify') ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-800'}`}><p className="font-semibold">Compared with the run before</p><p className="mt-1">{c.result === 'could_not_verify' ? 'No regression or recovery can be reported, because the flow did not run to the end.' : c.summary}</p>{c.newConsoleErrors.length > 0 && <p className="mt-1">{c.newConsoleErrors.length} new error(s) on the page.</p>}{c.newFailedRequests.length > 0 && <p className="mt-1">{c.newFailedRequests.length} new request(s) failed.</p>}</div>; })()}
                  <StepList steps={r.result?.steps ?? []} />
                  {!!r.result?.consoleErrors.length && <p className="mt-2 text-sm text-slate-600">{r.result.consoleErrors.length} console error(s) on the page.</p>}
                </>}
              </div>}
            </li>); })}
        </ul>
      </section>
      <div className="min-w-0 space-y-6">
      <section aria-labelledby="disc-h" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
        <h2 id="disc-h" className="text-lg font-semibold text-ink">Find journeys on your site</h2>
        <p className="mt-1 text-sm text-slate-600">Avara follows the public links on {siteUrl ? <span className="break-all font-medium">{siteUrl}</span> : 'your site'} (same site only, nothing submitted, nothing signed in) and suggests short journeys, like booking a call. You decide what counts as success, and Avara checks it.</p>
        <div className="mt-3"><Button onClick={findJourneys} disabled={finding || !siteUrl}>{finding ? 'Looking…' : disc ? 'Look again' : 'Find journeys'}</Button>{!siteUrl && <span className="ml-3 text-sm text-slate-600">Add your live address to the project first.</span>}</div>
        {disc?.status === 'done' && disc.result && <div data-testid="discovery" className="mt-4 space-y-4">
          <p className="text-sm text-slate-600">Looked at {disc.result.pagesVisited} page{disc.result.pagesVisited === 1 ? '' : 's'}; found {disc.result.journeys.length} journey{disc.result.journeys.length === 1 ? '' : 's'}.{disc.result.limits.length > 0 && ` Stopped at the ${disc.result.limits.join(' and ')}.`}</p>
          {disc.result.journeys.map((j) => { const saved = disc.saved[j.key]; const cs = conds[j.id] ?? []; return (
            <div key={j.id} data-testid="journey" data-purpose={j.purpose} className="rounded-lg border border-slate-200 p-3">
              <p className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">{PURPOSE[j.purpose]}</span><span className="font-semibold text-ink">{j.title}</span></p>
              <ol className="mt-2 list-decimal pl-5 text-sm text-slate-800">{j.observed.map((o, i) => <li key={i}>{o}</li>)}</ol>
              {saved ? <p className="mt-2 text-sm text-emerald-900">Saved as “{saved.name}”.</p> : <>
                <p className="mt-3 text-sm font-medium text-ink">What counts as success? Untick or edit anything that is wrong.</p>
                <ul className="mt-1 space-y-1">{cs.map((c, i) => <li key={i} className="flex items-start gap-2 text-sm"><input type="checkbox" aria-label={describeAssertion(c.a)} checked={c.keep} onChange={(e) => setConds((x) => ({ ...x, [j.id]: cs.map((y, k) => (k === i ? { ...y, keep: e.target.checked } : y)) }))} className="mt-1" />
                  {c.a.type === 'text_contains' ? <label className="flex-1">The page says <input value={c.a.text} onChange={(e) => setConds((x) => ({ ...x, [j.id]: cs.map((y, k) => (k === i ? { ...y, a: { type: 'text_contains', text: e.target.value } } : y)) }))} className="ml-1 w-56 max-w-full rounded border border-slate-300 px-1.5 py-0.5" /></label> : <span className="flex-1">{describeAssertion(c.a)}</span>}</li>)}</ul>
                <label className="mt-2 block text-sm">Also, the page says <input value={extra[j.id] ?? ''} onChange={(e) => setExtra((x) => ({ ...x, [j.id]: e.target.value }))} placeholder="for example: Booking confirmed" className="ml-1 w-56 max-w-full rounded border border-slate-300 px-1.5 py-0.5" /></label>
                <label className="mt-2 block text-sm">Name <input value={jname[j.id] ?? j.title} onChange={(e) => setJname((x) => ({ ...x, [j.id]: e.target.value }))} className="ml-1 w-64 max-w-full rounded border border-slate-300 px-1.5 py-0.5" /></label>
                <div className="mt-3"><Button size="sm" disabled={busy === `j-${j.id}`} onClick={() => saveJourney(j)}>{busy === `j-${j.id}` ? 'Saving…' : 'Save as flow'}</Button></div></>}
            </div>); })}
        </div>}
      </section>
      <section aria-labelledby="new-h" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
        <h2 id="new-h" className="text-lg font-semibold text-ink">New flow</h2>
        <p className="mt-1 text-sm text-slate-600">Steps are open, click, fill, press and wait. A flow never signs in, submits forms, buys, deletes or leaves your site. If a safety rule stops a flow, Avara shows which steps passed and what still needs checking.</p>
        <label className="mt-3 block text-sm font-medium text-ink" htmlFor="flow-json">Flow (JSON)</label>
        <textarea id="flow-json" value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} rows={14} className="mt-1 w-full rounded-lg border border-slate-300 p-3 font-mono text-xs text-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-pine-600" />
        <div className="mt-3 flex items-center gap-3"><Button onClick={create} disabled={busy === 'create'}>{busy === 'create' ? 'Saving…' : 'Save flow'}</Button><Button variant="ghost" onClick={() => setJson(EXAMPLE)}>Reset example</Button></div>
        {msg && <p role="status" className="mt-3 text-sm text-slate-800">{msg}</p>}
      </section>
      </div>
    </div>
  );
}
