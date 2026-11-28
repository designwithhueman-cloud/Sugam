CREATE TABLE IF NOT EXISTS "product_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" text NOT NULL,
  "scan_id" uuid NOT NULL REFERENCES "scans"("id") ON DELETE CASCADE,
  "finding_ref" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_events_once" ON "product_events" ("scan_id", "kind", "finding_ref");
