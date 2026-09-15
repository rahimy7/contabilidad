-- Una partida por cobrar o por pagar existe por su comprobante. Los comprobantes
-- no se borran en operación (se anulan, y la anulación cancela la partida), pero
-- cuando se purga un comprobante —datos de prueba, una empresa de demostración—
-- su partida y las aplicaciones sobre ella se van con él, igual que sus líneas.
ALTER TABLE ar_open_items DROP CONSTRAINT IF EXISTS ar_open_items_document_id_fiscal_documents_id_fk;
--> statement-breakpoint
ALTER TABLE ar_open_items ADD CONSTRAINT ar_open_items_document_id_fiscal_documents_id_fk
    FOREIGN KEY (document_id) REFERENCES fiscal_documents(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ap_open_items DROP CONSTRAINT IF EXISTS ap_open_items_document_id_fiscal_documents_id_fk;
--> statement-breakpoint
ALTER TABLE ap_open_items ADD CONSTRAINT ap_open_items_document_id_fiscal_documents_id_fk
    FOREIGN KEY (document_id) REFERENCES fiscal_documents(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ar_applications DROP CONSTRAINT IF EXISTS ar_applications_open_item_id_ar_open_items_id_fk;
--> statement-breakpoint
ALTER TABLE ar_applications ADD CONSTRAINT ar_applications_open_item_id_ar_open_items_id_fk
    FOREIGN KEY (open_item_id) REFERENCES ar_open_items(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ap_applications DROP CONSTRAINT IF EXISTS ap_applications_open_item_id_ap_open_items_id_fk;
--> statement-breakpoint
ALTER TABLE ap_applications ADD CONSTRAINT ap_applications_open_item_id_ap_open_items_id_fk
    FOREIGN KEY (open_item_id) REFERENCES ap_open_items(id) ON DELETE CASCADE;
