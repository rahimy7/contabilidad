CREATE TABLE "consolidation_lines" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" bigint NOT NULL,
	"group_id" integer NOT NULL,
	"account_code" text NOT NULL,
	"account_name" text NOT NULL,
	"account_type" text NOT NULL,
	"debit" numeric(18, 4) DEFAULT '0' NOT NULL,
	"credit" numeric(18, 4) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consolidation_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"fiscal_year" smallint NOT NULL,
	"period_no" smallint,
	"base_currency" char(3) DEFAULT 'DOP' NOT NULL,
	"status" text DEFAULT 'final' NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer
);
--> statement-breakpoint
ALTER TABLE "consolidation_lines" ADD CONSTRAINT "consolidation_lines_run_id_consolidation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."consolidation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consolidation_runs" ADD CONSTRAINT "consolidation_runs_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consolidation_lines_run_idx" ON "consolidation_lines" USING btree ("run_id","account_code");--> statement-breakpoint
CREATE INDEX "consolidation_runs_group_idx" ON "consolidation_runs" USING btree ("group_id","fiscal_year");