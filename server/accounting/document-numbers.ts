import { SqlClient } from "./types";

/**
 * Internal numbering for operational documents: purchase orders, receipts,
 * transfers, adjustments, payroll runs.
 *
 * Same technique as NCF and journal-entry numbers: the counter row is created on
 * first use and advanced with a single UPDATE ... RETURNING, which takes the row
 * lock, so two users creating a purchase order at the same moment serialize
 * instead of both reading `max + 1`. Runs in the caller's transaction: a rolled
 * back document gives its number back.
 */
export type DocumentKind = "purchase_order" | "purchase_receipt" | "transfer" | "adjustment" | "purchase_return";

const PREFIX: Record<DocumentKind, string> = {
  purchase_order: "OC",
  purchase_receipt: "REC",
  transfer: "TRF",
  adjustment: "AJU",
  purchase_return: "DEV",
};

export async function nextDocumentNumber(
  client: SqlClient,
  companyId: number,
  kind: DocumentKind,
  year: number,
): Promise<string> {
  const prefix = PREFIX[kind];
  await client.query(
    `INSERT INTO document_sequences (company_id, doc_kind, fiscal_year, prefix, next_number)
     VALUES ($1,$2,$3,$4,1)
     ON CONFLICT (company_id, doc_kind, fiscal_year) DO NOTHING`,
    [companyId, kind, year, prefix],
  );
  const { rows } = await client.query(
    `UPDATE document_sequences SET next_number = next_number + 1
      WHERE company_id=$1 AND doc_kind=$2 AND fiscal_year=$3
      RETURNING next_number - 1 AS n, prefix`,
    [companyId, kind, year],
  );
  const n = Number(rows[0].n);
  // The company id is part of the number: legacy tables such as purchase_orders
  // carry a globally unique number, and two tenants both start at 1.
  return `${rows[0].prefix}-${companyId}-${year}-${String(n).padStart(6, "0")}`;
}
