// Types for the dynamic rule engine. Rules are DATA (src/rules/*.json); nothing in the engine names a rule. The engine, its evaluators and its
// scorers read these shapes, so a new rule (or a thousand) is a JSON edit.

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type SourceType = 'standard' | 'research' | 'best-practice' | 'avara';
export type Mode = 'M' | 'H' | 'U' | 'R';   // measurable or mixed, heuristic, user/owner/assistive-technology session, rollup

export type EvaluatorSpec =
  | { type: 'detector'; detectors?: string[] }        // answered by measurements the scanner already took (axe, Lighthouse, Playwright probes)
  | { type: 'llm'; detectors?: string[] }             // answered by a model that is given THIS rule as data and the page context
  | { type: 'human'; session?: string }               // needs a person or an assistive-technology session
  | { type: 'rollup'; rollsUp?: string[] };           // a summary of other rules; adds no independent result or weight

export interface Rule {
  ruleId: string;
  category: string;
  title: string;
  description: string;
  source: string;
  sourceType: SourceType;
  sourceUrl: string;
  severity: Severity;
  weight: number;
  evaluationPrompt: string;
  recommendationTemplate: string;
  enabled: boolean;
  // Optional fields the engine understands when present. Rules without them still work.
  version?: string;
  mode?: Mode;
  evaluator?: EvaluatorSpec;
  advisory?: boolean;
  scoreEligible?: boolean;
  sourceSection?: string | null;
  sourceStatus?: 'verified-passage' | 'passage-unverified' | 'needs-owner-input';
  confidence?: number | null;            // editorial confidence in the SOURCE (nullable while unverified); a finding's confidence is separate
  confidenceBasis?: string | null;
  related?: string[]; lenses?: string[];
  recommendationTemplateStatus?: 'authored' | 'generic';
  // Customer-value fields. All optional: a rule without them still works and falls back to the category's wording.
  parameters?: Record<string, unknown>;     // thresholds and lexicons the rule's detector reads (data, not code)
  userImpact?: string; businessImpact?: string;   // authored, and labelled a hypothesis where inferred
  requiredEvidence?: string[];              // what a finding for this rule must be able to point at
  valueTier?: 1 | 2 | 3 | 4;               // 1 launch critical, 2 important, 3 nice to have, 4 low value (docs/rule-value-audit.md)
}

export interface Finding {
  findingId: string;
  ruleId: string;
  category: string;
  title: string;
  severity: string;
  score: number;            // 0 or 100 for one rule: how this rule fared
  passed: boolean;
  confidence: number;       // 0 to 1, this finding's own confidence (never the source's)
  evidence: string[];
  businessImpact: string;
  userImpact: string;
  recommendation: string;
  // Extras
  result: RuleResult; method: Method; observation: string; weight: number; advisory: boolean; source: string; sourceUrl: string; sourceStatus: string; ruleVersion: string;
}
export interface CategoryResult {
  category: string;
  score: number | null;     // null when nothing in the category could be decided
  findings: Finding[];
  // Extras
  scoreStatus: 'provisional' | 'final'; coverage: Coverage; counts: Record<RuleResult, number>; basis: { measured: number; aiAssisted: number }; weight: number; note: string;
}
export type RuleResult = 'observed_pass' | 'observed_failure' | 'needs_human_review' | 'inconclusive' | 'not_applicable' | 'not_run' | 'unimplemented';
export type Method = 'measured' | 'ai_assisted' | 'human' | 'rollup' | 'none';
export type Coverage = { rules: number; decided: number; weightDecided: number; weightTotal: number; pct: number };

/** Why a rule produced no decision. Each is a different situation and they are never merged: a missing detector is unbuilt work, missing AI is configuration,
 *  missing input means the scan did not capture what the detector reads, an analyzer error is a failure, and unknown_historical is an old scan that never saved it. */
export type SkipReason = 'missing_detector' | 'ai_unavailable' | 'missing_input' | 'not_applicable' | 'analyzer_error' | 'needs_person' | 'rollup_no_inputs' | 'unknown_historical';
export interface RuleOutcome { ruleId: string; result: RuleResult; method: Method; observation: string; evidence: string[]; confidence: number; reason?: string; skip?: SkipReason; detectorsRan?: string[]; userImpact?: string; businessImpact?: string }

/** What the evaluators are given. All of it comes from the scan; none of it is rules. */
export interface WebsiteContext {
  url: string; goal: string | null;
  screenshots: { viewport: string; mime: string; data: Buffer }[];
  pageContent: string;                         // visible text of the page
  metadata: Record<string, unknown>;           // title, meta description, headings, ctas, nav, forms, legal links, typography ...
  lighthouseResults: Record<string, unknown> | null;
  axeResults: Record<string, unknown> | null;
  /** Detector outputs by detector id. `ran` says the detector executed; `hits` are its failures or review items. */
  detectors: Record<string, DetectorReport>;
}
export interface DetectorHit { bucket: 'confirmed_failure' | 'needs_review'; title: string; summary: string; evidence: string[]; severity?: string }
export interface DetectorReport { ran: boolean; hits: DetectorHit[]; note?: string; notApplicable?: string; analyzerError?: boolean; passNote?: string }   // passNote: what a clean run actually checked, shown instead of the generic pass sentence   // analyzerError: it did not run because its analyzer failed (not because input was missing)   // notApplicable: the detector ran and the rule does not apply to this page

/** A language model, as the engine sees it. The engine never imports a vendor SDK. */
export interface LlmClient {
  model: string;
  evaluate(input: { system: string; rules: { ruleId: string; title: string; evaluationPrompt: string }[]; context: unknown; images?: WebsiteContext['screenshots'] }): Promise<LlmVerdict[]>;
  interpret?(input: { system: string; failures: { ruleId: string; title: string; observation: string; evidence: string[] }[]; context: unknown }): Promise<{ ruleId: string; userImpact: string; businessImpact: string }[]>;
}
export interface LlmVerdict { ruleId: string; result: 'pass' | 'fail' | 'inconclusive' | 'not_applicable'; observation: string; evidence: string[]; confidence: number }

export interface Manifest {
  schemaVersion: number; library: string; libraryVersion: string;
  categories: { id: string; label: string; code: string; weight: number; file: string; userImpact?: string; businessImpact?: string }[];
  exercisedDetectors?: string[];
}
export interface ReviewResult {
  rulesVersion: string; ranAt: string; categories: CategoryResult[];
  overall: { score: number | null; status: 'provisional' | 'final'; assessedCategories: number; totalCategories: number; weightAssessed: number; coveragePct: number; note: string };
  ai: { used: boolean; model?: string; reason?: string; rulesJudged: number };
  loaderIssues: string[];
  /** One record per loaded rule (the scan's rule snapshot), from RuleCoverage. Every coverage view is built from these. */
  executions?: import('./RuleCoverage.ts').RuleRecord[];
  /** AEO and passive-security results. Reported beside the scores, never inside them. */
  tracks?: { aeo: { id: string; title: string; status: 'pass' | 'flag' | 'unverified'; evidence: string; recommendation: string; source: string; advisory: boolean }[]; security: { id: string; title: string; status: 'pass' | 'flag' | 'unverified'; evidence: string; recommendation: string; source: string; advisory: boolean }[] };
}
