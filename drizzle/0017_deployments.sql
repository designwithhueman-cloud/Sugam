ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "deploy_token_hash" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deployment_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "deployment_id" text NOT NULL,
  "published_origin" text NOT NULL,
  "preview_origin" text NOT NULL,
  "skipped" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "deployment_events_project_deployment" ON "deployment_events" ("project_id", "deployment_id");
--> statement-breakpoint
ALTER TABLE "flow_comparisons" ADD COLUMN IF NOT EXISTS "deployment_event_id" uuid REFERENCES "deployment_events"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "flow_comparisons" ADD COLUMN IF NOT EXISTS "claimed_by" text;
--> statement-breakpoint
ALTER TABLE "flow_comparisons" ADD COLUMN IF NOT EXISTS "claimed_at" timestamp with time zone;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "flow_comparisons_flow_deployment" ON "flow_comparisons" ("flow_id", "deployment_event_id");
