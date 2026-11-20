'use client';
// Left canvas: the captured screenshot with numbered, colour-coded boxes at each flagged
// element's getBoundingClientRect() position. Pins are real buttons, so the viewer is usable
// by keyboard and screen reader as well as by mouse.
import * as React from 'react';
import type { ReportIssue, ReportViewport, Severity, ViewportId } from '@/lib/report-types.ts';
import { cn } from '@/lib/utils.ts';

export const SEV_COLOR: Record<Severity, string> = { critical: '#9E472A', serious: '#ea580c', moderate: '#d97706', minor: '#0284c7' };

export type PinViewerHandle = { scrollToIssue: (issueId: string, instanceIndex?: number) => void };
type Props = { viewport: ReportViewport; issues: ReportIssue[]; selectedId: string | null; pulse: number; onSelect: (issueId: string, instanceIndex: number) => void };

export const PinViewer = React.forwardRef<PinViewerHandle, Props>(function PinViewer({ viewport, issues, selectedId, pulse, onSelect }, ref) {
  const scroller = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(800);
  React.useEffect(() => {
    const el = scroller.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const vp: ViewportId = viewport.viewport;
  const scale = Math.min(vp === 'mobile' ? 1.25 : 1, Math.max(0.2, (width - 32) / viewport.pageWidth));

  const pins = React.useMemo(() => issues.flatMap((i) => i.instances.map((inst, idx) => ({ issue: i, idx, total: i.instances.length, box: inst.boxes.find((b) => b.viewport === vp && b.visible) }))).filter((p) => p.box).sort((a, b) => a.box!.y - b.box!.y || a.box!.x - b.box!.x), [issues, vp]);

  React.useImperativeHandle(ref, () => ({
    scrollToIssue(issueId, instanceIndex = 0) {
      const issue = issues.find((i) => i.id === issueId);
      const box = issue?.instances[instanceIndex]?.boxes.find((b) => b.viewport === vp && b.visible) ?? issue?.instances.flatMap((x) => x.boxes).find((b) => b.viewport === vp && b.visible);
      if (!box || !scroller.current) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      scroller.current.scrollTo({ top: Math.max(0, box.y * scale - 80), left: Math.max(0, box.x * scale - 40), behavior: reduce ? 'auto' : 'smooth' });
    },
  }), [issues, vp, scale]);

  const unpinned = issues.filter((i) => !i.instances.some((x) => x.boxes.some((b) => b.viewport === vp && b.visible))).length;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scroller} className="relative min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-4" role="region" aria-label={`Screenshot of the page at ${viewport.viewportWidth}px with issue pins`} tabIndex={0}>
        <div className="relative mx-auto shadow-lg" style={{ width: viewport.pageWidth * scale, height: viewport.pageHeight * scale }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewport.screenshotUrl} alt={`Full-page screenshot at ${vp} width (${viewport.viewportWidth}px). Each numbered pin marks an issue listed in the findings panel.`} width={viewport.pageWidth * scale} height={viewport.pageHeight * scale} className="block select-none" draggable={false} />
          {pins.map(({ issue, idx, total, box }) => {
            const selected = issue.id === selectedId; const color = SEV_COLOR[issue.severity];
            const style = { left: box!.x * scale, top: box!.y * scale, width: Math.max(10, box!.width * scale), height: Math.max(10, box!.height * scale), borderColor: color, ['--pin-color' as string]: color } as React.CSSProperties;
            return (
              <button key={`${issue.id}-${idx}`} type="button" onClick={() => onSelect(issue.id, idx)}
                aria-label={`Issue ${issue.position}: ${issue.title}${total > 1 ? `, instance ${idx + 1} of ${total}` : ''}`} aria-pressed={selected}
                className={cn('absolute rounded-[3px] border-2 transition-[background-color] hover:bg-black/5', issue.bucket === 'needs_review' && 'border-dashed', selected ? 'z-20 bg-white/10' : 'z-10', selected && pulse ? 'pin-pulse' : '')}
                style={style} data-pulse={selected ? pulse : undefined}>
                <span aria-hidden="true" className={cn('absolute -left-2.5 -top-2.5 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold text-white shadow ring-2 ring-white', selected && 'scale-125')} style={{ background: color }}>{issue.position}</span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-600">
        {pins.length} pin{pins.length === 1 ? '' : 's'} on this screenshot. Dashed outlines need human review.{unpinned ? ` ${unpinned} issue${unpinned === 1 ? ' has' : 's have'} no visible element at this width.` : ''}{viewport.truncated ? ' The screenshot is cut off at 12,000px.' : ''}
      </p>
    </div>
  );
});
