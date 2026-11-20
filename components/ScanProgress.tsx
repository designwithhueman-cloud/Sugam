'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';

export function ScanProgress({ id, url }: { id: string; url: string }) {
  const router = useRouter();
  const [st, setSt] = React.useState<{ status: string; progress?: { step: string; percent: number } | null; error?: { message: string } | null }>({ status: 'queued' });
  React.useEffect(() => {
    let t: ReturnType<typeof setTimeout>; let live = true;
    const poll = async () => {
      const r = await fetch(`/api/scans/${id}`).then((x) => x.json()).catch(() => null);
      if (!live) return;
      if (r) { setSt(r); if (r.status === 'completed' || r.status === 'failed') { router.refresh(); return; } }
      t = setTimeout(poll, 1500);
    };
    poll(); return () => { live = false; clearTimeout(t); };
  }, [id, router]);
  const pct = st.progress?.percent ?? 3;
  return (
    <main id="main" className="px-5 pb-20 pt-12 sm:px-10 sm:pt-20">
      <div className="mx-auto max-w-2xl rounded-[2rem] bg-[#e6f9b6] p-8 text-center sm:p-12">
        <h1 className="text-4xl font-semibold tracking-[-0.03em] text-ink sm:text-5xl">Reviewing your site</h1>
        <p className="mt-3 break-all text-lg text-neutral-800">{url}</p>
        <div className="mt-8 h-4 overflow-hidden rounded-full bg-white" aria-hidden><div className="h-full rounded-full bg-ink transition-all" style={{ width: `${pct}%` }} /></div>
        <p role="status" className="mt-4 text-xl font-medium text-ink">{st.status === 'queued' ? 'Waiting for a scanner…' : st.progress?.step || 'Working…'}</p>
        <p className="mt-6 text-base text-neutral-800">We open your page in a real browser at desktop and phone widths, run the accessibility rules, press Tab 25 times and take screenshots. This usually takes under a minute.</p>
      </div>
    </main>
  );
}
