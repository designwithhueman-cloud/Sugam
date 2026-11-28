// A delete that cannot be undone: closed by default, says exactly what goes, and needs a typed confirmation before the button works.
import { ActionForm } from '@/components/forms/ActionForm.tsx';
import { Field, inputCls } from '@/components/forms/Field.tsx';
import type { FormState } from '@/app/actions.ts';

export function DangerDelete({ id, summary, explain, action, hidden, confirmLabel, confirmHint, submit }: {
  id: string; summary: string; explain: string; action: (s: FormState, f: FormData) => Promise<FormState>;
  hidden: Record<string, string>; confirmLabel: string; confirmHint?: string; submit: string;
}) {
  return (
    <details className="rounded-2xl border border-[#e7b8a8] bg-white px-5 py-3" data-testid={`${id}-box`}>
      <summary className="min-h-11 cursor-pointer py-2 text-lg font-semibold text-[#9e2a12]">{summary}</summary>
      <p className="mt-1 max-w-2xl text-base text-neutral-800">{explain}</p>
      <ActionForm action={action} submit={submit} danger className="mt-4 max-w-md pb-3">
        {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <Field label={confirmLabel} htmlFor={`${id}-confirm`}><input id={`${id}-confirm`} name="confirm" autoComplete="off" spellCheck={false} className={inputCls} aria-describedby={confirmHint ? `${id}-hint` : undefined} /></Field>
        {confirmHint && <p id={`${id}-hint`} className="text-sm text-neutral-700">{confirmHint}</p>}
      </ActionForm>
    </details>
  );
}
