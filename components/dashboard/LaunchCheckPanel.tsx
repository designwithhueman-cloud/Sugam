'use client';
// Launch check: shows what the exposure checks found in plain words, what to tell the AI builder, and what changed since the last check.
// All checks and permissions are enforced by /api/projects/:id/launch-check; this component only displays them.
import * as React from 'react';
import { Button } from '@/components/ui/button.tsx';

type Result = { id: string; title: string; status: 'pass' | 'flag' | 'unverified'; severity: string | null; active: boolean; plain: string; fix: string; yourself?: string; evidence: string[] };
type Verdict = { level: 'stop' | 'fix' | 'partial' | 'ok'; headline: string; detail: string };
type Change = { id: string; title: string; outcome: 'fixed' | 'still_open' | 'new' | 'newly_found' | 'could_not_check' };
type Latest = { at: string; active: boolean; results: Result[]; verdict: Verdict };

const TONE: Record<Verdict['level'], string> = { stop: 'border-red-300 bg-red-50 text-red-900', fix: 'border-amber-300 bg-amber-50 text-amber-900', partial: 'border-slate-300 bg-slate-50 text-slate-800', ok: 'border-emerald-300 bg-emerald-50 text-emerald-900' };
const PILL: Record<string, string> = { flag: 'bg-red-100 text-red-800', pass: 'bg-emerald-100 text-emerald-800', unverified: 'bg-slate-200 text-slate-700' };
const PILL_TEXT: Record<string, string> = { flag: 'Problem found', pass: 'Looks fine', unverified: 'Not checked yet' };
const CHANGE: Record<Change['outcome'], { label: string; cls: string }> = { new: { label: 'Newly broken', cls: 'bg-red-100 text-red-800' }, newly_found: { label: 'Newly found', cls: 'bg-amber-100 text-amber-900' }, fixed: { label: 'Fixed', cls: 'bg-emerald-100 text-emerald-800' }, still_open: { label: 'Still open', cls: 'bg-amber-100 text-amber-900' }, could_not_check: { label: 'Could not check', cls: 'bg-slate-200 text-slate-700' } };

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = React.useState(false);
  return <Button type="button" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ } }}>{done ? 'Copied' : label}</Button>;
}

