// Sugam database schema (PostgreSQL). Drizzle ORM; the same schema runs on a Postgres
// server (DATABASE_URL) or on embedded PGlite for local development.
import { pgTable, pgEnum, uuid, text, integer, real, boolean, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const complianceStandard = pgEnum('compliance_standard', ['wcag22aa', 'ada_title_ii', 'en_301_549', 'aoda']);
export const scanStatus = pgEnum('scan_status', ['queued', 'running', 'analyzing', 'completed', 'failed']);
export const scanEnvironment = pgEnum('scan_environment', ['adhoc', 'staging', 'live']);
export const viewportName = pgEnum('viewport_name', ['desktop', 'mobile']);
export const severity = pgEnum('severity', ['critical', 'serious', 'moderate', 'minor']);
export const findingBucket = pgEnum('finding_bucket', ['confirmed_failure', 'needs_review', 'verified_pass']);
export const findingSource = pgEnum('finding_source', ['axe', 'heuristic', 'keyboard']);
export const roleTag = pgEnum('role_tag', ['design', 'no_code', 'dev']);
export const findingCategory = pgEnum('finding_category', ['accessibility', 'mobile', 'ux_workflow', 'performance']);
export const confidenceLevel = pgEnum('confidence_level', ['high', 'medium', 'low']);
export const priorityTier = pgEnum('priority_tier', ['fix_immediately', 'fix_before_launch', 'improve_later']);
export const rescanOutcome = pgEnum('rescan_outcome', ['fixed', 'still_present', 'could_not_verify']);
export const exportKind = pgEnum('export_kind', ['pdf', 'docx', 'csv', 'sarif']);

const ts = (n: string) => timestamp(n, { withTimezone: true });

export const memberRole = pgEnum('member_role', ['owner', 'admin', 'member']);

// ---------- accounts ----------
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  name: text('name'),
  passwordHash: text('password_hash').notNull(),   // scrypt, "salt:hash" hex
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('users_email_uq').on(t.email)]);

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),          // sha-256 of the cookie value
  createdAt: ts('created_at').notNull().defaultNow(),
  expiresAt: ts('expires_at').notNull(),
}, (t) => [uniqueIndex('sessions_token_uq').on(t.tokenHash)]);

// ---------- agency workspace: Organization > Client > Project ----------
export const plan = pgEnum('plan', ['free', 'site', 'agency']);

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  // white-label branding for exports and shared client links
  brandName: text('brand_name'),
  brandLogoKey: text('brand_logo_key'),
  brandPrimaryColor: text('brand_primary_color'),
  brandAccentColor: text('brand_accent_color'),
  // Billing is not connected yet: set with scripts/set-plan.ts. Entitlements live in lib/entitlements.ts.
  plan: plan('plan').notNull().default('free'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('organizations_slug_uq').on(t.slug)]);

export const memberships = pgTable('memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: memberRole('role').notNull().default('member'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('memberships_uq').on(t.organizationId, t.userId)]);

export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('clients_org_idx').on(t.organizationId)]);

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  liveUrl: text('live_url'),
  stagingUrl: text('staging_url'),
  defaultStandard: complianceStandard('default_standard').notNull().default('wcag22aa'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('projects_client_idx').on(t.clientId)]);

// ---------- scans ----------
export const scans = pgTable('scans', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }), // null = personal ad-hoc scan
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  environment: scanEnvironment('environment').notNull().default('adhoc'),
  url: text('url').notNull(),
  finalUrl: text('final_url'),
  pageTitle: text('page_title'),
  standard: complianceStandard('standard').notNull().default('wcag22aa'),
  status: scanStatus('status').notNull().default('queued'),
  progress: jsonb('progress').$type<{ step: string; percent: number }>(),
  error: jsonb('error').$type<{ code: string; message: string }>(),
  // Sugam score: severity-weighted, for comparing scans of the same site. Not a compliance grade.
  score: integer('score'),
  summary: jsonb('summary').$type<ScanSummary>(),
  engine: jsonb('engine').$type<{ axe: string; browser: string; viewports: string[] }>(),
  ai: jsonb('ai').$type<{ used: boolean; model?: string; reason?: string }>(),
  // Avara: the product this scan belongs to, the goal the builder confirmed (optional), the scan this one re-checks, and how each analyzer fared.
  productId: uuid('product_id'),
  goal: text('goal'),
  rescanOf: uuid('rescan_of'),
  analyzers: jsonb('analyzers').$type<Record<string, { status: 'ok' | 'failed' | 'skipped'; message?: string; ms?: number }>>(),
  createdAt: ts('created_at').notNull().defaultNow(),
  startedAt: ts('started_at'),
  completedAt: ts('completed_at'),
}, (t) => [index('scans_project_idx').on(t.projectId, t.createdAt)]);

