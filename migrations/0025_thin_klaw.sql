CREATE TABLE "inventory_lots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"received_date" date NOT NULL,
	"lot_no" text,
	"original_qty" numeric(18, 4) NOT NULL,
	"remaining_qty" numeric(18, 4) NOT NULL,
	"unit_cost" numeric(18, 8) NOT NULL,
	"source_type" text,
	"source_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_valuation" ADD COLUMN "costing_method" text DEFAULT 'average' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_lots_fifo_idx" ON "inventory_lots" USING btree ("company_id","product_id","received_date","id");