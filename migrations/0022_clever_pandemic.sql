CREATE TABLE "inventory_cost_movements" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"movement_date" date NOT NULL,
	"kind" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_cost" numeric(18, 8) NOT NULL,
	"total_cost" numeric(18, 4) NOT NULL,
	"balance_qty" numeric(18, 4) NOT NULL,
	"balance_value" numeric(18, 4) NOT NULL,
	"source_type" text,
	"source_id" text,
	"journal_entry_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_valuation" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity_on_hand" numeric(18, 4) DEFAULT '0' NOT NULL,
	"average_cost" numeric(18, 8) DEFAULT '0' NOT NULL,
	"total_value" numeric(18, 4) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_cost_movements" ADD CONSTRAINT "inventory_cost_movements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_cost_movements" ADD CONSTRAINT "inventory_cost_movements_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_valuation" ADD CONSTRAINT "inventory_valuation_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_cost_movements_product_idx" ON "inventory_cost_movements" USING btree ("company_id","product_id","movement_date");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_valuation_product_uq" ON "inventory_valuation" USING btree ("company_id","product_id");