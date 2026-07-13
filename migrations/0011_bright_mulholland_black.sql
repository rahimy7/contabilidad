CREATE TABLE "depreciation_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"asset_id" bigint NOT NULL,
	"fiscal_year" smallint NOT NULL,
	"period_no" smallint NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"journal_entry_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fixed_assets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"asset_account_code" text DEFAULT '1.2.01.001' NOT NULL,
	"accum_account_code" text DEFAULT '1.2.01.003' NOT NULL,
	"expense_account_code" text DEFAULT '5.2.03.001' NOT NULL,
	"acquisition_date" date NOT NULL,
	"cost" numeric(18, 4) NOT NULL,
	"residual_value" numeric(18, 4) DEFAULT '0' NOT NULL,
	"useful_life_months" integer NOT NULL,
	"method" text DEFAULT 'straight_line' NOT NULL,
	"accumulated_depreciation" numeric(18, 4) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"disposal_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "depreciation_entries" ADD CONSTRAINT "depreciation_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depreciation_entries" ADD CONSTRAINT "depreciation_entries_asset_id_fixed_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."fixed_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depreciation_entries" ADD CONSTRAINT "depreciation_entries_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "depreciation_entries_uq" ON "depreciation_entries" USING btree ("asset_id","fiscal_year","period_no");--> statement-breakpoint
CREATE INDEX "depreciation_entries_period_idx" ON "depreciation_entries" USING btree ("company_id","fiscal_year","period_no");--> statement-breakpoint
CREATE UNIQUE INDEX "fixed_assets_code_uq" ON "fixed_assets" USING btree ("company_id","code");