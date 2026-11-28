ALTER TABLE "flows" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "flows" ADD COLUMN IF NOT EXISTS "journey_key" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "flow_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "flow_id" uuid NOT NULL REFERENCES "flows"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "definition" jsonb NOT NULL,
  "note" text,
  "approved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "approved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "flow_versions_flow_version" ON "flow_versions" ("flow_id", "version");
--> statement-breakpoint
INSERT INTO "flow_versions" ("flow_id", "version", "definition", "note", "approved_by") SELECT "id", 1, "definition", 'Saved before versions existed', "created_by" FROM "flows" WHERE NOT EXISTS (SELECT 1 FROM "flow_versions" v WHERE v."flow_id" = "flows"."id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "flow_discoveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "start_url" text NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "result" jsonb,
  "error" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "flow_discoveries_project_idx" ON "flow_discoveries" ("project_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "flow_proposals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "flow_id" uuid NOT NULL REFERENCES "flows"("id") ON DELETE CASCADE,
  "discovery_id" uuid REFERENCES "flow_discoveries"("id") ON DELETE SET NULL,
  "kind" text NOT NULL,
  "proposed" jsonb,
  "reason" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "flow_proposals_flow_idx" ON "flow_proposals" ("flow_id", "status");