export type ScanSummary = {
  confirmed: Record<'critical' | 'serious' | 'moderate' | 'minor', number>;
  confirmedIssues: number; confirmedInstances: number; needsReview: number; verifiedPasses: number;
  coverage?: string[];   // Avara: what the extra checks covered and where they stopped
  limitations: string[];
};

// One row per viewport: screenshot, page dimensions, keyboard trace, raw axe output pointer.
export const scanViewports = pgTable('scan_viewports', {
  id: uuid('id').primaryKey().defaultRandom(),
  scanId: uuid('scan_id').notNull().references(() => scans.id, { onDelete: 'cascade' }),
  viewport: viewportName('viewport').notNull(),
  viewportWidth: integer('viewport_width').notNull(),
  viewportHeight: integer('viewport_height').notNull(),
  pageWidth: integer('page_width').notNull(),
  pageHeight: integer('page_height').notNull(),
  screenshotKey: text('screenshot_key').notNull(),     // object storage key (full page, CSS px = image px)
  screenshotTruncated: boolean('screenshot_truncated').notNull().default(false),
  rawAxeKey: text('raw_axe_key'),                       // full axe-core JSON for audit
  keyboardTrace: jsonb('keyboard_trace'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('scan_viewports_uq').on(t.scanId, t.viewport)]);

// A component-level issue: duplicate instances of the same rule on the same markup pattern
// are grouped (for example one product card missing alt text, 12 instances).
export const issues = pgTable('issues', {
  id: uuid('id').primaryKey().defaultRandom(),
  scanId: uuid('scan_id').notNull().references(() => scans.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),              // display order (also the pin number)
  ruleId: text('rule_id').notNull(),
  source: findingSource('source').notNull(),
  bucket: findingBucket('bucket').notNull(),
  severity: severity('severity').notNull(),
  title: text('title').notNull(),
  wcag: jsonb('wcag').$type<{ sc: string; name: string; level: string }[]>().notNull(),
  impactGroups: text('impact_groups').array().notNull(),   // visual, speech, keyboard, screen_reader, cognitive
  roleTag: roleTag('role_tag').notNull(),
  componentKey: text('component_key').notNull(),
  instanceCount: integer('instance_count').notNull(),
  whatToChange: text('what_to_change').notNull(),
  evidence: jsonb('evidence').$type<{ html?: string; selector?: string; detail?: string; helpUrl?: string }>(),
  fixes: jsonb('fixes').$type<FixSet>(),
  aiEnriched: boolean('ai_enriched').notNull().default(false),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('issues_scan_idx').on(t.scanId, t.position)]);

export type FixSet = {
  aiPrompt: Record<'lovable' | 'bolt' | 'v0' | 'cursor', string>;
  noCode: { framer: string[]; webflow: string[] };
  code: { language: 'html' | 'jsx' | 'css'; before: string; after: string; note?: string };
};

// Each affected element, with verbatim HTML as extracted from the page.
export const issueInstances = pgTable('issue_instances', {
  id: uuid('id').primaryKey().defaultRandom(),
  issueId: uuid('issue_id').notNull().references(() => issues.id, { onDelete: 'cascade' }),
  scanId: uuid('scan_id').notNull().references(() => scans.id, { onDelete: 'cascade' }),
  selector: text('selector').notNull(),
  html: text('html').notNull(),
  detail: text('detail'),
  viewports: text('viewports').array().notNull(),
}, (t) => [index('issue_instances_issue_idx').on(t.issueId)]);

// Element position in the full-page screenshot of a viewport (document coordinates, CSS px).
export const boundingBoxes = pgTable('bounding_boxes', {
  id: uuid('id').primaryKey().defaultRandom(),
  instanceId: uuid('instance_id').notNull().references(() => issueInstances.id, { onDelete: 'cascade' }),
  scanId: uuid('scan_id').notNull().references(() => scans.id, { onDelete: 'cascade' }),
  viewport: viewportName('viewport').notNull(),
  x: real('x').notNull(), y: real('y').notNull(), width: real('width').notNull(), height: real('height').notNull(),
  visible: boolean('visible').notNull().default(true),
}, (t) => [index('bounding_boxes_scan_idx').on(t.scanId, t.viewport)]);

// Human verification. A team member's decision on a finding, kept per project and component
// so it carries over to later scans of the same markup (no re-triaging the same false positive).
export const reviewDecision = pgEnum('review_decision', ['confirmed', 'not_an_issue']);
export const reviewDecisions = pgTable('review_decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  componentKey: text('component_key').notNull(),
  decision: reviewDecision('decision').notNull(),
  note: text('note'),
  decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: ts('decided_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('review_decisions_uq').on(t.projectId, t.componentKey)]);

// ---------- waiting list for plans that cannot be bought yet ----------
export const waitlist = pgTable('waitlist', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  plan: text('plan').notNull(),                  // 'site' | 'agency'
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('waitlist_email_plan_uq').on(t.email, t.plan)]);

// ---------- sharing and exports ----------
export const shareLinks = pgTable('share_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  scanId: uuid('scan_id').notNull().references(() => scans.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),              // sha-256 of the token; the token itself is never stored
  createdAt: ts('created_at').notNull().defaultNow(),
  expiresAt: ts('expires_at'),
  revokedAt: ts('revoked_at'),
}, (t) => [uniqueIndex('share_links_token_uq').on(t.tokenHash)]);

export const exports_ = pgTable('exports', {
  id: uuid('id').primaryKey().defaultRandom(),
  scanId: uuid('scan_id').notNull().references(() => scans.id, { onDelete: 'cascade' }),
  kind: exportKind('kind').notNull(),
  storageKey: text('storage_key').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

// ---------- Context Engine (Avara): product > scan > rule version > evidence > finding > recommendation > generated fix > rescan outcome ----------
// A product is one public site a person reviews (by origin), with the main goal they confirmed. Scans of it stay as they were; a rescan
// is a new scan that points back at the one it re-checks, so the original report is never rewritten.
export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  origin: text('origin').notNull(),
  mainGoal: text('main_goal'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('products_origin_idx').on(t.origin)]);

// A rule at a version, with where it comes from. Findings point at one version, so an old report keeps the rule text it was written with.
export const ruleVersions = pgTable('rule_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  ruleId: text('rule_id').notNull(),
  version: text('version').notNull(),
  category: findingCategory('category').notNull(),
  sourceType: text('source_type').notNull(),      // standard | vendor_guidance | tool_rule | usability_heuristic | sugam_check
  sourceUrl: text('source_url').notNull(),
  sourceSection: text('source_section').notNull(),
  title: text('title').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('rule_versions_uq').on(t.ruleId, t.version)]);

// One thing found on the page, in any category. Source type belongs to the rule; confidence belongs to this finding.
export const findings = pgTable('findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  scanId: uuid('scan_id').notNull().references(() => scans.id, { onDelete: 'cascade' }),
  productId: uuid('product_id'),
  issueId: uuid('issue_id'),                       // the accessibility issue row this finding was built from, if any
  ruleId: text('rule_id').notNull(),
  ruleVersion: text('rule_version').notNull(),
  category: findingCategory('category').notNull(),
  bucket: findingBucket('bucket').notNull(),
  severity: severity('severity').notNull(),
  confidence: confidenceLevel('confidence').notNull(),
  sourceType: text('source_type').notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),              // what was observed
  affects: text('affects').notNull(),              // who is affected
  trying: text('trying').notNull(),                // what they were trying to do
  consequence: text('consequence').notNull(),
  consequenceKind: text('consequence_kind').notNull(),   // observed | hypothesis
  goalImpact: text('goal_impact').notNull(),       // blocks | hinders | none
  fingerprint: text('fingerprint').notNull(),      // what makes it "the same finding" on a rescan
  repairKey: text('repair_key').notNull(),         // findings with the same key are fixed by one change
  verify: jsonb('verify').$type<Record<string, unknown> | null>(),   // how a rescan can re-check it
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('findings_scan_idx').on(t.scanId), index('findings_fp_idx').on(t.fingerprint)]);

