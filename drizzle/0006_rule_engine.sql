CREATE TABLE "category_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"category" text NOT NULL,
	"score" integer,
	"status" text NOT NULL,
	"weight" integer NOT NULL,
	"coverage_pct" integer NOT NULL,
	"counts" jsonb NOT NULL,
	"basis" jsonb NOT NULL,
	"note" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"text" text NOT NULL,
	"data" jsonb NOT NULL,
	"product_id" uuid,
	"scan_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"description" text NOT NULL,
	"low_category" text NOT NULL,
	"rule_id" text NOT NULL,
	"support" integer NOT NULL,
	"total" integer NOT NULL,
	"rate" real NOT NULL,
	"status" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patterns_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "rule_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_finding_id" uuid NOT NULL,
	"scan_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"product_id" uuid,
	"finding_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"rule_version" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"severity" text NOT NULL,
	"score" integer NOT NULL,
	"passed" boolean NOT NULL,
	"confidence" real NOT NULL,
	"result" text NOT NULL,
	"method" text NOT NULL,
	"observation" text NOT NULL,
	"recommendation" text NOT NULL,
	"business_impact" text NOT NULL,
	"user_impact" text NOT NULL,
	"advisory" boolean NOT NULL,
	"source" text NOT NULL,
	"source_url" text NOT NULL,
	"source_status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" text NOT NULL,
	"version" text NOT NULL,
	"category" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"rules_version" text NOT NULL,
	"overall_score" integer,
	"overall_status" text NOT NULL,
	"assessed_categories" integer NOT NULL,
	"coverage_pct" integer NOT NULL,
	"note" text NOT NULL,
	"ai" jsonb NOT NULL,
	"loader_issues" jsonb NOT NULL,
	"ran_at" timestamp with time zone NOT NULL,
	CONSTRAINT "scan_results_scan_id_unique" UNIQUE("scan_id")
);
--> statement-breakpoint
ALTER TABLE "category_scores" ADD CONSTRAINT "category_scores_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge" ADD CONSTRAINT "knowledge_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_evidence" ADD CONSTRAINT "rule_evidence_rule_finding_id_rule_findings_id_fk" FOREIGN KEY ("rule_finding_id") REFERENCES "public"."rule_findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_evidence" ADD CONSTRAINT "rule_evidence_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_findings" ADD CONSTRAINT "rule_findings_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_results" ADD CONSTRAINT "scan_results_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_scores_uq" ON "category_scores" USING btree ("scan_id","category");--> statement-breakpoint
CREATE INDEX "knowledge_kind_idx" ON "knowledge" USING btree ("kind","key");--> statement-breakpoint
CREATE INDEX "rule_evidence_finding_idx" ON "rule_evidence" USING btree ("rule_finding_id");--> statement-breakpoint
CREATE INDEX "rule_findings_scan_idx" ON "rule_findings" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX "rule_findings_rule_idx" ON "rule_findings" USING btree ("rule_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rules_rule_version_uq" ON "rules" USING btree ("rule_id","version");