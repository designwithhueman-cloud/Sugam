// The one finding every scan unlocks completely, free: the most important confirmed failure,
// with its exact elements and its fix. Everything else stays behind the account and paid plans.
import { asc, eq, inArray } from 'drizzle-orm';
import { getDb, schema } from './db/index.ts';
import { plainTitle } from './plain.ts';
import type { ReportIssue } from './report-types.ts';

export type UnlockedFix = {
  id: string; plain: string; technical: string; severity: 'critical' | 'serious' | 'moderate' | 'minor'; wcag: string[];
  whatToChange: string; impactGroups: string[]; elements: { selector: string; html: string; detail: string | null }[]; moreElements: number;
  prompt: string; code: { language: string; before: string; after: string } | null;
};
export const FREE_ELEMENTS = 3;

// "In Cursor (Agent or Cmd+K), paste:\n\n<prompt>" -> "<prompt>"
const barePrompt = (p?: string) => (p ? (p.includes('\n\n') ? p.slice(p.indexOf('\n\n') + 2) : p) : '');

export function fromReportIssue(i: ReportIssue): UnlockedFix {
  return {
    id: i.id, plain: plainTitle(i.ruleId, i.title), technical: i.title, severity: i.severity, wcag: i.wcag.map((w) => w.sc), whatToChange: i.whatToChange, impactGroups: i.impactGroups,
    elements: i.instances.slice(0, FREE_ELEMENTS).map((x) => ({ selector: x.selector, html: x.html, detail: x.detail })), moreElements: Math.max(0, i.instanceCount - Math.min(i.instances.length, FREE_ELEMENTS)),
    prompt: barePrompt(i.fixes?.aiPrompt.cursor), code: i.fixes ? i.fixes.code : null,
  };
}

// The top confirmed failure of a scan, straight from the database (used by the anonymous teaser).
export async function unlockedFindingFor(scanId: string): Promise<UnlockedFix | null> {
  const db = await getDb();
  const [top] = (await db.select().from(schema.issues).where(eq(schema.issues.scanId, scanId)).orderBy(asc(schema.issues.position))).filter((i) => i.bucket === 'confirmed_failure');
  if (!top) return null;
  const inst = await db.select().from(schema.issueInstances).where(inArray(schema.issueInstances.issueId, [top.id]));
  return {
    id: top.id, plain: plainTitle(top.ruleId, top.title), technical: top.title, severity: top.severity, wcag: top.wcag.map((w) => w.sc), whatToChange: top.whatToChange, impactGroups: top.impactGroups,
    elements: inst.slice(0, FREE_ELEMENTS).map((x) => ({ selector: x.selector, html: x.html, detail: x.detail })), moreElements: Math.max(0, top.instanceCount - Math.min(inst.length, FREE_ELEMENTS)),
    prompt: barePrompt(top.fixes?.aiPrompt.cursor), code: top.fixes ? top.fixes.code : null,
  };
}
