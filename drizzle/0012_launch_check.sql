CREATE TABLE IF NOT EXISTS "site_verifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "origin" text NOT NULL,
  "method" text NOT NULL,
  "verified_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "site_verifications_project_origin" ON "site_verifications" ("project_id", "origin");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exposure_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "active" boolean DEFAULT false NOT NULL,
  "results" jsonb NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exposure_runs_project_idx" ON "exposure_runs" ("project_id", "created_at");
