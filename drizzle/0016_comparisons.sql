ALTER TABLE "flow_runs" ADD COLUMN IF NOT EXISTS "environment" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "flow_comparisons" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "flow_id" uuid NOT NULL REFERENCES "flows"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "published_run_id" uuid REFERENCES "flow_runs"("id") ON DELETE SET NULL,
  "preview_run_id" uuid REFERENCES "flow_runs"("id") ON DELETE SET NULL,
  "published_origin" text NOT NULL,
  "preview_origin" text NOT NULL,
  "verdict" text,
  "detail" jsonb,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "flow_comparisons_flow_idx" ON "flow_comparisons" ("flow_id", "created_at");
