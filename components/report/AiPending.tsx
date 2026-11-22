'use client';
// Report-first scans: the measured report is shown while the AI checks finish. This note says so and refreshes the page once they are done.
import * as React from 'react';
import { useRouter } from 'next/navigation';

export function AiPending({ scanId }: { scanId: string }) {
  const router = useRouter();
  React.useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try { const s = await (await fetch(`/api/scans/${scanId}`, { cache: 'no-store' })).json(); if (s && s.aiPending === false) { router.refresh(); return; } } catch { /* try again */ }
      setTimeout(tick, 5000);
    };
    const t = setTimeout(tick, 5000); return () => { stop = true; clearTimeout(t); };
  }, [scanId, router]);
  return (
    <p role="status" data-testid="ai-pending" className="mt-4 flex items-center gap-3 rounded-2xl bg-[#efe9ff] px-5 py-3 text-base text-ink">
      <span aria-hidden className="size-2.5 shrink-0 animate-pulse rounded-full bg-[#5b2fd0] motion-reduce:animate-none" />
      <span><b>AI checks are still running</b> (wording, trust and design, usually 1 to 3 minutes). Everything measured is already here, including your first fix. This page updates by itself when they finish.</span>
    </p>
  );
}
