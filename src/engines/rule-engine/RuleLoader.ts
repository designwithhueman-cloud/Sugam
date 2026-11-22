// Reads rule files at runtime, validates them, caches them and picks up edits without a restart (hot reload). Growth is JSON-only: any *.json file in
// the rules directory (other than the manifest) is read, and its rules join the category named inside each rule. A bad rule is reported and skipped; it
// never stops the engine.
import fs from 'node:fs';
import path from 'node:path';
import type { Manifest, Rule } from './RuleTypes.ts';

const SEV = new Set(['critical', 'high', 'medium', 'low']); const SRC = new Set(['standard', 'research', 'best-practice', 'avara']);
export function validateRule(raw: unknown, categories: Set<string>): { rule: Rule | null; errors: string[] } {
  const e: string[] = []; const r = raw as Record<string, unknown>;
  const str = (k: string, allowEmpty = false) => { if (typeof r?.[k] !== 'string' || (!allowEmpty && !(r[k] as string).trim())) e.push(`${k} must be a non-empty string`); };
  if (!r || typeof r !== 'object') return { rule: null, errors: ['rule is not an object'] };
  ['ruleId', 'category', 'title', 'description', 'source', 'evaluationPrompt', 'recommendationTemplate'].forEach((k) => str(k));
  str('sourceUrl', true);
  if (!SRC.has(r.sourceType as string)) e.push(`sourceType must be one of ${[...SRC].join(', ')}`);
  if (!SEV.has(r.severity as string)) e.push(`severity must be one of ${[...SEV].join(', ')}`);
  if (typeof r.weight !== 'number' || !(r.weight >= 0) || r.weight > 100) e.push('weight must be a number from 0 to 100');
  if (typeof r.enabled !== 'boolean') e.push('enabled must be true or false');
  if (typeof r.category === 'string' && !categories.has(r.category)) e.push(`category "${r.category}" is not in the manifest`);
  if (r.confidence != null && (typeof r.confidence !== 'number' || r.confidence < 0 || r.confidence > 1)) e.push('confidence must be null or a number from 0 to 1');
  return { rule: e.length ? null : (r as unknown as Rule), errors: e };
}

export class RuleLoader {
  private dir: string; private cache: { stamp: string; rules: Rule[]; manifest: Manifest; issues: string[]; byId: Map<string, Rule> } | null = null;
  constructor(dir?: string) { this.dir = dir ?? process.env.AVARA_RULES_DIR ?? path.join(process.cwd(), 'src', 'rules'); }
  get directory() { return this.dir; }

  private stamp(files: string[]) { return files.map((f) => { const s = fs.statSync(path.join(this.dir, f)); return `${f}:${s.mtimeMs}:${s.size}`; }).join('|'); }
  /** Re-reads when any file changed (hot reload); otherwise serves the cache. */
  private load() {
    const files = fs.readdirSync(this.dir).filter((f) => f.endsWith('.json')).sort();
    const stamp = this.stamp(files);
    if (this.cache?.stamp === stamp) return this.cache;
    const issues: string[] = [];
    const manifest = JSON.parse(fs.readFileSync(path.join(this.dir, '_manifest.json'), 'utf8')) as Manifest;
    const cats = new Set(manifest.categories.map((c) => c.label));
    const rules: Rule[] = []; const byId = new Map<string, Rule>();
    for (const f of files.filter((x) => !x.startsWith('_'))) {
      let doc: { rules?: unknown[] };
      try { doc = JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8')); } catch (err) { issues.push(`${f}: not valid JSON (${(err as Error).message.slice(0, 80)})`); continue; }
      if (!Array.isArray(doc.rules)) { issues.push(`${f}: no "rules" array`); continue; }
      doc.rules.forEach((raw, i) => {
        const { rule, errors } = validateRule(raw, cats);
        const id = (raw as { ruleId?: string })?.ruleId ?? `#${i}`;
        if (!rule) { issues.push(`${f} ${id}: ${errors.join('; ')}`); return; }
        if (byId.has(rule.ruleId)) { issues.push(`${f} ${rule.ruleId}: duplicate ruleId (the first one is kept)`); return; }
        byId.set(rule.ruleId, rule); rules.push(rule);
      });
    }
    // Score admission (src/rules/_admissions.json): a rule moves a score only with a recorded admission for its exact id and version, naming
    // the verified source passage and a failing and a clean fixture. Without one, scoreEligible in the rule file is ignored and reported.
    let admitted = new Map<string, { version: string; passages: unknown[]; tests?: { fail?: string; clean?: string } }>();
    if (files.includes('_admissions.json')) {
      try { admitted = new Map((JSON.parse(fs.readFileSync(path.join(this.dir, '_admissions.json'), 'utf8')).rules ?? []).map((a: { ruleId: string }) => [a.ruleId, a])); }
      catch (err) { issues.push(`_admissions.json: not valid JSON (${(err as Error).message.slice(0, 80)})`); }
    }
    for (const r of rules) {
      if (!r.scoreEligible) continue;
      const a = admitted.get(r.ruleId);
      if (!a || a.version !== (r.version ?? '1') || !a.passages?.length || !a.tests?.fail || !a.tests?.clean) { r.scoreEligible = false; issues.push(`${r.ruleId}: scoreEligible without a recorded admission (verified passage plus failing and clean fixtures), so it is not scored`); }
    }
    this.cache = { stamp, rules, manifest, issues, byId };
    return this.cache;
  }
  /** Drop the cache so the next call re-reads every file. */
  reload() { this.cache = null; return this.load().rules.length; }
  get manifest(): Manifest { return this.load().manifest; }
  get issues(): string[] { return [...this.load().issues]; }
  loadAllRules(opts: { includeDisabled?: boolean } = {}): Rule[] { const r = this.load().rules; return opts.includeDisabled ? [...r] : r.filter((x) => x.enabled); }
  loadCategoryRules(category: string, opts: { includeDisabled?: boolean } = {}): Rule[] { return this.loadAllRules(opts).filter((r) => r.category === category); }
  getRuleById(id: string): Rule | undefined { return this.load().byId.get(id); }
}
let shared: RuleLoader | null = null;
/** The process-wide loader. Set AVARA_RULES_DIR to point it elsewhere. */
export const ruleLoader = () => (shared ??= new RuleLoader());
