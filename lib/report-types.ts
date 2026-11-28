// Shapes passed from the server to the report UI (no server-only imports here).
import type { FixSet, ScanSummary } from './db/schema.ts';
export type Severity = 'critical' | 'serious' | 'moderate' | 'minor';
export type Bucket = 'confirmed_failure' | 'needs_review' | 'verified_pass';
/** desktop (1280px), mobile (the phone: 390px on new scans, 320px on scans made before the 390px phone) and narrow (the focused 320px pass). */
export type ViewportId = 'desktop' | 'mobile' | 'narrow';
export type ReportBox = { viewport: ViewportId; x: number; y: number; width: number; height: number; visible: boolean };
export type ReportInstance = { id: string; selector: string; html: string; detail: string | null; viewports: string[]; boxes: ReportBox[] };
export type ReportIssue = {
  id: string; position: number; ruleId: string; componentKey: string; source: string; bucket: Bucket; severity: Severity; title: string;
  wcag: { sc: string; name: string; level: string }[]; impactGroups: string[]; roleTag: 'design' | 'no_code' | 'dev';
  instanceCount: number; whatToChange: string; helpUrl?: string; fixes: FixSet | null; aiEnriched: boolean; instances: ReportInstance[];
};
export type ReportViewport = { viewport: ViewportId; viewportWidth: number; viewportHeight: number; pageWidth: number; pageHeight: number; truncated: boolean; screenshotUrl: string };
export type AvaraEvidence = { kind: 'dom' | 'measurement' | 'step' | 'metric'; viewport: string | null; data: Record<string, unknown> };
export type AvaraFinding = {
  id: string; ruleId: string; ruleVersion: string; ruleTitle: string; category: 'accessibility' | 'mobile' | 'ux_workflow' | 'performance'; bucket: Bucket; severity: Severity; confidence: 'high' | 'medium' | 'low';
  canonicalId: string | null; sourceType: string; sourceUrl: string; sourceSection: string; title: string; summary: string; affects: string; trying: string; consequence: string; consequenceKind: 'observed' | 'hypothesis';
  goalImpact: 'blocks' | 'hinders' | 'none'; issueId: string | null; evidence: AvaraEvidence[] | null;   // evidence is null where the plan keeps it back
};
export type AvaraFix = { tool: string; kind: string; content: string };
export type AvaraOwner = { id: string; title: string; why: string };
export type AvaraRecommendation = { owner: AvaraOwner | null; related: { id: string; title: string }[]; lenses: { lens: string; name: string }[]; scoring: { ruleId: string | null; weight: number; admitted: boolean; why: string }; id: string; rank: number; tier: 'fix_immediately' | 'fix_before_launch' | 'improve_later'; title: string; sentence: string; categories: string[]; findingIds: string[]; fixes: AvaraFix[] | null; fixLocked: boolean };
export type AvaraOutcome = { /** this outcome re-checks the previous scan's first fix (the one a Free plan opens) */ firstFix?: boolean; findingId: string; findingTitle: string; category: string; recommendationId: string | null; outcome: 'fixed' | 'still_present' | 'could_not_verify'; comparable: boolean; before: Record<string, unknown>; after: Record<string, unknown>; reason: string };
export type AvaraReport = {
  goal: string | null; analyzers: Record<string, { status: 'ok' | 'failed' | 'skipped'; message?: string; ms?: number }>; coverage: string[];
  recommendations: AvaraRecommendation[]; findings: AvaraFinding[];
  rescanOf: string | null; outcomes: AvaraOutcome[] | null; latestRescanId: string | null; leadIssueId: string | null;
  library: { catalogued: number; implemented: number; exercisedOnFixtures: number; executedOnUrl: number; scoreEligible: number; policy: string; coverageProfile: string; overall: number | null; overallRaw: number | null; contributing: number; scorable: number; overallWithheld: string | null; headline: string | null; ran: { id: string; title: string }[];
    needsPerson: { reviewTasks: number; personOnlyTopics: number; sessionKinds: string[]; reviewFindings: number; reviewRepairs: number; confirmedRepairs: number; repairGroups: number; ids: string[] };
    unverifiedSources: { key: string; name: string; url: string | null; topics: number }[];
    notRun: { total: number; reasons: Record<string, number>; unknown: number };
    /** Every rule of the scan's own snapshot that did not run (not_run or unimplemented), with its saved skip reason (null when none was saved). */
    notRunRules: { id: string; title: string; category: string; outcome: string; reason: string | null }[];
    strict: { code: string; label: string; status: 'scored' | 'insufficient' | 'observation' | 'not_applicable'; assessed: boolean; score: number | null; raw: number | null; weight: number; scoredRules: number; eligibleRules: number; passedWeight: number; evaluatedWeight: number; rules: { ruleId: string; weight: number; result: 'pass' | 'fail' }[]; missing: number; note?: string; observationsOnly: boolean }[];
    coverage: { origin: 'engine' | 'historical' | 'none'; snapshotSize: number; records: number; reconciles: boolean; problems: string[]; buckets: Record<string, number>; implementation: Record<string, number>;
      byCategory: { category: string; rules: number; ran: number; buckets: Record<string, number>; reasons: Record<string, number> }[]; cannotProve: string[] } };
};
export type ReviewFinding = { findingId: string; ruleId: string; title: string; severity: string; passed: boolean; result: string; method: string; confidence: number; observation: string; advisory: boolean; source: string; sourceUrl: string; sourceStatus: string; recommendation: string; businessImpact: string; userImpact: string; evidence: string[] };
export type ReviewReport = {
  rulesVersion: string; ranAt: string; ai: { used: boolean; model?: string; reason?: string; rulesJudged: number }; loaderIssues: string[]; locked: boolean;
  overall: { score: number | null; status: 'provisional' | 'final'; assessedCategories: number; coveragePct: number; note: string };
  categories: { category: string; score: number | null; status: 'provisional' | 'final'; weight: number; coveragePct: number; counts: Record<string, number>; basis: { measured: number; aiAssisted: number }; note: string; findings: ReviewFinding[] }[];
};
export type Report = {
  id: string; url: string; finalUrl: string | null; pageTitle: string | null; standard: string; standardLabel: string; standardNote: string;
  /** The strict-policy overall score (lib/avara/scoring.ts), never the legacy number on the scan row; null comes with scoreReason. */
  score: number | null; scoreReason?: string | null; summary: ScanSummary | null; engine: { axe: string; browser: string; viewports: string[] } | null;
  ai: { used: boolean; model?: string | null; reason?: string | null; pending?: boolean; fixes?: { state: 'pending' | 'done'; changed?: number; refused?: number; rubrics?: string[]; ms?: number | null } } | null; completedAt: string | null;
  /** The AI review is still running after the report was shown (report-first); the page refreshes itself when it finishes. */
  aiPending?: boolean;
  viewports: ReportViewport[]; issues: ReportIssue[];
  brand: { name: string; primary?: string | null } | null;
  avara?: AvaraReport | null;
  review?: ReviewReport | null;
  unlockedIssueId?: string | null;  // free plan: the one finding left fully open
  locked?: boolean;   // free plan: redacted on the server (no elements, screenshots or fixes)
  /** Avara Launch Scanner rows (paid plans only; null on the free plan and on scans made before the pack). */
  launch?: import('./launch/view.ts').LaunchReport;
  /** Score, totals and first fix (lib/page-summary.ts), computed before plan redaction: identical on Free and Paid. */
  pageSummary?: import('./page-summary.ts').PageSummary;
  /** Paid plans: the graded AI review per category (never part of the automated score). Absent on Free. */
  aiReview?: import('./avara/ai-review.ts').AiReview | null;
};
