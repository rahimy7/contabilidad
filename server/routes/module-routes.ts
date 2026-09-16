import { Router } from "express";
import { z } from "zod";
import { CompanyRequest, requireCompany, scoped } from "../http/require-company";
import { FixedAssets, FixedAssetError } from "../modules/fixed-assets";
import { Budgets, BudgetError } from "../modules/budget";
import { Payroll, PayrollError } from "../modules/payroll";
import {
  prepareRun, setRunInput, importCommissions, calculateRun, postRun, payRun, payStatutory,
  statutoryLiabilities, generateIr3, loadConcepts, syncPayrollEmployee, listRuns, runJournalEntry, PayrollRunError,
} from "../payroll/runs";

const decimal = z.string().regex(/^\d+(\.\d+)?$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** HTTP surface for fixed assets, budgets and payroll. */
export function moduleRoutes(): Router {
  const r = Router();
  r.use(requireCompany);

  // ── Fixed assets ─────────────────────────────────────────────────────────
  r.get("/fixed-assets", h(async (req) =>
    scoped(req, async (c) => {
      const { rows } = await c.query(
        `SELECT id, code, name, category, acquisition_date, cost::text,
                accumulated_depreciation::text, (cost - accumulated_depreciation)::text AS book_value, status
           FROM fixed_assets WHERE company_id=$1 ORDER BY code`,
        [req.companyId],
      );
      return { assets: rows };
    }),
  ));

  r.post("/fixed-assets", h(async (req) => {
    const b = assetBody.parse(req.body);
    const id = await scoped(req, (c) =>
      new FixedAssets(c).register({
        companyId: req.companyId!,
        code: b.code, name: b.name, category: b.category,
        acquisitionDate: b.acquisitionDate, cost: b.cost,
        residualValue: b.residualValue, usefulLifeMonths: b.usefulLifeMonths,
        assetAccountCode: b.assetAccountCode, capitalizeAgainstAccount: b.capitalizeAgainstAccount, postedBy: uid(req),
      }),
    );
    return { status: 201, id };
  }));

  r.post("/fixed-assets/:id/dispose", h(async (req) => {
    const b = disposeBody.parse(req.body);
    return scoped(req, (c) =>
      new FixedAssets(c).dispose({
        companyId: req.companyId!, assetId: Number(req.params.id), date: b.date, proceeds: b.proceeds,
        proceedsAccountCode: b.proceedsAccountCode, reason: b.reason, postedBy: uid(req),
      }),
    );
  }));

  r.post("/fixed-assets/depreciate", h(async (req) => {
    const b = depreciateBody.parse(req.body);
    return scoped(req, (c) => new FixedAssets(c).runDepreciation(req.companyId!, b.year, b.period, b.date, uid(req), b.convention));
  }));

  // ── Budgets ──────────────────────────────────────────────────────────────
  r.post("/budgets", h(async (req) => {
    const b = budgetBody.parse(req.body);
    const id = await scoped(req, (c) =>
      new Budgets(c).create(
        req.companyId!, b.name, b.fiscalYear,
        b.lines.map((l) => ({ accountCode: l.accountCode, costCenterId: l.costCenterId, periodNo: l.periodNo, amount: l.amount })),
      ),
    );
    return { status: 201, id };
  }));

  r.get("/budgets/:id/variance", h(async (req) => {
    const id = Number(req.params.id);
    const from = req.query.from ? Number(req.query.from) : 1;
    const to = req.query.to ? Number(req.query.to) : 12;
    return scoped(req, (c) => new Budgets(c).varianceReport(req.companyId!, id, from, to));
  }));

  // ── Payroll ──────────────────────────────────────────────────────────────
  r.get("/payroll/employees", h(async (req) =>
    scoped(req, async (c) => {
      const { rows } = await c.query(
        `SELECT id, code, name, cedula, position, base_salary::text, is_active FROM payroll_employees WHERE company_id=$1 ORDER BY name`,
        [req.companyId],
      );
      return { employees: rows };
    }),
  ));

  r.post("/payroll/employees", h(async (req) => {
    const b = employeeBody.parse(req.body);
    const id = await scoped(req, async (c) => {
      const { rows } = await c.query(
        `INSERT INTO payroll_employees (company_id, code, name, cedula, position, base_salary) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [req.companyId, b.code, b.name, b.cedula ?? null, b.position ?? null, b.baseSalary],
      );
      return rows[0].id;
    });
    return { status: 201, id };
  }));

  r.post("/payroll/run", h(async (req) => {
    const b = payrollRunBody.parse(req.body);
    return scoped(req, (c) => new Payroll(c).run(req.companyId!, b.year, b.month, b.date, uid(req)));
  }));

  // ── Payroll runs, step by step ───────────────────────────────────────────
  r.get("/payroll/concepts", h(async (req) => scoped(req, async (c) => ({ concepts: await loadConcepts(c, req.companyId!) }))));

  r.post("/payroll/employees/sync-hr", h(async (req) => {
    const b = z.object({ hrEmployeeId: z.number().int().positive() }).parse(req.body);
    const id = await scoped(req, (c) => syncPayrollEmployee(c, req.companyId!, b.hrEmployeeId));
    return { status: 201, payrollEmployeeId: id };
  }));

  r.get("/payroll/runs", h(async (req) => {
    const q = z.object({ year: z.coerce.number().int().optional() }).parse(req.query);
    return scoped(req, async (c) => ({ runs: await listRuns(c, req.companyId!, q.year) }));
  }));

  r.get("/payroll/runs/:id/entry", h(async (req) =>
    scoped(req, async (c) => ({ entry: await runJournalEntry(c, req.companyId!, Number(req.params.id)) })),
  ));

  r.post("/payroll/runs", h(async (req) => {
    const b = z.object({ year: z.number().int(), month: z.number().int().min(1).max(12), paymentDate: isoDate.optional() }).parse(req.body);
    return { status: 201, ...(await scoped(req, (c) => prepareRun(c, { companyId: req.companyId!, year: b.year, month: b.month, paymentDate: b.paymentDate }))) };
  }));

  r.put("/payroll/runs/:id/inputs", h(async (req) => {
    const b = z.object({
      inputs: z.array(z.object({
        employeeId: z.number().int().positive(), code: z.string().min(1),
        quantity: decimal.optional(), amount: decimal.optional(), notes: z.string().optional(),
      })).min(1),
    }).parse(req.body);
    await scoped(req, async (c) => {
      for (const i of b.inputs) {
        await setRunInput(c, {
          companyId: req.companyId!, runId: Number(req.params.id), employeeId: i.employeeId, code: i.code,
          quantity: i.quantity, amount: i.amount, notes: i.notes,
        });
      }
    });
    return { saved: b.inputs.length };
  }));

  r.post("/payroll/runs/:id/import-commissions", h(async (req) =>
    scoped(req, (c) => importCommissions(c, { companyId: req.companyId!, runId: Number(req.params.id) })),
  ));

  r.post("/payroll/runs/:id/calculate", h(async (req) =>
    scoped(req, (c) => calculateRun(c, { companyId: req.companyId!, runId: Number(req.params.id) })),
  ));

  r.post("/payroll/runs/:id/post", h(async (req) => {
    const b = z.object({ date: isoDate }).parse(req.body);
    return scoped(req, (c) => postRun(c, { companyId: req.companyId!, runId: Number(req.params.id), entryDate: b.date, postedBy: uid(req) }));
  }));

  r.post("/payroll/runs/:id/pay", h(async (req) => {
    const b = z.object({ bankAccountId: z.number().int().positive(), date: isoDate }).parse(req.body);
    return scoped(req, (c) => payRun(c, { companyId: req.companyId!, runId: Number(req.params.id), bankAccountId: b.bankAccountId, date: b.date, postedBy: uid(req) }));
  }));

  r.get("/payroll/statutory", h(async (req) => {
    const q = z.object({ year: z.coerce.number().int(), month: z.coerce.number().int().min(1).max(12) }).parse(req.query);
    return scoped(req, (c) => statutoryLiabilities(c, req.companyId!, q.year, q.month));
  }));

  r.post("/payroll/statutory-payments", h(async (req) => {
    const b = z.object({
      kind: z.enum(["tss", "infotep", "isr_salaries"]), year: z.number().int(), month: z.number().int().min(1).max(12),
      bankAccountId: z.number().int().positive(), date: isoDate,
    }).parse(req.body);
    return { status: 201, ...(await scoped(req, (c) => payStatutory(c, { companyId: req.companyId!, ...b, postedBy: uid(req) } as any))) };
  }));

  r.get("/payroll/ir3", h(async (req) => {
    const q = z.object({ year: z.coerce.number().int(), month: z.coerce.number().int().min(1).max(12) }).parse(req.query);
    return scoped(req, (c) => generateIr3(c, req.companyId!, q.year, q.month));
  }));

  r.get("/payroll/runs/:id/payslips", h(async (req) => {
    const runId = Number(req.params.id);
    return scoped(req, async (c) => {
      const { rows } = await c.query(
        `SELECT p.*, e.name, e.code, e.department,
                (SELECT json_agg(json_build_object('code', l.concept_code, 'name', l.concept_name, 'kind', l.kind,
                        'quantity', l.quantity, 'rate', l.rate, 'amount', l.amount, 'account', l.account_code) ORDER BY l.id)
                   FROM payslip_lines l WHERE l.payslip_id = p.id) AS lines
           FROM payslips p JOIN payroll_employees e ON e.id=p.employee_id
          WHERE p.company_id=$1 AND p.run_id=$2 ORDER BY e.name`,
        [req.companyId, runId],
      );
      return { payslips: rows };
    });
  }));

  return r;
}

const assetBody = z.object({
  code: z.string().min(1), name: z.string().min(1), category: z.string().optional(),
  acquisitionDate: isoDate, cost: decimal, residualValue: decimal.optional(),
  usefulLifeMonths: z.number().int().positive(),
  assetAccountCode: z.enum(["1.2.01.001", "1.2.01.002", "1.2.01.004"]).optional(),
  capitalizeAgainstAccount: z.string().optional(),
});
const disposeBody = z.object({
  date: isoDate, proceeds: decimal.optional(), proceedsAccountCode: z.string().optional(), reason: z.string().optional(),
});
const depreciateBody = z.object({
  year: z.number().int(), period: z.number().int().min(1).max(12), date: isoDate,
  convention: z.enum(["full_month", "mid_month"]).optional(),
});
const budgetBody = z.object({
  name: z.string().min(1), fiscalYear: z.number().int(),
  lines: z.array(z.object({ accountCode: z.string(), costCenterId: z.number().int().positive().optional(), periodNo: z.number().int().min(1).max(12), amount: decimal })).min(1),
});
const employeeBody = z.object({
  code: z.string().min(1), name: z.string().min(1), cedula: z.string().optional(), position: z.string().optional(), baseSalary: decimal,
});
const payrollRunBody = z.object({ year: z.number().int(), month: z.number().int().min(1).max(12), date: isoDate });

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
      if (err instanceof FixedAssetError || err instanceof BudgetError || err instanceof PayrollError || err instanceof PayrollRunError)
        return res.status(400).json({ error: (err as Error).message });
      const name = (err as any)?.constructor?.name ?? "";
      if (/(Treasury|Posting|PayrollCalculation|UnresolvedAccount)Error$/.test(name)) {
        return res.status(422).json({ error: (err as Error).message });
      }
      console.error("[modules]", err);
      res.status(500).json({ error: "error interno" });
    }
  };
}
