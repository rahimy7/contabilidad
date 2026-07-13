CREATE TABLE "journal_entry_sequences" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"fiscal_year" smallint NOT NULL,
	"next_number" bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journal_entry_sequences" ADD CONSTRAINT "journal_entry_sequences_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entry_sequences_uq" ON "journal_entry_sequences" USING btree ("company_id","fiscal_year");