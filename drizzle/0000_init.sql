CREATE TYPE "public"."compliance_standard" AS ENUM('wcag22aa', 'ada_title_ii', 'en_301_549', 'aoda');--> statement-breakpoint
CREATE TYPE "public"."export_kind" AS ENUM('pdf', 'docx', 'csv', 'sarif');--> statement-breakpoint
CREATE TYPE "public"."finding_bucket" AS ENUM('confirmed_failure', 'needs_review', 'verified_pass');--> statement-breakpoint
CREATE TYPE "public"."finding_source" AS ENUM('axe', 'heuristic', 'keyboard');--> statement-breakpoint
CREATE TYPE "public"."role_tag" AS ENUM('design', 'no_code', 'dev');--> statement-breakpoint
CREATE TYPE "public"."scan_environment" AS ENUM('adhoc', 'staging', 'live');--> statement-breakpoint
CREATE TYPE "public"."scan_status" AS ENUM('queued', 'running', 'analyzing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('critical', 'serious', 'moderate', 'minor');--> statement-breakpoint
CREATE TYPE "public"."viewport_name" AS ENUM('desktop', 'mobile');--> statement-breakpoint
CREATE TABLE "bounding_boxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"scan_id" uuid NOT NULL,
	"viewport" "viewport_name" NOT NULL,
	"x" real NOT NULL,
	"y" real NOT NULL,
	"width" real NOT NULL,
	"height" real NOT NULL,
	"visible" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"kind" "export_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"scan_id" uuid NOT NULL,
	"selector" text NOT NULL,
	"html" text NOT NULL,
	"detail" text,
	"viewports" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"rule_id" text NOT NULL,
	"source" "finding_source" NOT NULL,
	"bucket" "finding_bucket" NOT NULL,
	"severity" "severity" NOT NULL,
	"title" text NOT NULL,
	"wcag" jsonb NOT NULL,
	"impact_groups" text[] NOT NULL,
	"role_tag" "role_tag" NOT NULL,
	"component_key" text NOT NULL,
	"instance_count" integer NOT NULL,
	"what_to_change" text NOT NULL,
	"evidence" jsonb,
	"fixes" jsonb,
	"ai_enriched" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"brand_name" text,
	"brand_logo_key" text,
	"brand_primary_color" text,
	"brand_accent_color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"live_url" text,
	"staging_url" text,
	"default_standard" "compliance_standard" DEFAULT 'wcag22aa' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_viewports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"viewport" "viewport_name" NOT NULL,
	"viewport_width" integer NOT NULL,
	"viewport_height" integer NOT NULL,
	"page_width" integer NOT NULL,
	"page_height" integer NOT NULL,
	"screenshot_key" text NOT NULL,
	"screenshot_truncated" boolean DEFAULT false NOT NULL,
	"raw_axe_key" text,
	"keyboard_trace" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"environment" "scan_environment" DEFAULT 'adhoc' NOT NULL,
	"url" text NOT NULL,
	"final_url" text,
	"page_title" text,
	"standard" "compliance_standard" DEFAULT 'wcag22aa' NOT NULL,
	"status" "scan_status" DEFAULT 'queued' NOT NULL,
	"progress" jsonb,
	"error" jsonb,
	"score" integer,
	"summary" jsonb,
	"engine" jsonb,
	"ai" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "bounding_boxes" ADD CONSTRAINT "bounding_boxes_instance_id_issue_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."issue_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bounding_boxes" ADD CONSTRAINT "bounding_boxes_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_instances" ADD CONSTRAINT "issue_instances_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_instances" ADD CONSTRAINT "issue_instances_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_viewports" ADD CONSTRAINT "scan_viewports_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bounding_boxes_scan_idx" ON "bounding_boxes" USING btree ("scan_id","viewport");--> statement-breakpoint
CREATE INDEX "clients_org_idx" ON "clients" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "issue_instances_issue_idx" ON "issue_instances" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issues_scan_idx" ON "issues" USING btree ("scan_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_uq" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "projects_client_idx" ON "projects" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scan_viewports_uq" ON "scan_viewports" USING btree ("scan_id","viewport");--> statement-breakpoint
CREATE INDEX "scans_project_idx" ON "scans" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_token_uq" ON "share_links" USING btree ("token_hash");