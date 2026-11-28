import { notFound } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/index.ts';
import { redactDeep } from '@/lib/security/redact.ts';
import { requireUser } from '@/lib/auth.ts';
import { projectAccess } from '@/lib/access.ts';
import { startProjectScanAction } from '@/app/actions.ts';
import { ActionForm } from '@/components/forms/ActionForm.tsx';
import { Field, inputCls } from '@/components/forms/Field.tsx';
import { QuickScanTable, EmptyNote } from '@/components/dashboard/Tables.tsx';
import { Panel, IconBadge } from '@/components/dashboard/bits.tsx';
import { SearchBar, Pager, listPage } from '@/components/dashboard/ListNav.tsx';
import { History, Radar } from 'lucide-react';
import { strictScores } from '@/lib/score-display.ts';
import { STANDARDS } from '@/lib/standards.ts';
import { ProjectHead, projectMain } from '@/components/dashboard/ProjectHead.tsx';

export const dynamic = 'force-dynamic';
export default async function Scanner({ params, searchParams }: { params: Promise<{ org: string; projectId: string }>; searchParams: Promise<{ q?: string; page?: string }> }) {
  const { org, projectId } = await params;
  const user = await requireUser(`/app/${org}/projects/${projectId}/scanner`);
  const pa = await projectAccess(user, projectId); if (!pa) notFound();
  const p = pa.project; const db = await getDb();
  const scans = redactDeep(await db.select().from(schema.scans).where(eq(schema.scans.projectId, p.id)).orderBy(desc(schema.scans.createdAt)).limit(50));
  const base = `/app/${org}/projects/${projectId}/scanner`; const L = listPage(scans, (x) => [x.pageTitle, x.url, x.environment, x.status], await searchParams); const scores = await strictScores(L.rows);
  return (
    <main id="main" className={projectMain}>
      <ProjectHead org={org} project={p} current="Scanner" title="Scan this site" sub="Desktop (1280px) and a phone (390px), with reflow and the main button checked at 320px: axe-core rules, Avara’s checks, a keyboard trace and screenshots." />
      <section className="rounded-2xl border border-[#ddd2ff] bg-[linear-gradient(135deg,#f3efff_0%,#ebe4ff_100%)] p-5 sm:p-7" aria-labelledby="run-h">
        <h2 id="run-h" className="flex items-center gap-3 text-[1.375rem] font-semibold tracking-tight text-ink"><IconBadge icon={Radar} tone="lilac" />Run a scan</h2>
        <ActionForm action={startProjectScanAction} submit="Start scan" className="mt-3">
          <input type="hidden" name="projectId" value={p.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Environment" htmlFor="env"><select id="env" name="environment" className={inputCls}>{p.liveUrl && <option value="live">Live: {p.liveUrl}</option>}{p.stagingUrl && <option value="staging">Staging: {p.stagingUrl}</option>}</select></Field>
            <Field label="Compliance target" htmlFor="std"><select id="std" name="standard" defaultValue={p.defaultStandard} className={inputCls}>{Object.entries(STANDARDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
          </div>
        </ActionForm>
      </section>
      <Panel aria-labelledby="hist-h" className="mt-6 px-4 pb-1 pt-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3"><IconBadge icon={History} tone="blue" />
            <div><h2 id="hist-h" className="text-[1.375rem] font-semibold tracking-tight text-ink">Scan history</h2><p className="text-sm text-pine-600">Every scan of this site, newest first.</p></div></div>
          {scans.length > 0 && <SearchBar base={base} q={L.q} label="Search scan history" placeholder="Search by page, live or staging" />}
        </div>
        {L.rows.length ? <QuickScanTable rows={L.rows} scores={scores} showEnv caption={`Scans of ${p.name}, newest first, page ${L.page} of ${L.pages}`} /> : <div className="pb-4"><EmptyNote>{scans.length ? 'No scans match that search.' : 'No scans yet. Run the first one above.'}</EmptyNote></div>}
        {scans.length > 0 && <Pager base={base} q={L.q} page={L.page} pages={L.pages} matched={L.matched} noun="scan" />}
      </Panel>
    </main>
  );
}
