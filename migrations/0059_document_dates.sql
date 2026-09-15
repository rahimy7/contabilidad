-- Fecha fiscal del comprobante, separada del instante de emisión.
--
-- `emitted_at` es el momento real en que el sistema emitió el documento (lo que
-- e-CF necesita). Los formatos 606/607/608 y el IT-1 se declaran por la fecha
-- del comprobante: una factura de compra con fecha del día 1 recibida el día 3
-- pertenece al mes de su fecha, no al de su captura. Mezclar las dos cosas hacía
-- que una compra fechada el 1ro cayera en el mes anterior (medianoche UTC leída
-- en hora dominicana) y que cualquier documento con fecha pasada se declarara en
-- el mes en que alguien lo tecleó.

ALTER TABLE fiscal_documents ADD COLUMN IF NOT EXISTS document_date date;
--> statement-breakpoint
ALTER TABLE fiscal_documents ADD COLUMN IF NOT EXISTS payment_method text;
--> statement-breakpoint
ALTER TABLE fiscal_documents ADD COLUMN IF NOT EXISTS seller_user_id integer;
--> statement-breakpoint

UPDATE fiscal_documents d
   SET document_date = coalesce(
         (SELECT je.entry_date FROM journal_entries je WHERE je.id = d.journal_entry_id),
         (d.emitted_at AT TIME ZONE 'America/Santo_Domingo')::date,
         (d.created_at AT TIME ZONE 'America/Santo_Domingo')::date
       )
 WHERE document_date IS NULL;
--> statement-breakpoint

ALTER TABLE fiscal_documents ALTER COLUMN document_date SET DEFAULT ((now() AT TIME ZONE 'America/Santo_Domingo')::date);
--> statement-breakpoint
ALTER TABLE fiscal_documents ALTER COLUMN document_date SET NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS fiscal_documents_document_date_idx
    ON fiscal_documents (company_id, document_date);
--> statement-breakpoint

-- Numeración interna de documentos operativos (OC, recepciones, transferencias,
-- ajustes). Por empresa y ejercicio, asignada con un UPDATE ... RETURNING igual
-- que las NCF, para que dos usuarios nunca reciban el mismo número.
CREATE TABLE IF NOT EXISTS document_sequences (
    company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    doc_kind text NOT NULL,
    fiscal_year smallint NOT NULL,
    prefix text NOT NULL,
    next_number integer NOT NULL DEFAULT 1,
    PRIMARY KEY (company_id, doc_kind, fiscal_year)
);
--> statement-breakpoint
SELECT apply_tenant_policy('document_sequences');
