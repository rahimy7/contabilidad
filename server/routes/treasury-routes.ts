import { Router } from "express";
import { z } from "zod";
import { CompanyRequest, requireCompany, scoped } from "../http/require-company";
import { Treasury, TreasuryError } from "../treasury/banks";
import { PostingError } from "../accounting/types";

const decimal = z.string().regex(/^\d+(\.\d+)?$/, "monto inválido");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** HTTP surface for treasury: bank accounts, movements and reconciliation. */
export function treasuryRoutes(): Router {
  const r = Router();
  r.use(requireCompany);

  // ── Bank accounts ──────────────────────────────────────────────────────────
  r.get("/accounts", h(async (req) =>
    scoped(req, async (c) => {
      const { rows } = await c.query(
        `SELECT b.id, b.code, b.name, b.bank_name, b.account_number, b.account_type,
                b.currency, b.is_active,
                coalesce(sum(CASE WHEN t.direction='in' THEN t.amount ELSE -t.amount END)
                         FILTER (WHERE t.status='posted'), 0)::text AS balance
           FROM bank_accounts b
           LEFT JOIN bank_transactions t ON t.bank_account_id=b.id AND t.company_id=b.company_id
          WHERE b.company_id=$1
          GROUP BY b.id
          ORDER BY b.code`,
        [req.companyId],
      );
      return { accounts: rows };
    }),
  ));

  r.post("/accounts", h(async (req) => {
    const b = accountBody.parse(req.body);
    const id = await scoped(req, (c) =>
      new Treasury(c).openAccount({
        companyId: req.companyId!,
        code: b.code, name: b.name, bankName: b.bankName,
        accountNumber: b.accountNumber, accountType: b.accountType,
        currency: b.currency, glAccountCode: b.glAccountCode,
      }),
    );
    return { status: 201, id };
  }));

  // ── Movements ──────────────────────────────────────────────────────────────
  r.get("/accounts/:id/movements", h(async (req) => {
    const bankAccountId = Number(req.params.id);
    return scoped(req, async (c) => {
      const { rows } = await c.query(
        `SELECT id, txn_date, direction, amount::text, kind, counterparty_account_ref,
                memo, reference, journal_entry_id, reconciliation_id,
                (reconciliation_id IS NOT NULL) AS cleared, status
           FROM bank_transactions
          WHERE company_id=$1 AND bank_account_id=$2 AND status='posted'
          ORDER BY txn_date DESC, id DESC`,
        [req.companyId, bankAccountId],
      );
      return { movements: rows };
    });
  }));

  r.post("/movements", h(async (req) => {
    const b = movementBody.parse(req.body);
    const res = await scoped(req, (c) =>
      new Treasury(c).recordMovement({
        companyId: req.companyId!,
        postedBy: uid(req),
        bankAccountId: b.bankAccountId,
        txnDate: b.txnDate,
        direction: b.direction,
        amount: b.amount,
        kind: b.kind,
        counterpartyAccountRef: b.counterpartyAccountRef,
        memo: b.memo,
        reference: b.reference,
        reconciliationId: b.reconciliationId,
      }),
    );
    return { status: 201, ...res };
  }));

  // ── Reconciliation ─────────────────────────────────────────────────────────
  r.get("/reconciliations", h(async (req) => {
    const bankAccountId = req.query.bankAccountId ? Number(req.query.bankAccountId) : null;
    return scoped(req, async (c) => {
      const { rows } = await c.query(
        `SELECT id, bank_account_id, statement_date, statement_balance::text, status, completed_at, created_at
           FROM bank_reconciliations
          WHERE company_id=$1 AND ($2::bigint IS NULL OR bank_account_id=$2)
          ORDER BY statement_date DESC, id DESC`,
        [req.companyId, bankAccountId],
      );
      return { reconciliations: rows };
    });
  }));

  r.post("/reconciliations", h(async (req) => {
    const b = startReconBody.parse(req.body);
    const id = await scoped(req, (c) =>
      new Treasury(c).startReconciliation(req.companyId!, b.bankAccountId, b.statementDate, b.statementBalance),
    );
    return { status: 201, id };
  }));

  r.get("/reconciliations/:id", h(async (req) => {
    const id = Number(req.params.id);
    return scoped(req, (c) => new Treasury(c).summary(req.companyId!, id));
  }));

  r.post("/reconciliations/:id/clear", h(async (req) => {
    const id = Number(req.params.id);
    const b = clearBody.parse(req.body);
    await scoped(req, (c) => new Treasury(c).clear(req.companyId!, id, b.transactionIds));
    return { ok: true };
  }));

  r.post("/reconciliations/:id/unclear", h(async (req) => {
    const id = Number(req.params.id);
    const b = clearBody.parse(req.body);
    await scoped(req, (c) => new Treasury(c).unclear(req.companyId!, id, b.transactionIds));
    return { ok: true };
  }));

  r.post("/reconciliations/:id/complete", h(async (req) => {
    const id = Number(req.params.id);
    await scoped(req, (c) => new Treasury(c).complete(req.companyId!, id));
    return { ok: true };
  }));

  return r;
}

const accountBody = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  accountType: z.string().optional(),
  currency: z.string().length(3).optional(),
  glAccountCode: z.string().optional(),
});

const movementBody = z.object({
  bankAccountId: z.number().int().positive(),
  txnDate: isoDate,
  direction: z.enum(["in", "out"]),
  amount: decimal,
  kind: z.string().optional(),
  counterpartyAccountRef: z.string().min(1),
  memo: z.string().optional(),
  reference: z.string().optional(),
  reconciliationId: z.number().int().positive().optional(),
});

const startReconBody = z.object({
  bankAccountId: z.number().int().positive(),
  statementDate: isoDate,
  statementBalance: decimal,
});

const clearBody = z.object({ transactionIds: z.array(z.number().int().positive()).min(1) });

const uid = (req: CompanyRequest) => (req.user?.id ? Number(req.user.id) : undefined);

function h(fn: (req: CompanyRequest) => Promise<any>) {
  return async (req: CompanyRequest, res: any) => {
    try {
      const out = await fn(req);
      const status = out?.status ?? 200;
      if (out && typeof out === "object") delete out.status;
      res.status(status).json(out);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "validación", issues: err.issues });
      if (err instanceof TreasuryError || err instanceof PostingError)
        return res.status(400).json({ error: (err as Error).message });
      console.error("[treasury]", err);
      res.status(500).json({ error: "error interno" });
    }
  };
}
