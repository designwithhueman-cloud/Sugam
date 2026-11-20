import Link from 'next/link';
import type { InferSelectModel } from 'drizzle-orm';
import type { scans } from '@/lib/db/schema.ts';

export function ScanRow({ scan, showEnv }: { scan: InferSelectModel<typeof scans>; showEnv?: boolean }) {
  return (
    <tr className="border-t border-slate-100">
      <td className="max-w-xs truncate p-3"><Link className="font-semibold text-pine-700 underline underline-offset-2" href={`/scans/${scan.id}`}>{scan.pageTitle || scan.url}</Link>{showEnv && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{scan.environment}</span>}</td>
      <td className="p-3 font-semibold">{scan.score ?? '–'}</td>
      <td className="p-3">{scan.summary ? scan.summary.confirmedIssues : '–'}</td>
      <td className="p-3">{scan.status}</td>
      <td className="p-3 text-slate-600">{scan.createdAt.toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })}</td>
    </tr>
  );
}
