-- Las tablas nuevas de auxiliares siguen la regla de sus hermanas
-- (ar_open_items, ap_open_items): al eliminar una empresa se eliminan con ella.
-- Con RESTRICT, borrar una empresa de prueba o de demostración fallaba por
-- filas que nadie más referencia.
ALTER TABLE ar_adjustments DROP CONSTRAINT IF EXISTS ar_adjustments_company_id_fkey;
--> statement-breakpoint
ALTER TABLE ar_adjustments ADD CONSTRAINT ar_adjustments_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ap_adjustments DROP CONSTRAINT IF EXISTS ap_adjustments_company_id_fkey;
--> statement-breakpoint
ALTER TABLE ap_adjustments ADD CONSTRAINT ap_adjustments_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE purchase_receipt_lines DROP CONSTRAINT IF EXISTS purchase_receipt_lines_company_id_fkey;
--> statement-breakpoint
ALTER TABLE purchase_receipt_lines ADD CONSTRAINT purchase_receipt_lines_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE purchase_receipts DROP CONSTRAINT IF EXISTS purchase_receipts_company_id_fkey;
--> statement-breakpoint
ALTER TABLE purchase_receipts ADD CONSTRAINT purchase_receipts_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE supplier_invoice_matches DROP CONSTRAINT IF EXISTS supplier_invoice_matches_company_id_fkey;
--> statement-breakpoint
ALTER TABLE supplier_invoice_matches ADD CONSTRAINT supplier_invoice_matches_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
--> statement-breakpoint
-- Un movimiento operativo de inventario de una empresa se va con ella; el de la
-- tienda heredada (sin empresa) queda.
ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_company_id_fkey;
--> statement-breakpoint
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
