CREATE TYPE "public"."confidence_level" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."finding_category" AS ENUM('accessibility', 'mobile', 'ux_workflow', 'performance');--> statement-breakpoint
CREATE TYPE "public"."priority_tier" AS ENUM('fix_immediately', 'fix_before_launch', 'improve_later');--> statement-breakpoint
CREATE TYPE "public"."rescan_outcome" AS ENUM('fixed', 'still_present', 'could_not_verify');--> statement-breakpoint
CREATE TABLE "finding_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"finding_id" uuid NOT NULL,
	"scan_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"viewport" text,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"product_id" uuid,
	"issue_id" uuid,
	"rule_id" text NOT NULL,
	"rule_version" text NOT NULL,
	"category" "finding_category" NOT NULL,
	"bucket" "finding_bucket" NOT NULL,
	"severity" "severity" NOT NULL,
	"confidence" "confidence_level" NOT NULL,
	"source_type" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"affects" text NOT NULL,
	"trying" text NOT NULL,
	"consequence" text NOT NULL,
	"consequence_kind" text NOT NULL,
	"goal_impact" text NOT NULL,
	"fingerprint" text NOT NULL,
	"repair_key" text NOT NULL,
	"verify" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_fixes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recommendation_id" uuid NOT NULL,
	"tool" text NOT NULL,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origin" text NOT NULL,
	"main_goal" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"tier" "priority_tier" NOT NULL,
	"title" text NOT NULL,
	"sentence" text NOT NULL,
	"repair_key" text NOT NULL,
	"categories" text[] NOT NULL,
	"finding_ids" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rescan_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"previous_scan_id" uuid NOT NULL,
	"finding_id" uuid NOT NULL,
	"recommendation_id" uuid,
	"outcome" "rescan_outcome" NOT NULL,
	"comparable" boolean NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" text NOT NULL,
	"version" text NOT NULL,
	"category" "finding_category" NOT NULL,
	"source_type" text NOT NULL,
	"source_url" text NOT NULL,
	"source_section" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "goal" text;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "rescan_of" uuid;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "analyzers" jsonb;--> statement-breakpoint
ALTER TABLE "finding_evidence" ADD CONSTRAINT "finding_evidence_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_evidence" ADD CONSTRAINT "finding_evidence_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_fixes" ADD CONSTRAINT "generated_fixes_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rescan_outcomes" ADD CONSTRAINT "rescan_outcomes_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finding_evidence_finding_idx" ON "finding_evidence" USING btree ("finding_id");--> statement-breakpoint
CREATE INDEX "findings_scan_idx" ON "findings" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX "findings_fp_idx" ON "findings" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "generated_fixes_rec_idx" ON "generated_fixes" USING btree ("recommendation_id");--> statement-breakpoint
CREATE INDEX "products_origin_idx" ON "products" USING btree ("origin");--> statement-breakpoint
CREATE INDEX "recommendations_scan_idx" ON "recommendations" USING btree ("scan_id","rank");--> statement-breakpoint
CREATE INDEX "rescan_outcomes_scan_idx" ON "rescan_outcomes" USING btree ("scan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rule_versions_uq" ON "rule_versions" USING btree ("rule_id","version");