import { SqlClient } from "./types";

/**
 * Fiscal years on demand.
 *
 * A company is created with the periods of the year it signs up in. The next
 * year does not exist until someone opens it, and posting into it fails with a
 * clear message rather than silently inventing periods: opening a year is a
 * control action an accountant takes, not a side effect of the first invoice.
 *
 * `openFrom` is for a company that starts operating mid-year. Its earlier months
 * never had activity, yet `PeriodClose.close` refuses to close October while
 * January is open. Marking those pre-inception months closed — only when they
 * carry no entries — lets the first real month close without pretending anything
 * happened before it.
 */
export async function ensureFiscalYear(
  client: SqlClient,
  companyId: number,
  year: number,
  opts: { openFrom?: string } = {},
): Promise<{ year: number; created: number; closedBeforeInception: number }> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error(`ejercicio inválido: ${year}`);
  }

  let created = 0;
  for (let m = 1; m <= 12; m++) {
    const start = new Date(Date.UTC(year, m - 1, 1));
    const end = new Date(Date.UTC(year, m, 0));
    const r = await client.query(
      `INSERT INTO accounting_periods (company_id, fiscal_year, period_no, start_date, end_date, status)
       VALUES ($1,$2,$3,$4,$5,'open')
       ON CONFLICT (company_id, fiscal_year, period_no) DO NOTHING`,
      [companyId, year, m, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)],
    );
    created += r.rowCount ?? 0;
  }
  // Period 13 shares December's last day: closing entries are dated at year end.
  const dec31 = `${year}-12-31`;
  const p13 = await client.query(
    `INSERT INTO accounting_periods (company_id, fiscal_year, period_no, start_date, end_date, status)
     VALUES ($1,$2,13,$3,$3,'open')
     ON CONFLICT (company_id, fiscal_year, period_no) DO NOTHING`,
    [companyId, year, dec31],
  );
  created += p13.rowCount ?? 0;

  let closedBeforeInception = 0;
  if (opts.openFrom) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.openFrom)) throw new Error("openFrom debe ser YYYY-MM-DD");
    const r = await client.query(
      `UPDATE accounting_periods p
          SET status='closed', closed_at=now()
        WHERE p.company_id=$1 AND p.fiscal_year=$2 AND p.period_no <= 12
          AND p.end_date < $3::date
          AND p.status IN ('open','reopened')
          AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.period_id = p.id)`,
      [companyId, year, opts.openFrom],
    );
    closedBeforeInception = r.rowCount ?? 0;
  }

  return { year, created, closedBeforeInception };
}
