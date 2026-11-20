'use client';
// Starts a rescan of this scan's page. The original report stays as it is; the rescan opens as a new report that compares itself with it.
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

export function RescanButton({ scanId, label = 'Rescan to verify' }: { scanId: string; label?: string }) {
  const router = useRouter(); const [busy, setBusy] = React.useState(false); const [err, setErr] = React.useState('');
  return (
    <div>
      <button type="button" disabled={busy} data-testid="rescan" className="inline-flex min-h-12 items-center gap-2 rounded-full border border-ink bg-white px-5 text-base font-semibold text-ink hover:bg-black/5 disabled:opacity-60 sm:min-h-14 sm:px-6 sm:text-lg"
        onClick={async () => {
          setBusy(true); setErr('');
          try { const r = await fetch(`/api/scans/${scanId}/rescan`, { method: 'POST' }); const j = await r.json(); if (!r.ok) throw new Error(j.message || 'Could not start the rescan.'); router.push(`/scans/${j.id}`); }
          catch (e) { setErr((e as Error).message); setBusy(false); }
        }}><RefreshCw aria-hidden className={`size-5 ${busy ? 'animate-spin' : ''}`} />{busy ? 'Starting…' : label}</button>
      {err && <p role="alert" className="mt-2 text-base font-semibold text-[#7a1f0b]">{err}</p>}
    </div>
  );
}
