// The two lists on the workspace overview, also used in full on their own pages. Real tables, so each number keeps its column
// header for screen readers; on phones the less important columns fold into the first cell instead of scrolling sideways.
import type { InferSelectModel } from 'drizzle-orm';
import type { scans } from '@/lib/db/schema.ts';
import type { ProjectRow } from '@/lib/overview.ts';
import { pageLabel } from '@/lib/overview.ts';
import { DayDate, Initials, OpenLink, fullDate, shortDate } from '@/components/dashboard/bits.tsx';

const th = 'px-2 pb-2.5 pt-1 text-left text-[13px] font-medium text-pine-600 sm:px-3';
const td = 'px-2 py-3 align-middle sm:px-3';
const host = (u: string | null) => { if (!u) return ''; try { return new URL(u).host; } catch { return u; } };

function Count({ n, none = 'Not scanned yet' }: { n: number | null; none?: string }) {
  if (n === null) return <><span aria-hidden className="text-pine-500">–</span><span className="sr-only">{none}</span></>;
  return <span className={`text-[17px] font-semibold tabular-nums ${n > 0 ? 'text-ink' : 'text-pine-600'}`}>{n}</span>;
}

export function ProjectTable({ org, rows, caption }: { org: string; rows: ProjectRow[]; caption: string }) {
  return (
    <table className="w-full table-fixed border-collapse text-[15px]">
      <caption className="sr-only">{caption}</caption>
      <thead><tr className="border-b border-stone-line">
        <th scope="col" className={th}>Project</th>
        <th scope="col" className={`${th} w-[5.25rem] sm:w-[7.5rem]`}>Confirmed<span className="max-sm:sr-only"> issues</span></th>
        <th scope="col" className={`${th} hidden w-[7rem] xl:table-cell`}>Needs review</th>
        <th scope="col" className={`${th} hidden w-[6.5rem] sm:table-cell`}>Last scan</th>
        <th scope="col" className={`${th} w-[3.75rem] md:w-[10rem]`}><span className="sr-only">Open</span></th>
      </tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-stone-line last:border-0">
            <th scope="row" className={`${td} text-left font-normal`}>
              <div className="flex items-center gap-3">
                <Initials name={r.name} className="max-sm:hidden" />
                <div className="min-w-0">
                  <p className="line-clamp-2 font-semibold text-ink xl:truncate">{r.name}</p>
                  <p className="truncate text-sm text-pine-600">{r.client}{r.url ? <span className="hidden md:inline"> · {host(r.url)}</span> : null}</p>
                  <p className="text-sm text-pine-600 sm:hidden">{r.running ? 'Scanning now' : r.lastScanAt ? <>Scanned <DayDate date={r.lastScanAt} /></> : 'Not scanned yet'}</p>
                </div>
              </div>
            </th>
            <td className={td}>{r.running && r.confirmed === null ? <span className="text-sm text-pine-600">Scanning…</span> : <Count n={r.confirmed} />}</td>
            <td className={`${td} hidden xl:table-cell`}><Count n={r.waiting} /></td>
            <td className={`${td} hidden text-pine-700 sm:table-cell`}>{r.lastScanAt ? <DayDate date={r.lastScanAt} /> : <span className="text-sm text-pine-600">{r.running ? 'Scanning now' : 'Never'}</span>}</td>
            <td className={`${td} text-right`}>
              <OpenLink href={`/app/${org}/projects/${r.id}`} name={r.name} label={r.lastScanAt ? 'Open project' : 'Run first scan'} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type Scan = InferSelectModel<typeof scans>;
const statusText: Record<Scan['status'], string> = { queued: 'Waiting to start', running: 'Scanning…', analyzing: 'Analysing…', completed: '', failed: 'Scan failed' };

export function QuickScanTable({ rows, caption, withScore = false }: { rows: Scan[]; caption: string; withScore?: boolean }) {
  return (
    <table className="w-full table-fixed border-collapse text-[15px]">
      <caption className="sr-only">{caption}</caption>
      <thead><tr className="border-b border-stone-line">
        <th scope="col" className={th}>Page</th>
        {withScore && <th scope="col" className={`${th} hidden w-[4.5rem] xl:table-cell`}>Score</th>}
        <th scope="col" className={`${th} w-[5.25rem] sm:w-[7.5rem]`}>Confirmed<span className="max-sm:sr-only"> issues</span></th>
        <th scope="col" className={`${th} hidden w-[9.5rem] xl:table-cell`}>Scanned</th>
        <th scope="col" className={`${th} w-[3.75rem] md:w-[10rem]`}><span className="sr-only">Open</span></th>
      </tr></thead>
      <tbody>
        {rows.map((s) => {
          const name = pageLabel(s); const when = s.completedAt ?? s.createdAt;
          return (
            <tr key={s.id} className="border-b border-stone-line last:border-0">
              <th scope="row" className={`${td} text-left font-normal`}>
                <div className="flex items-center gap-3">
                  <Initials name={name} className="size-9 rounded-lg text-[13px] max-sm:hidden" />
                  <div className="min-w-0">
                    <p className="line-clamp-2 font-semibold text-ink xl:line-clamp-1">{name}</p>
                    <p className="line-clamp-2 break-all text-sm text-pine-600 sm:line-clamp-1">{host(s.finalUrl || s.url)}<span className="xl:hidden"> · <time dateTime={when.toISOString()} title={fullDate(when)}>{shortDate(when)}</time></span></p>
                  </div>
                </div>
              </th>
              {withScore && <td className={`${td} hidden xl:table-cell`}>{s.score ?? <span className="text-pine-600">–</span>}</td>}
              <td className={td}>{s.status === 'completed' ? <Count n={s.summary ? s.summary.confirmedIssues : null} none="Not counted" /> : <span className={`text-sm ${s.status === 'failed' ? 'font-semibold text-[#9e2a12]' : 'text-pine-600'}`}>{statusText[s.status]}</span>}</td>
              <td className={`${td} hidden text-pine-700 xl:table-cell`}><time dateTime={when.toISOString()} title={fullDate(when)}>{shortDate(when)}</time></td>
              <td className={`${td} text-right`}><OpenLink href={`/scans/${s.id}`} name={name} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-pine-300 bg-pine-50 px-4 py-5 text-[15px] text-pine-700">{children}</div>;
}
