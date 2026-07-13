import { Router } from "express";
import { z } from "zod";
import { CompanyRequest, requireCompany, scoped } from "../http/require-company";
import { PostingEngine } from "../accounting/posting-engine";
import { PostingError } from "../accounting/types";
import { FinancialStatements } from "../accounting/financial-statements";
import { Dashboard } from "../accounting/dashboard";
import { PeriodClose, PeriodCloseError } from "../accounting/period-close";

/**
 * HTTP surface for the general ledger.
 *
 * Handlers stay thin: they validate input, then hand a company-scoped client to
 * the same services the tests exercise. All accounting logic lives in
 * `server/accounting`, not here.
 */
export function accountingRoutes(): Router {
  const r = Router();
  r.use(requireCompany);

  // Chart of accounts, flat and ordered by code so a client can render the tree.
  r.get(
    "/accounts",
    handler(async (req) => {
      const rows = await scoped(req, async (c) => {
        const { rows } = await c.query(
          `SELECT id, code, name, parent_id, level, account_type, normal_side,
                  is_postable, is_control, subledger, currency, is_active
             FROM chart_of_accounts WHERE company_id = $1 ORDER BY code`,
          [req.companyId],
        );
        return rows;
      });
      return { accounts: rows };
    }),
  );

  r.get(
    "/periods",
    handler(async (req) => {
      const year = req.query.year ? Number(req.query.year) : new Date().getUTCFullYear();
      const rows = await scoped(req, async (c) => {
        const { rows } = await c.query(
          `SELECT id, fiscal_year, period_no, start_date, end_date, status
             FROM accounting_periods WHERE company_id=$1 AND fiscal_year=$2
            ORDER BY period_no`,
          [req.companyId, year],
        );
        return rows;
      });
      return { year, periods: rows };
    }),
  );

  /**
   * Trial balance for a fiscal year, optionally a single period. Reads the
   * materialized cache, not the lines, so it stays cheap as the ledger grows.
   * The response asserts its own integrity: totalDebit must equal totalCredit.
   */
  r.get(
    "/trial-balance",
    handler(async (req) => {
      const q = trialBalanceQuery.parse(req.query);
      const rows = await scoped(req, async (c) => {
        const { rows } = await c.query(
          `SELECT a.code, a.name, a.account_type,
                  sum(b.debit_total)::text  AS debit,
                  sum(b.credit_total)::text AS credit,
                  sum(b.closing_func)::text AS balance
             FROM account_period_balances b
             JOIN chart_of_accounts a ON a.id = b.account_id
             JOIN accounting_periods p ON p.id = b.period_id
            WHERE b.company_id = $1 AND p.fiscal_year = $2
              AND ($3::int IS NULL OR p.period_no = $3)
            GROUP BY a.code, a.name, a.account_type
            HAVING sum(b.debit_total) <> 0 OR sum(b.credit_total) <> 0
            ORDER BY a.code`,
          [req.companyId, q.year, q.period ?? null],
        );
        return rows;
      });

      const totalDebit = rows.reduce((s, r) => s + Number(r.debit), 0);
      const totalCredit = rows.reduce((s, r) => s + Number(r.credit), 0);
      return {
        year: q.year,
        period: q.period ?? null,
        rows,
        totalDebit: totalDebit.toFixed(4),
        totalCredit: totalCredit.toFixed(4),
        balanced: Math.abs(totalDebit - totalCredit) < 0.00005,
      };
    }),
  );

  r.get(
    "/income-statement",
    handler(async (req) => {
      const q = statementRange.parse(req.query);
      return scoped(req, (c) =>
        new FinancialStatements(c).incomeStatement(req.companyId!, q.year, q.from, q.to),
      );
    }),
  );

  r.get(
    "/balance-sheet",
    handler(async (req) => {
      const q = balanceSheetQuery.parse(req.query);
      return scoped(req, (c) =>
        new FinancialStatements(c).balanceSheet(req.companyId!, q.year, q.through),
      );
    }),
  );

  /**
   * Everything the home dashboard shows, in one scoped transaction, so every
   * tile reflects the same instant of the ledger.
   */
  r.get(
    "/dashboard",
    handler(async (req) => {
      const q = dashboardQuery.parse(req.query);
      return scoped(req, (c) => new Dashboard(c).build(req.companyId!, q.year, q.month));
    }),
  );

  // Journal entries, most recent first.
  r.get(
    "/journal",
    handler(async (req) => {
      const q = journalQuery.parse(req.query);
      const rows = await scoped(req, async (c) => {
        const { rows } = await c.query(
          `SELECT id, entry_no, entry_date, memo, currency, status, source_type, source_event
             FROM journal_entries
            WHERE company_id=$1 AND status='posted'
              AND ($2::date IS NULL OR entry_date >= $2)
              AND ($3::date IS NULL OR entry_date <= $3)
            ORDER BY entry_date DESC, id DESC LIMIT $4`,
          [req.companyId, q.from ?? null, q.to ?? null, q.limit],
        );
        return rows;
      });
      return { entries: rows };
    }),
  );

  r.get(
    "/journal/:id",
    handler(async (req) => {
      const id = Number(req.params.id);
      return scoped(req, async (c) => {
        const head = await c.query(
          `SELECT id, entry_no, entry_date, memo, currency, status, source_type,
                  source_event, reversed_by_entry_id, reverses_entry_id
             FROM journal_entries WHERE company_id=$1 AND id=$2`,
          [req.companyId, id],
        );
        if (head.rows.length === 0) return notFound("asiento no encontrado");
        const lines = await c.query(
          `SELECT l.line_no, l.account_id, a.code, a.name,
                  l.debit::text, l.credit::text, l.currency, l.memo
             FROM journal_entry_lines l
             JOIN chart_of_accounts a ON a.id = l.account_id
            WHERE l.entry_id=$2 AND l.company_id=$1 ORDER BY l.line_no`,
          [req.companyId, id],
        );
        return { entry: head.rows[0], lines: lines.rows };
      });
    }),
  );

  // A manual, balanced entry. The engine and the deferred trigger both enforce
  // the balance; zod only shapes the request.
  r.post(
    "/journal",
    handler(async (req) => {
      const body = manualEntryBody.parse(req.body);
      const result = await scoped(req, (c) =>
        new PostingEngine(c).postManual({
          companyId: req.companyId!,
          entryDate: body.date,
          memo: body.memo,
          currency: body.currency,
          reference: body.reference,
          postedBy: numericUserId(req),
          lines: body.lines,
        }),
      );
      return { status: 201, ...result };
    }),
  );

  r.post(
    "/periods/:year/:period/close",
    handler(async (req) => {
      const year = Number(req.params.year);
      const period = Number(req.params.period);
      await scoped(req, (c) => new PeriodClose(c).close(req.companyId!, year, period, numericUserId(req)));
      return { closed: { year, period } };
    }),
  );

  r.post(
    "/periods/:year/:period/reopen",
    handler(async (req) => {
      const year = Number(req.params.year);
      const period = Number(req.params.period);
      await scoped(req, (c) => new PeriodClose(c).reopen(req.companyId!, year, period));
      return { reopened: { year, period } };
    }),
  );

  r.post(
    "/periods/:year/close-year",
    handler(async (req) => {
      const year = Number(req.params.year);
      const entryId = await scoped(req, (c) =>
        new PeriodClose(c).closeYear(req.companyId!, year, undefined, numericUserId(req)),
      );
      return { year, closingEntryId: entryId };
    }),
  );

  r.post(
    "/journal/:id/reverse",
    handler(async (req) => {
      const id = Number(req.params.id);
      const reason = z.string().min(1, "se requiere un motivo").parse(req.body?.reason);
      const result = await scoped(req, (c) =>
        new PostingEngine(c).reverse(id, reason, numericUserId(req)),
      );
      return { status: 201, ...result };
    }),
  );

  return r;
}

