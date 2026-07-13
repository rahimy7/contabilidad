CREATE TABLE "consolidation_rates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" bigint NOT NULL,
	"company_id" integer NOT NULL,
	"currency" char(3) DEFAULT 'DOP' NOT NULL,
	"closing_rate" numeric(18, 8) DEFAULT '1' NOT NULL,
	"average_rate" numeric(18, 8) DEFAULT '1' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consolidation_rates" ADD CONSTRAINT "consolidation_rates_run_id_consolidation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."consolidation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consolidation_rates" ADD CONSTRAINT "consolidation_rates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consolidation_rates_run_idx" ON "consolidation_rates" USING btree ("run_id");