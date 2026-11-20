'use client';
import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils.ts';

// Copies text and says so, in the button and in one polite status message. If the browser
// blocks the clipboard it says that too, instead of pretending it worked.
export function CopyButton({ text, label, className = '' }: { text: string; label: string; className?: string }) {
  const [state, setState] = React.useState<'idle' | 'done' | 'failed'>('idle');
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <>
      <button type="button" className={cn('inline-flex min-h-11 items-center gap-2 rounded-lg border-2 px-3.5 text-base font-semibold', className)}
        onClick={async () => {
          try { await navigator.clipboard.writeText(text); setState('done'); } catch { setState('failed'); }
          clearTimeout(timer.current); timer.current = setTimeout(() => setState('idle'), 2500);
        }}>
        {state === 'done' ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
        {state === 'done' ? 'Copied' : state === 'failed' ? 'Copy failed' : `Copy ${label}`}
      </button>
      <span role="status" className="sr-only">{state === 'done' ? `${label} copied to the clipboard.` : state === 'failed' ? `Could not copy ${label}. Select the text and copy it instead.` : ''}</span>
    </>
  );
}
