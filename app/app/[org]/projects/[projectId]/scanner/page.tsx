import { notFound } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/index.ts';
import { requireUser } from '@/lib/auth.ts';
import { projectAccess } from '@/lib/access.ts';
import { startProjectScanAction } from '@/app/actions.ts';
import { ActionForm } from '@/components/forms/ActionForm.tsx';
import { Field, inputCls } from '@/components/forms/Field.tsx';
import { ScanRow } from '@/components/ScanRow.tsx';
import { strictScores } from '@/lib/score-display.ts';
import { STANDARDS } from '@/lib/standards.ts';
import { ProjectHead, projectMain } from '@/components/dashboard/ProjectHead.tsx';

export const dynamic = 'force-dynamic';
export default async function Scanner({ params }: { params: Promise<{ org: string; projectId: string }> }) {
  const { org, projectId } = await params;
  const user = await requireUser(`/app/${org}/projects/${projectId}/scanner`);
  const pa = await projectAccess(user, projectId); if (!pa) notFound();
  const p = pa.project; const db = await getDb();
  const scans = await db.select().from(schema.scans).where(eq(schema.scans.projectId, p.id)).orderBy(desc(schema.scans.createdAt)).limit(50);
  const scores = await strictScores(scans);
  return (
    <main id="main" className={projectMain}>
      <ProjectHead org={org} project={p} current="Scanner" title="Scan this site" sub="Desktop (1280px) and a phone (390px), with reflow and the main button checked at 320px: axe-core rules, Avara’s checks, a keyboard trace and screenshots." />
      <section className="rounded-2xl border border-stone-line bg-white p-5 sm:p-7" aria-labelledby="run-h">
        <h2 id="run-h" className="text-[1.375rem] font-semibold tracking-tight text-ink">Run a scan</h2>
        <ActionForm action={startProjectScanAction} submit="Start scan" className="mt-3">
          <input type="hidden" name="projectId" value={p.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Environment" htmlFor="env"><select id="env" name="environment" className={inputCls}>{p.liveUrl && <option value="live">Live: {p.liveUrl}</option>}{p.stagingUrl && <option value="staging">Staging: {p.stagingUrl}</option>}</select></Field>
            <Field label="Compliance target" htmlFor="std"><select id="std" name="standard" defaultValue={p.defaultStandard} className={inputCls}>{Object.entries(STANDARDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
          </div>
        </ActionForm>
      </section>
      <section className="mt-8" aria-labelledby="hist-h">
        <h2 id="hist-h" className="text-lg font-semibold">Scan history</h2>
        {scans.length ? <div className="mt-3 overflow-x-auto rounded-xl" tabIndex={0} role="region" aria-label="Scan history, scrolls sideways on small screens"><table className="w-full min-w-[34rem] overflow-hidden rounded-xl bg-white text-sm shadow-sm"><thead className="bg-pine-50 text-left text-xs uppercase tracking-wide text-slate-600"><tr><th className="p-3">Page</th><th className="p-3">Score</th><th className="p-3">Confirmed issues</th><th className="p-3">Status</th><th className="p-3">Date</th></tr></thead><tbody>{scans.map((s) => <ScanRow key={s.id} score={scores[s.id]} scan={s} showEnv />)}</tbody></table></div> : <p className="mt-2 text-sm text-slate-600">No scans yet.</p>}
      </section>
    </main>
  );
}
