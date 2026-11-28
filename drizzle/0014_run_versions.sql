ALTER TABLE "flow_runs" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "flow_proposals" ADD COLUMN IF NOT EXISTS "base_version" integer DEFAULT 1 NOT NULL;
