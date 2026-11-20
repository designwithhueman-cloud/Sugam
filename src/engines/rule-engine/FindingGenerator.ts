// Turns an outcome into a Finding: the rule's own data (title, severity, source, recommendation template) plus what was observed. Nothing here
// names a rule. Skipped outcomes (not run, unimplemented, not applicable) make no finding; they are counted on the category instead.
import crypto from 'node:crypto';
import type { Finding, Manifest, Rule, RuleOutcome } from './RuleTypes.ts';

const CONF_CAP: Record<string, number> = { measured: 1, ai_assisted: 0.7, human: 1, rollup: 1, none: 0 };
const fill = (tpl: string, v: Record<string, string>) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => v[k] ?? '').replace(/\s+/g, ' ').trim();

export function generateFinding(rule: Rule, o: RuleOutcome, ctx: { url: string }, manifest: Manifest): Finding | null {
  if (o.result === 'not_run' || o.result === 'unimplemented' || o.result === 'not_applicable') return null;
  const cat = manifest.categories.find((c) => c.label === rule.category);
  const passed = o.result === 'observed_pass';
  // A finding that is not a pass must be able to point at something: with no element to cite, the observation itself is the evidence.
  const evidence = o.evidence.length || passed ? o.evidence : [`Observed: ${o.observation}`];
  const first = evidence[0] ?? '';
  const element = first.length > 140 ? first.slice(0, 137) + '...' : first || 'the affected element';
  return {
    findingId: crypto.createHash('sha1').update([rule.ruleId, rule.version ?? '', o.result, ctx.url, o.evidence.join('|')].join('\n')).digest('hex').slice(0, 20),
    ruleId: rule.ruleId, category: rule.category, title: rule.title, severity: rule.severity,
    score: passed ? 100 : o.result === 'observed_failure' ? 0 : 50,
    passed, confidence: Math.min(o.confidence, CONF_CAP[o.method] ?? 1), evidence,
    userImpact: o.userImpact ?? (passed ? '' : rule.userImpact ?? cat?.userImpact ?? ''), businessImpact: o.businessImpact ?? (passed ? '' : rule.businessImpact ?? cat?.businessImpact ?? ''),
    recommendation: passed ? '' : fill(rule.recommendationTemplate, { observation: o.observation, element, evidence: evidence.slice(0, 3).join(' | '), audience: 'the visitors affected', title: rule.title }),
    result: o.result, method: o.method, observation: o.observation, weight: rule.weight, advisory: !!rule.advisory || o.method === 'ai_assisted', source: rule.source, sourceUrl: rule.sourceUrl,
    sourceStatus: rule.sourceStatus ?? 'passage-unverified', ruleVersion: rule.version ?? '1',
  };
}
