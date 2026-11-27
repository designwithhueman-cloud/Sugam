'use client';
// Saved flows for a project: list, create from JSON, run, and read the last run step by step. All checks happen on the server
// (plan, membership, policy); this component only calls /api/projects/:id/flows and /api/flows/:id.
import * as React from 'react';
import { Button } from '@/components/ui/button.tsx';

type Row = { id: string; name: string; steps: number; startUrl: string; lastRun: { status: string; at: string } | null };
type Step = { stepId: string; action: string; status: string; ms: number; urlAfter: string | null; error: string | null; assertions: { passed: boolean; observed: string; assertion: { type: string } }[] };
type Run = { id: string; status: string; error: string | null; startedAt: string; result: { steps: Step[]; consoleErrors: string[]; failedRequests: { url: string; status: number | null }[]; ms: number } | null };

const EXAMPLE = JSON.stringify({ name: 'Open the pricing page', startUrl: 'https://example.com/', steps: [{ id: 'pricing', action: 'click', selector: 'a[href="/pricing"]', expect: [{ type: 'url_contains', value: '/pricing' }, { type: 'visible', selector: 'h1' }] }] }, null, 2);
const LABEL: Record<string, string> = { passed: 'Passed', failed: 'Failed', blocked: 'Blocked by safety rules', error: 'Could not run', running: 'Running', skipped: 'Skipped' };
const TONE: Record<string, string> = { passed: 'bg-emerald-50 text-emerald-900', failed: 'bg-red-50 text-red-900', blocked: 'bg-amber-50 text-amber-900', error: 'bg-slate-100 text-slate-800', running: 'bg-blue-50 text-blue-900', skipped: 'bg-slate-100 text-slate-600' };
const Badge = ({ s }: { s: string }) => <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[s] ?? TONE.error}`}>{LABEL[s] ?? s}</span>;

export function FlowsPanel({ projectId, canDelete, initial }: { projectId: string; canDelete: boolean; initial: Row[] }) {
  const [rows, setRows] = React.useState(initial);
  const [json, setJson] = React.useState(EXAMPLE); const [msg, setMsg] = React.useState<string | null>(null); const [busy, setBusy] = React.useState<string | null>(null);
  const [runs, setRuns] = React.useState<Record<string, Run | undefined>>({}); const [open, setOpen] = React.useState<string | null>(null);

  async function api(method: string, path: string, body?: unknown) {
    const r = await fetch(path, { method, headers: { 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { ok: r.ok, status: r.status, data: (await r.json().catch(() => null)) as Record<string, any> | null };
  }
  async function reload() { const r = await api('GET', `/api/projects/${projectId}/flows`); if (r.ok) setRows((r.data!.flows as any[]).map((f) => ({ id: f.id, name: f.name, steps: f.definition?.steps?.length ?? 0, startUrl: f.definition?.startUrl ?? '', lastRun: f.lastRun ? { status: f.lastRun.status, at: f.lastRun.startedAt } : null }))); }
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
      const g = await api('GET', `/api/flows/${id}/runs`); const latest = (g.data?.runs as Run[] | undefined)?.[0]; if (latest) setRuns((x) => ({ ...x, [id]: latest }));
      if (latest && latest.status !== 'running') break; await new Promise((res) => setTimeout(res, 1500));
    }
    setBusy(null); await reload();
  }
  async function remove(id: string) { if (!confirm('Delete this flow and its run history?')) return; const r = await api('DELETE', `/api/flows/${id}`); if (!r.ok) setMsg(r.data?.message ?? 'Could not delete.'); await reload(); }
  async function show(id: string) { if (open === id) { setOpen(null); return; } setOpen(id); const g = await api('GET', `/api/flows/${id}/runs`); const latest = (g.data?.runs as Run[] | undefined)?.[0]; if (latest) setRuns((x) => ({ ...x, [id]: latest })); }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <section aria-labelledby="flows-h" className="min-w-0">
        <h2 id="flows-h" className="mb-3 text-lg font-semibold text-ink">Your flows</h2>
        {rows.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-slate-600">No flows yet. Paste one on the right to start.</p>}
        <ul className="space-y-3">
          {rows.map((f) => { const r = runs[f.id]; return (
            <li key={f.id} data-testid="flow-row" className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0"><p className="truncate font-semibold text-ink">{f.name}</p><p className="truncate text-sm text-slate-600" title={f.startUrl}>{f.steps} step{f.steps === 1 ? '' : 's'} · {f.startUrl}</p></div>
                <div className="flex items-center gap-2">{f.lastRun && <Badge s={f.lastRun.status} />}
                  <Button size="sm" variant="outline" onClick={() => show(f.id)} aria-expanded={open === f.id}>{open === f.id ? 'Hide result' : 'Last result'}</Button>
                  <Button size="sm" disabled={busy === f.id} onClick={() => run(f.id)}>{busy === f.id ? 'Running…' : 'Run'}</Button>
                  {canDelete && <Button size="sm" variant="ghost" onClick={() => remove(f.id)} aria-label={`Delete ${f.name}`}>Delete</Button>}</div>
              </div>
              {open === f.id && <div className="mt-4 border-t border-slate-200 pt-3" data-testid="flow-result">
                {!r ? <p className="text-sm text-slate-600">No runs yet.</p> : <>
                  <p className="mb-2 flex items-center gap-2 text-sm text-slate-700"><Badge s={r.status} />{r.result ? `${(r.result.ms / 1000).toFixed(1)} s` : ''}{r.error ? ` ${r.error}` : ''}</p>
                  <ol className="space-y-2">{r.result?.steps.map((s) => <li key={s.stepId} className="rounded-lg bg-slate-50 p-3 text-sm"><div className="flex items-center justify-between gap-2"><span className="font-medium text-ink">{s.stepId} <span className="font-normal text-slate-600">({s.action})</span></span><Badge s={s.status} /></div>
                    {s.error && <p className="mt-1 text-slate-800">{s.error}</p>}
                    {s.assertions.map((a, i) => <p key={i} className="mt-1 text-slate-600">{a.passed ? '✓' : '✗'} {a.assertion.type.replace('_', ' ')}: {a.observed}</p>)}</li>)}</ol>
                  {!!r.result?.consoleErrors.length && <p className="mt-2 text-sm text-slate-600">{r.result.consoleErrors.length} console error(s) on the page.</p>}
                </>}
              </div>}
            </li>); })}
        </ul>
      </section>
      <section aria-labelledby="new-h" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
        <h2 id="new-h" className="text-lg font-semibold text-ink">New flow</h2>
        <p className="mt-1 text-sm text-slate-600">Steps are open, click, fill, press and wait. A flow never signs in, submits forms, buys, deletes or leaves your site; those steps are blocked and recorded.</p>
        <label className="mt-3 block text-sm font-medium text-ink" htmlFor="flow-json">Flow (JSON)</label>
        <textarea id="flow-json" value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} rows={14} className="mt-1 w-full rounded-lg border border-slate-300 p-3 font-mono text-xs text-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-pine-600" />
        <div className="mt-3 flex items-center gap-3"><Button onClick={create} disabled={busy === 'create'}>{busy === 'create' ? 'Saving…' : 'Save flow'}</Button><Button variant="ghost" onClick={() => setJson(EXAMPLE)}>Reset example</Button></div>
        {msg && <p role="status" className="mt-3 text-sm text-slate-800">{msg}</p>}
      </section>
    </div>
  );
}
