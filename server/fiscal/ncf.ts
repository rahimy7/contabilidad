import { SqlClient } from "../accounting/types";

/**
 * NCF and e-CF numbering.
 *
 * Legacy comprobantes are a 3-character prefix plus 8 digits (`B0100000001`,
 * 11 chars). Electronic ones are a prefix plus 10 digits (`E310000000001`,
 * 13 chars). Getting the width wrong produces a string DGII silently rejects
 * months later, so the widths live here and nowhere else.
 */

export const ECF_PREFIXES = ["E31", "E32", "E33", "E34", "E41", "E43", "E44", "E45", "E46", "E47"] as const;

export const isEcfType = (ncfType: string): boolean =>
  (ECF_PREFIXES as readonly string[]).includes(ncfType);

export const ncfWidth = (ncfType: string): number => (isEcfType(ncfType) ? 10 : 8);

export function formatNcf(ncfType: string, sequence: number | bigint): string {
  return ncfType + String(sequence).padStart(ncfWidth(ncfType), "0");
}

export class NcfExhaustedError extends Error {
  constructor(readonly ncfType: string) {
    super(
      `no active, unexpired NCF sequence with numbers left for type ${ncfType}. ` +
        `Authorize a new range with DGII, or switch to contingency.`,
    );
    this.name = "NcfExhaustedError";
  }
}

export interface NcfAllocation {
  sequenceId: number;
  number: number;
  ncf: string;
  isEcf: boolean;
}

/**
 * Takes the next comprobante for a type, atomically.
 *
 * Must run inside the transaction that persists the document. The number is
 * reserved by an UPDATE and only becomes real at COMMIT, so a rollback returns
 * it and leaves no gap. Gaps that survive commit — a voided invoice, an e-CF
 * DGII rejects — are legal, and are what Form 608 reports.
 *
 * Sequences are tried oldest-range first, so an authorized range is consumed
 * before the one issued after it.
 */
export async function allocateNcf(
  client: SqlClient,
  companyId: number,
  ncfType: string,
): Promise<NcfAllocation> {
  const { rows } = await client.query(
    `SELECT id, is_ecf FROM ncf_sequences
      WHERE company_id = $1 AND ncf_type = $2 AND is_active
        AND next_number <= range_to
        AND (expiry_date IS NULL OR expiry_date >= current_date)
      ORDER BY range_from
      LIMIT 1`,
    [companyId, ncfType],
  );
  if (rows.length === 0) throw new NcfExhaustedError(ncfType);

  const sequenceId = Number(rows[0].id);
  const allocated = await client.query(`SELECT allocate_ncf($1) AS n`, [sequenceId]);
  const n = allocated.rows[0].n;

  // The SELECT above and the UPDATE inside allocate_ncf are two statements. A
  // concurrent transaction can drain the last number between them, in which case
  // allocate_ncf returns NULL rather than overrunning the range.
  if (n === null || n === undefined) throw new NcfExhaustedError(ncfType);

  return {
    sequenceId,
    number: Number(n),
    ncf: formatNcf(ncfType, n),
    isEcf: rows[0].is_ecf,
  };
}

/** Sequences close to exhaustion, so an operator can request a new range in time. */
export async function sequencesNearingDepletion(client: SqlClient, companyId: number) {
  const { rows } = await client.query(
    `SELECT ncf_type, range_to - next_number + 1 AS remaining, expiry_date
       FROM ncf_sequences
      WHERE company_id = $1 AND is_active
        AND range_to - next_number + 1 <= alert_threshold
      ORDER BY remaining`,
    [companyId],
  );
  return rows.map((r) => ({
    ncfType: r.ncf_type,
    remaining: Number(r.remaining),
    expiryDate: r.expiry_date,
  }));
}