export const findingEvidence = pgTable('finding_evidence', {
  id: uuid('id').primaryKey().defaultRandom(),
  findingId: uuid('finding_id').notNull().references(() => findings.id, { onDelete: 'cascade' }),
  scanId: uuid('scan_id').notNull().references(() => scans.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),                    // dom | measurement | step | metric
  viewport: text('viewport'),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('finding_evidence_finding_idx').on(t.findingId)]);

// An action to take: one or more findings that one change fixes, ranked within the scan.
export const recommendations = pgTable('recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  scanId: uuid('scan_id').notNull().references(() => scans.id, { onDelete: 'cascade' }),
  rank: integer('rank').notNull(),
  tier: priorityTier('tier').notNull(),
  title: text('title').notNull(),
  sentence: text('sentence').notNull(),
  repairKey: text('repair_key').notNull(),
  categories: text('categories').array().notNull(),
  findingIds: text('finding_ids').array().notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('recommendations_scan_idx').on(t.scanId, t.rank)]);

export const generatedFixes = pgTable('generated_fixes', {
  id: uuid('id').primaryKey().defaultRandom(),
  recommendationId: uuid('recommendation_id').notNull().references(() => recommendations.id, { onDelete: 'cascade' }),
  tool: text('tool').notNull(),                    // lovable | bolt | v0 | cursor | framer | webflow | code
  kind: text('kind').notNull(),                    // prompt | steps | patch
  content: text('content').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('generated_fixes_rec_idx').on(t.recommendationId)]);

