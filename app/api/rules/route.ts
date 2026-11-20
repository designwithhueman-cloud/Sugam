import { NextResponse } from 'next/server';
import { ruleLoader } from '@/src/engines/rule-engine/RuleLoader.ts';

export const dynamic = 'force-dynamic';
// The rule library as data: counts, weights and each rule's source. Edits to src/rules/*.json show up here without a restart.
export async function GET(req: Request) {
  const l = ruleLoader(); const cat = new URL(req.url).searchParams.get('category');
  const rules = (cat ? l.loadCategoryRules(cat, { includeDisabled: true }) : l.loadAllRules({ includeDisabled: true }));
  return NextResponse.json({
    library: l.manifest.library, version: l.manifest.libraryVersion, total: rules.length, issues: l.issues,
    categories: l.manifest.categories.map((c) => ({ label: c.label, weight: c.weight, rules: l.loadCategoryRules(c.label, { includeDisabled: true }).length })),
    rules: rules.map((r) => ({ ruleId: r.ruleId, category: r.category, title: r.title, source: r.source, sourceType: r.sourceType, sourceUrl: r.sourceUrl, sourceStatus: r.sourceStatus ?? 'passage-unverified', severity: r.severity, weight: r.weight, enabled: r.enabled, evaluator: r.evaluator?.type ?? 'detector' })),
  });
}
