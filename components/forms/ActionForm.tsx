'use client';
// Wraps a server action with pending state and an announced success or error message.
import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { FormState } from '@/app/actions.ts';
import { Button } from '@/components/ui/button.tsx';
import { cn } from '@/lib/utils.ts';

export function ActionForm({ action, submit, children, className, resetOnOk, refreshOnOk, submitLabel, danger }: { submitLabel?: string; danger?: boolean; action: (s: FormState, f: FormData) => Promise<FormState>; submit: string; children: React.ReactNode; className?: string; resetOnOk?: boolean; refreshOnOk?: boolean }) {
  const router = useRouter();
  const [state, run, pending] = React.useActionState(action, undefined);
  const form = React.useRef<HTMLFormElement>(null); const msg = React.useRef<HTMLParagraphElement>(null);
  React.useEffect(() => { if (state?.error) msg.current?.focus(); if (state?.ok && resetOnOk) form.current?.reset(); if (state?.ok && refreshOnOk) router.refresh(); }, [state, resetOnOk, refreshOnOk, router]);
  return (
    <form ref={form} action={run} noValidate className={cn('space-y-3', className)}>
      {children}
      <p ref={msg} tabIndex={-1} role={state?.error ? 'alert' : 'status'} hidden={!state?.error && !state?.ok} className={cn('rounded-lg px-3 py-2 text-sm', state?.error ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-900')}>{state?.error || state?.ok}</p>
      <Button type="submit" disabled={pending} aria-label={submitLabel} variant={danger ? 'danger' : undefined} className="min-h-11">{pending ? 'Working…' : submit}</Button>
    </form>
  );
}