// ── validation ────────────────────────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha debe ser YYYY-MM-DD");
const decimal = z.string().regex(/^-?\d+(\.\d+)?$/, "monto inválido");

const trialBalanceQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  period: z.coerce.number().int().min(1).max(13).optional(),
});

const statementRange = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  from: z.coerce.number().int().min(1).max(13).default(1),
  to: z.coerce.number().int().min(1).max(13).default(12),
});

const balanceSheetQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  through: z.coerce.number().int().min(1).max(13).default(12),
});

// Sin parámetros cae en el mes en curso, que es lo que el usuario quiere ver al
// abrir la aplicación. Período 13 (ajustes de cierre) no aplica a un dashboard.
const dashboardQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100).default(new Date().getUTCFullYear()),
  month: z.coerce.number().int().min(1).max(12).default(new Date().getUTCMonth() + 1),
});

const journalQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const manualEntryBody = z.object({
  date: isoDate,
  memo: z.string().optional(),
  currency: z.string().length(3).optional(),
  reference: z.string().optional(),
  lines: z
    .array(
      z
        .object({
          accountId: z.number().int().positive().optional(),
          accountCode: z.string().optional(),
          debit: decimal.optional(),
          credit: decimal.optional(),
          costCenterId: z.number().int().positive().optional(),
          memo: z.string().optional(),
        })
        .refine((l) => l.accountId || l.accountCode, "cada línea requiere accountId o accountCode"),
    )
    .min(2, "un asiento requiere al menos dos líneas"),
});

// ── plumbing ────────────────────────────────────────────────────────────────

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
const notFound = (msg: string): never => {
  throw new HttpError(404, msg);
};

const numericUserId = (req: CompanyRequest): number | undefined => {
  const id = req.user?.id;
  return id ? Number(id) : undefined;
};

/**
 * Wraps a handler so services can throw domain errors and get the right HTTP
 * status without every route repeating a try/catch. A `PostingError` is the
 * caller's fault (400); a zod error is too; anything else is a 500.
 */
function handler(fn: (req: CompanyRequest) => Promise<any>) {
  return async (req: CompanyRequest, res: any) => {
    try {
      const out = await fn(req);
      const status = out?.status ?? 200;
      if (out && typeof out === "object") delete out.status;
      res.status(status).json(out);
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      if (err instanceof z.ZodError) return res.status(400).json({ error: "validación", issues: err.issues });
      if (err instanceof PostingError) return res.status(400).json({ error: err.message });
      if (err instanceof PeriodCloseError) return res.status(400).json({ error: err.message });
      console.error("[accounting]", err);
      res.status(500).json({ error: "error interno" });
    }
  };
}
