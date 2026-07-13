import { Router } from "express";
import { z } from "zod";
import { CompanyRequest, requireCompany, scoped } from "../http/require-company";
import { FixedAssets, FixedAssetError } from "../modules/fixed-assets";
import { Budgets, BudgetError } from "../modules/budget";
import { Payroll, PayrollError } from "../modules/payroll";

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
      }),
    );
    return { status: 201, id };
  }));

  r.post("/fixed-assets/depreciate", h(async (req) => {
    const b = depreciateBody.parse(req.body);
    return scoped(req, (c) => new FixedAssets(c).runDepreciation(req.companyId!, b.year, b.period, b.date, uid(req)));
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

  r.get("/payroll/runs/:id/payslips", h(async (req) => {
    const runId = Number(req.params.id);
    return scoped(req, async (c) => {
      const { rows } = await c.query(
        `SELECT p.*, e.name, e.code FROM payslips p JOIN payroll_employees e ON e.id=p.employee_id
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
});
const depreciateBody = z.object({ year: z.number().int(), period: z.number().int().min(1).max(12), date: isoDate });
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
      if (err instanceof FixedAssetError || err instanceof BudgetError || err instanceof PayrollError)
        return res.status(400).json({ error: (err as Error).message });
      console.error("[modules]", err);
      res.status(500).json({ error: "error interno" });
    }
  };
}
