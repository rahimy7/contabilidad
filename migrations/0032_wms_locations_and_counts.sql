CREATE TABLE "inventory_count_lines" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"count_id" bigint NOT NULL,
	"product_id" integer NOT NULL,
	"product_name" text,
	"sku" text,
	"location_id" bigint,
	"location_code" text,
	"placement_id" bigint,
	"lot_no" text,
	"expiration_date" date,
	"expected_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"counted_qty" numeric(18, 4),
	"recount_qty" numeric(18, 4),
	"variance" numeric(18, 4) DEFAULT '0' NOT NULL,
	"unit_cost" numeric(18, 8) DEFAULT '0' NOT NULL,
	"variance_value" numeric(18, 4) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"notes" text,
	"counted_by" integer,
	"counted_at" timestamp with time zone,
	"movement_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_counts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"warehouse_id" integer NOT NULL,
	"count_no" text NOT NULL,
	"name" text,
	"count_type" text DEFAULT 'cycle' NOT NULL,
	"is_blind" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"location_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"product_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scheduled_date" date,
	"count_date" date NOT NULL,
	"total_lines" integer DEFAULT 0 NOT NULL,
	"counted_lines" integer DEFAULT 0 NOT NULL,
	"variance_lines" integer DEFAULT 0 NOT NULL,
	"surplus_value" numeric(18, 4) DEFAULT '0' NOT NULL,
	"shortage_value" numeric(18, 4) DEFAULT '0' NOT NULL,
	"net_value" numeric(18, 4) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_by" integer,
	"reviewed_by" integer,
	"applied_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"counted_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"journal_entry_id" bigint
);
--> statement-breakpoint
CREATE TABLE "inventory_location_moves" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"warehouse_id" integer NOT NULL,
	"from_location_id" bigint,
	"to_location_id" bigint,
	"kind" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"lot_no" text,
	"expiration_date" date,
	"source_type" text,
	"source_id" text,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_placements" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"warehouse_id" integer NOT NULL,
	"location_id" bigint NOT NULL,
	"lot_id" bigint,
	"lot_no" text,
	"expiration_date" date,
	"received_date" date NOT NULL,
	"quantity" numeric(18, 4) DEFAULT '0' NOT NULL,
	"reserved_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"unit_cost" numeric(18, 8) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_locations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"warehouse_id" integer NOT NULL,
	"code" text NOT NULL,
	"name" text,
	"barcode" text,
	"kind" text DEFAULT 'picking' NOT NULL,
	"zone" text,
	"aisle" text,
	"rack" text,
	"level" text,
	"position" text,
	"pick_priority" integer DEFAULT 100 NOT NULL,
	"is_pickable" boolean DEFAULT true NOT NULL,
	"allow_mixed_products" boolean DEFAULT true NOT NULL,
	"max_qty" numeric(18, 4),
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "warehouses" ADD COLUMN "wms_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouses" ADD COLUMN "rotation_policy" text DEFAULT 'fifo' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouses" ADD COLUMN "require_location_on_receipt" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_lots" ADD COLUMN "expiration_date" date;--> statement-breakpoint
ALTER TABLE "inventory_count_lines" ADD CONSTRAINT "inventory_count_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_count_lines" ADD CONSTRAINT "inventory_count_lines_count_id_inventory_counts_id_fk" FOREIGN KEY ("count_id") REFERENCES "public"."inventory_counts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_count_lines" ADD CONSTRAINT "inventory_count_lines_location_id_warehouse_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."warehouse_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_count_lines" ADD CONSTRAINT "inventory_count_lines_placement_id_inventory_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."inventory_placements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_location_moves" ADD CONSTRAINT "inventory_location_moves_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_location_moves" ADD CONSTRAINT "inventory_location_moves_from_location_id_warehouse_locations_id_fk" FOREIGN KEY ("from_location_id") REFERENCES "public"."warehouse_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_location_moves" ADD CONSTRAINT "inventory_location_moves_to_location_id_warehouse_locations_id_fk" FOREIGN KEY ("to_location_id") REFERENCES "public"."warehouse_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_placements" ADD CONSTRAINT "inventory_placements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_placements" ADD CONSTRAINT "inventory_placements_location_id_warehouse_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."warehouse_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_placements" ADD CONSTRAINT "inventory_placements_lot_id_inventory_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."inventory_lots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_locations" ADD CONSTRAINT "warehouse_locations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_count_lines_count_idx" ON "inventory_count_lines" USING btree ("count_id","location_id","product_id");--> statement-breakpoint
CREATE INDEX "inventory_count_lines_status_idx" ON "inventory_count_lines" USING btree ("company_id","count_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_counts_no_uq" ON "inventory_counts" USING btree ("company_id","count_no");--> statement-breakpoint
CREATE INDEX "inventory_counts_wh_idx" ON "inventory_counts" USING btree ("company_id","warehouse_id","status");--> statement-breakpoint
CREATE INDEX "inventory_location_moves_wh_idx" ON "inventory_location_moves" USING btree ("company_id","warehouse_id","created_at");--> statement-breakpoint
CREATE INDEX "inventory_location_moves_product_idx" ON "inventory_location_moves" USING btree ("company_id","product_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_placements_bin_uq" ON "inventory_placements" USING btree ("company_id","warehouse_id","location_id","product_id","status",coalesce("lot_no", ''),coalesce("expiration_date", DATE '0001-01-01'));--> statement-breakpoint
CREATE INDEX "inventory_placements_pick_idx" ON "inventory_placements" USING btree ("company_id","product_id","warehouse_id","expiration_date","received_date");--> statement-breakpoint
CREATE INDEX "inventory_placements_location_idx" ON "inventory_placements" USING btree ("company_id","location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_locations_code_uq" ON "warehouse_locations" USING btree ("company_id","warehouse_id","code");--> statement-breakpoint
CREATE INDEX "warehouse_locations_route_idx" ON "warehouse_locations" USING btree ("company_id","warehouse_id","pick_priority","code");--> statement-breakpoint
CREATE INDEX "inventory_lots_fefo_idx" ON "inventory_lots" USING btree ("company_id","product_id","warehouse_id","expiration_date","id");