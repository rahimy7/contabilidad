CREATE TABLE "foreign_payments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"beneficiary_name" text NOT NULL,
	"country" text,
	"income_type" text DEFAULT 'servicios' NOT NULL,
	"payment_date" date NOT NULL,
	"gross_amount" numeric(18, 4) NOT NULL,
	"isr_rate" numeric(7, 4) DEFAULT '0.27' NOT NULL,
	"isr_retained" numeric(18, 4) NOT NULL,
	"expense_account_ref" text DEFAULT '5.2.02.003' NOT NULL,
	"payment_account_ref" text DEFAULT '1.1.01.003' NOT NULL,
	"memo" text,
	"reference" text,
	"journal_entry_id" bigint,
	"status" text DEFAULT 'posted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "foreign_payments" ADD CONSTRAINT "foreign_payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foreign_payments" ADD CONSTRAINT "foreign_payments_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "foreign_payments_date_idx" ON "foreign_payments" USING btree ("company_id","payment_date");