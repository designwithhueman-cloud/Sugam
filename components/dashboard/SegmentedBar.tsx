// Tall segmented bar (part-to-whole). Each part gets its own block with its count printed on
// it where it fits; a legend lists every part with its figure, so nothing relies on colour.
// Colours: categorical slots validated for colour-blind separation; segments sit on a 2px gap.
export type Part = { key: string; label: string; value: number; color: string; icon?: string };
export function SegmentedBar({ parts, title, unit = 'issues' }: { parts: Part[]; title: string; unit?: string }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  const shown = parts.filter((p) => p.value > 0);
  return (
    <figure className="m-0">
      <figcaption className="sr-only">{title}: {parts.map((p) => `${p.label} ${p.value}`).join(', ')}.</figcaption>
      {total === 0 ? <div className="flex h-12 items-center justify-center rounded-md bg-slate-100 text-sm text-slate-600">No {unit}</div> : (
        <div aria-hidden className="flex h-12 gap-[2px] overflow-hidden rounded-[4px] bg-white">
          {shown.map((p) => {
            const pct = (p.value / total) * 100;
            return (
              <div key={p.key} title={`${p.label}: ${p.value} ${unit} (${Math.round(pct)}%)`} className="group relative flex min-w-[6px] items-center justify-center rounded-[4px] text-sm font-bold text-white transition-[filter] hover:brightness-110" style={{ width: `${pct}%`, background: p.color }}>
                {pct >= 12 && <span className="rounded bg-black/40 px-1.5 py-0.5 tabular-nums">{p.value}</span>}
              </div>
            );
          })}
        </div>
      )}
      <ul className="mt-3 grid gap-1.5 text-sm" aria-hidden>
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: p.color }} />
            <span className="text-slate-700">{p.icon ? `${p.icon} ` : ''}{p.label}</span>
            <span className="ml-auto font-semibold tabular-nums text-slate-900">{p.value}{total ? <span className="ml-1 font-normal text-slate-500">({Math.round((p.value / total) * 100)}%)</span> : null}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
// Fix type = identity (categorical slots 1-3). Severity = status palette, always with an icon + label.
export const FIX_COLORS = { design: '#2a78d6', no_code: '#eb6834', dev: '#1baf7a' } as const;
export const FIX_LABELS = { design: 'Design fix', no_code: 'No-code inspector', dev: 'Developer / code fix' } as const;
export const SEV_STATUS = { critical: '#9E472A', serious: '#ec835a', moderate: '#fab219', minor: '#8a8a86' } as const;
export const SEV_ICON = { critical: '▲', serious: '◆', moderate: '●', minor: '▽' } as const;
