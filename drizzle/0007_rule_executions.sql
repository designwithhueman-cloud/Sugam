CREATE TABLE "rule_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"rule_id" text NOT NULL,
	"rule_version" text NOT NULL,
	"definition_hash" text,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"mode" text NOT NULL,
	"weight" integer NOT NULL,
	"session" text,
	"implementation" text NOT NULL,
	"execution" text NOT NULL,
	"reason" text,
	"evidence" jsonb NOT NULL,
	"outcome" text NOT NULL,
	"method" text NOT NULL,
	"scope" text NOT NULL,
	"score_eligible" boolean NOT NULL,
	"observation_only" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rule_executions" ADD CONSTRAINT "rule_executions_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rule_executions_scan_rule_uq" ON "rule_executions" USING btree ("scan_id","rule_id");