export function LaunchCheckPanel({ projectId, liveUrl, verified: v0, tag, canVerify, initial }: { projectId: string; liveUrl: string | null; verified: boolean; tag: string | null; canVerify: boolean; initial: Latest | null }) {
  const [verified, setVerified] = React.useState(v0); const [latest, setLatest] = React.useState<Latest | null>(initial); const [changes, setChanges] = React.useState<Change[]>([]);
  const [busy, setBusy] = React.useState<'run' | 'verify' | null>(null); const [note, setNote] = React.useState<string | null>(null);
  const base = `/api/projects/${projectId}/launch-check`;

  async function run() {
    setBusy('run'); setNote(null);
    try {
      const r = await fetch(base, { method: 'POST' }); const j = await r.json();
      if (!r.ok) { setNote(j.message ?? 'The check could not run.'); return; }
      setLatest({ at: j.run.at, active: j.run.active, results: j.run.results, verdict: j.verdict }); setChanges(j.changes ?? []);
    } catch { setNote('The check could not run. Try again.'); } finally { setBusy(null); }
  }
  async function verify() {
    setBusy('verify'); setNote(null);
    try { const r = await fetch(`${base}/ownership`, { method: 'POST' }); const j = await r.json(); if (j.verified) { setVerified(true); setNote('Confirmed. The extra checks will run next time.'); } else setNote(j.message ?? 'Could not confirm ownership.'); }
    catch { setNote('Could not confirm ownership. Try again.'); } finally { setBusy(null); }
  }

  if (!liveUrl) return <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-slate-600">Add your live address to this project first. The launch check reads that page.</p>;
  const newOnes = changes.filter((c) => c.outcome === 'new');

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <section aria-labelledby="lc-run" className="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
        <h2 id="lc-run" className="text-lg font-semibold text-ink">Check {liveUrl}</h2>
        <p className="mt-1 text-sm text-slate-600">{verified ? 'Ownership confirmed. All four checks will run.' : 'Without confirming ownership we only read your site’s code for leaked keys. Confirm ownership to also check for public files, public source code and open tables.'}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3"><Button type="button" onClick={run} disabled={busy !== null}>{busy === 'run' ? 'Checking…' : latest ? 'Check again' : 'Check my site'}</Button>{note && <span role="status" className="text-sm text-slate-700">{note}</span>}</div>
      </section>

      {!verified && tag && canVerify && (
        <section aria-labelledby="lc-own" className="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
          <h2 id="lc-own" className="text-lg font-semibold text-ink">Confirm you own this site</h2>
          <p className="mt-1 text-sm text-slate-600">Paste this message into your AI builder, publish, then press Confirm. It adds one invisible line so we know the site is yours.</p>
          <pre className="mt-3 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm" data-testid="own-message">{`Add this exact line inside the <head> of my site's home page, and do not change anything else:\n${tag}`}</pre>
          <div className="mt-3 flex flex-wrap gap-3"><Copy label="Copy message" text={`Add this exact line inside the <head> of my site's home page, and do not change anything else:\n${tag}`} /><Button type="button" onClick={verify} disabled={busy !== null}>{busy === 'verify' ? 'Looking…' : 'Confirm'}</Button></div>
        </section>
      )}
      {!verified && tag && !canVerify && <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">An owner or admin of this workspace needs to confirm site ownership to run the extra checks.</p>}

      {latest && (
        <>
          <section aria-label="Result" className={`min-w-0 rounded-xl border p-5 ${TONE[latest.verdict.level]}`} data-testid="verdict" data-level={latest.verdict.level}>
            <p className="text-xl font-semibold">{latest.verdict.headline}</p><p className="mt-1">{latest.verdict.detail}</p>
            <p className="mt-2 text-sm opacity-80">Checked {new Date(latest.at).toLocaleString()}</p>
          </section>

          {changes.length > 0 && (
            <section aria-labelledby="lc-changes" className="min-w-0 rounded-xl border border-slate-200 bg-white p-5" data-testid="changes">
              <h2 id="lc-changes" className="text-lg font-semibold text-ink">Since your last check</h2>
              {newOnes.length > 0 && <p className="mt-1 text-sm font-medium text-red-800">Something that was fine before is now a problem. This is the first thing to fix.</p>}
              <ul className="mt-3 space-y-2">{changes.map((c) => <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm"><span className="font-medium text-ink">{c.title}</span><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CHANGE[c.outcome].cls}`}>{CHANGE[c.outcome].label}</span></li>)}</ul>
            </section>
          )}

          <ul className="min-w-0 space-y-3">
            {[...latest.results].sort((a, b) => (a.status === 'flag' ? 0 : a.status === 'unverified' ? 2 : 1) - (b.status === 'flag' ? 0 : b.status === 'unverified' ? 2 : 1)).map((r) => (
              <li key={r.id} data-testid="result" data-status={r.status} className="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold text-ink">{r.title}</h3><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PILL[r.status]}`}>{PILL_TEXT[r.status]}</span></div>
                <p className="mt-2 text-slate-700">{r.plain}</p>
                {r.status === 'flag' && r.fix && (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3"><p className="text-sm font-semibold text-ink">Tell your AI builder</p><p className="mt-1 break-words text-sm text-slate-700">{r.fix}</p><div className="mt-2"><Copy label="Copy message" text={r.fix} /></div>{r.yourself && <p className="mt-3 border-t border-slate-200 pt-3 text-sm text-slate-700"><span className="font-semibold text-ink">Then do this yourself: </span>{r.yourself}</p>}</div>
                )}
                {r.evidence.length > 0 && <details className="mt-3 text-sm text-slate-600"><summary className="cursor-pointer font-medium">For your developer</summary><ul className="mt-2 list-disc space-y-1 pl-5 break-words">{r.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul></details>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