// What a rescan found about one earlier finding. Fixed only when a comparable check confirms it; otherwise still present or could not verify.
export const rescanOutcomes = pgTable('rescan_outcomes', {
  id: uuid('id').primaryKey().defaultRandom(),
  scanId: uuid('scan_id').notNull().references(() => scans.id, { onDelete: 'cascade' }),          // the rescan
  previousScanId: uuid('previous_scan_id').notNull(),
  findingId: uuid('finding_id').notNull(),                                                         // the finding from the original scan
  recommendationId: uuid('recommendation_id'),
  outcome: rescanOutcome('outcome').notNull(),
  comparable: boolean('comparable').notNull(),
  before: jsonb('before').$type<Record<string, unknown>>().notNull(),
  after: jsonb('after').$type<Record<string, unknown>>().notNull(),
  reason: text('reason').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('rescan_outcomes_scan_idx').on(t.scanId)]);

// ---------- Rule engine (src/engines/rule-engine): rules are JSON files; these tables hold what a review used and produced ----------
// A snapshot of each rule definition a review ran, so an old report keeps the rule text it was judged against even after the JSON changes.
export const rulesTable = pgTable('rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  ruleId: text('rule_id').notNull(),
  version: text('version').notNull(),
  category: text('category').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  definition: jsonb('definition').$type<Record<string, unknown>>().notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('rules_rule_version_uq').on(t.ruleId, t.version)]);

// The engine's findings: one row per rule outcome that produced a finding (passes included, with passed = true).
export const ruleFindings = pgTable('rule_findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  scanId: uuid('scan_id').notNull().references(() => scans.id, { onDelete: 'cascade' }),
  productId: uuid('product_id'),
  findingId: text('finding_id').notNull(),
  ruleId: text('rule_id').notNull(),
  ruleVersion: text('rule_version').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  severity: text('severity').notNull(),
  score: integer('score').notNull(),
  passed: boolean('passed').notNull(),
  confidence: real('confidence').notNull(),
  result: text('result').notNull(),             // observed_pass | observed_failure | needs_human_review | inconclusive
  method: text('method').notNull(),             // measured | ai_assisted | human | rollup
  observation: text('observation').notNull(),
  recommendation: text('recommendation').notNull(),
  businessImpact: text('business_impact').notNull(),
  userImpact: text('user_impact').notNull(),
  advisory: boolean('advisory').notNull(),
  source: text('source').notNull(), sourceUrl: text('source_url').notNull(), sourceStatus: text('source_status').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('rule_findings_scan_idx').on(t.scanId), index('rule_findings_rule_idx').on(t.ruleId)]);

