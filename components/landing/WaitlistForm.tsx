'use client';
import * as React from 'react';
import { joinWaitlistAction } from '@/app/actions.ts';

// Email-only waiting list. The message is announced once, after the person submits.
export function WaitlistForm({ plan }: { plan: 'site' | 'agency' }) {
  const [state, run, pending] = React.useActionState(joinWaitlistAction, undefined);
  return (
    <form action={run} noValidate className="mt-6">
      <input type="hidden" name="plan" value={plan} />
      <label htmlFor={`wl-${plan}`} className="mb-2 block text-lg font-semibold text-ink">Email me when checkout opens</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id={`wl-${plan}`} name="email" type="email" autoComplete="email" placeholder="you@example.com" aria-describedby={`wl-${plan}-note`} className="min-h-14 min-w-0 flex-1 rounded-xl border border-ink bg-white px-6 text-lg text-ink placeholder:text-neutral-600" />
        <button type="submit" disabled={pending} className="inline-flex min-h-14 items-center justify-center rounded-xl bg-ink px-7 text-lg font-semibold text-white hover:bg-neutral-800 disabled:opacity-70">{pending ? 'Saving…' : 'Notify me'}</button>
      </div>
      <p id={`wl-${plan}-note`} className="mt-3 text-base text-neutral-700">One email when checkout opens. Nothing else, and you can ask us to remove it.</p>
      <p role={state?.error ? 'alert' : 'status'} hidden={!state?.error && !state?.ok} className={`mt-3 rounded-xl px-4 py-3 text-lg font-semibold ${state?.error ? 'bg-[#fde7e1] text-[#7a1f0b]' : 'bg-[#e6f9b6] text-ink'}`}>{state?.error ?? state?.ok}</p>
    </form>
  );
}
