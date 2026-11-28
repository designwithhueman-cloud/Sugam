'use client';
// "See fix": opens the fix under the finding on demand, next to the rescan control.
import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import type { AvaraFix } from '@/lib/report-types.ts';
import { FixPanel } from './FixPanel.tsx';
import { RescanButton } from './RescanButton.tsx';

export function SeeFix({ id, fixes, scanId, lockedNote, canRescan, findingId }: { findingId?: string; id: string; fixes: AvaraFix[] | null; scanId: string; lockedNote: string; canRescan: boolean }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" aria-expanded={open} aria-controls={`fixpanel-${id}`} data-testid="see-fix" onClick={() => setOpen((o) => !o)}
          className="inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-6 text-lg sm:min-h-14 sm:px-7 font-semibold text-white hover:bg-neutral-800">
          {open ? 'Hide fix' : 'See fix'}<ChevronDown aria-hidden className={`size-5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {canRescan && <RescanButton scanId={scanId} label="Rescan after fixing" />}
      </div>
      <div id={`fixpanel-${id}`} hidden={!open} className="mt-5">
        {fixes?.length ? <FixPanel fixes={fixes} id={id} findingId={findingId} /> : <p className="rounded-2xl bg-[#f6f5f1] p-4 text-base text-neutral-800">{lockedNote}</p>}
      </div>
    </div>
  );
}
