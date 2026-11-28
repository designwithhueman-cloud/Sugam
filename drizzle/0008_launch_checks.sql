CREATE TABLE "launch_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"entry" text NOT NULL,
	"pack_rule_id" text NOT NULL,
	"host_rule_id" text NOT NULL,
	"rule_version" text NOT NULL,
	"pack_version" text NOT NULL,
	"decision" text NOT NULL,
	"viewport" text NOT NULL,
	"viewport_size" jsonb,
	"page_state" text NOT NULL,
	"target" text,
	"outcome" text NOT NULL,
	"reason" text NOT NULL,
	"needs" text,
	"evidence" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "launch_checks" ADD CONSTRAINT "launch_checks_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "launch_checks_scan_idx" ON "launch_checks" USING btree ("scan_id");
