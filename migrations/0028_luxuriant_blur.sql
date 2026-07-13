DROP INDEX "inventory_lots_fifo_idx";--> statement-breakpoint
DROP INDEX "inventory_valuation_product_uq";--> statement-breakpoint
ALTER TABLE "inventory_cost_movements" ADD COLUMN "warehouse_id" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_lots" ADD COLUMN "warehouse_id" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_valuation" ADD COLUMN "warehouse_id" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "inventory_lots_fifo_idx" ON "inventory_lots" USING btree ("company_id","product_id","warehouse_id","received_date","id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_valuation_product_uq" ON "inventory_valuation" USING btree ("company_id","product_id","warehouse_id");