export const ruleEvidence = pgTable('rule_evidence', {
  id: uuid('id').primaryKey().defaultRandom(),
  ruleFindingId: uuid('rule_finding_id').notNull().references(() => ruleFindings.id, { onDelete: 'cascade' }),
  scanId: uuid('scan_id').notNull().references(() => scans.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  text: text('text').notNull(),
}, (t) => [index('rule_evidence_finding_idx').on(t.ruleFindingId)]);

export const categoryScores = pgTable('category_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  scanId: uuid('scan_id').notNull().references(() => scans.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  score: integer('score'),                       // null when nothing in the category could be decided
  status: text('status').notNull(),              // provisional | final
  weight: integer('weight').notNull(),
  coveragePct: integer('coverage_pct').notNull(),
  counts: jsonb('counts').$type<Record<string, number>>().notNull(),
  basis: jsonb('basis').$type<{ measured: number; aiAssisted: number }>().notNull(),
  note: text('note').notNull(),
}, (t) => [uniqueIndex('category_scores_uq').on(t.scanId, t.category)]);

export const scanResults = pgTable('scan_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  scanId: uuid('scan_id').notNull().unique().references(() => scans.id, { onDelete: 'cascade' }),
  rulesVersion: text('rules_version').notNull(),
  overallScore: integer('overall_score'),
  overallStatus: text('overall_status').notNull(),
  assessedCategories: integer('assessed_categories').notNull(),
  coveragePct: integer('coverage_pct').notNull(),
  note: text('note').notNull(),
  ai: jsonb('ai').$type<{ used: boolean; model?: string; reason?: string; rulesJudged: number }>().notNull(),
  loaderIssues: jsonb('loader_issues').$type<string[]>().notNull(),
  ranAt: ts('ran_at').notNull(),
});

// One record per rule per scan: the scan's rule snapshot and what happened to each rule. Every coverage count is built from these rows.
// Scans saved before this table existed have none; their records are derived at read time from rule_findings and marked unknown where evidence is missing.
export const ruleExecutions = pgTable('rule_executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  scanId: uuid('scan_id').notNull().references(() => scans.id, { onDelete: 'cascade' }),
  ruleId: text('rule_id').notNull(),
  ruleVersion: text('rule_version').notNull(),
  definitionHash: text('definition_hash'),
  category: text('category').notNull(),
  title: text('title').notNull(),
  mode: text('mode').notNull(),
  weight: integer('weight').notNull(),
  session: text('session'),
  implementation: text('implementation').notNull(),   // detector | detector_and_ai | ai_only | person_only | rollup | not_built
  execution: text('execution').notNull(),             // ran | not_applicable | skipped | unknown
  reason: text('reason'),                             // missing_detector | ai_unavailable | missing_input | not_applicable | analyzer_error | needs_person | rollup_no_inputs
  evidence: jsonb('evidence').$type<string[]>().notNull(),
  outcome: text('outcome').notNull(),
  method: text('method').notNull(),
  scope: text('scope').notNull(),                     // full | measurable_part | summary | none
  scoreEligible: boolean('score_eligible').notNull(),
  observationOnly: boolean('observation_only').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('rule_executions_scan_rule_uq').on(t.scanId, t.ruleId)]);

// What Avara has learned: facts worth keeping from each scan, and patterns computed across scans. Patterns only ever come from stored scans.
export const knowledge = pgTable('knowledge', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(),                  // product | finding | recommendation | note
  key: text('key').notNull(),
  text: text('text').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  productId: uuid('product_id'),
  scanId: uuid('scan_id').references(() => scans.id, { onDelete: 'cascade' }),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('knowledge_kind_idx').on(t.kind, t.key)]);

export const patterns = pgTable('patterns', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  description: text('description').notNull(),
  lowCategory: text('low_category').notNull(),   // the condition: this category scored low
  ruleId: text('rule_id').notNull(),             // the outcome: this rule failed
  support: integer('support').notNull(),         // scans with the condition where the rule failed
  total: integer('total').notNull(),             // scans with the condition
  rate: real('rate').notNull(),
  status: text('status').notNull(),              // emerging (too few scans) | established
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
