import * as React from 'react';
export const inputCls = 'h-11 w-full rounded-lg border border-slate-400 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-pine-600';
export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-semibold text-slate-800">{label}</label>
      {children}
      {hint && <p id={`${htmlFor}-hint`} className="mt-1 text-xs text-slate-600">{hint}</p>}
    </div>
  );
}
