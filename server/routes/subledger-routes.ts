import { Router } from "express";
import { z } from "zod";
import { CompanyRequest, requireCompany, scoped } from "../http/require-company";
import { Receivables, ReceivablesError } from "../subledgers/receivables";
import { Payables, PayablesError } from "../subledgers/payables";
import { PostingError } from "../accounting/types";

const decimal = z.string().regex(/^\d+(\.\d+)?$/, "monto inválido");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const application = z.object({ openItemId: z.number().int().positive(), amount: decimal });

/** HTTP surface for accounts receivable and payable. */
export function subledgerRoutes(): Router {
  const r = Router();
  r.use(requireCompany);

  // ── AR ─────────────────────────────────────────────────────────────────
  r.get(
    "/ar/open-items",
    h(async (req) =>
      scoped(req, async (c) => {
        const { rows } = await c.query(
          `SELECT id, customer_id, document_id, issue_date, due_date, original_amount::text,
                  balance::text, status FROM ar_open_items
            WHERE company_id=$1 AND status <> 'paid' ORDER BY due_date`,
          [req.companyId],
        );
        return { items: rows };
      }),
    ),
  );

  r.get(
    "/ar/aging",
    h(async (req) => {
      const asOf = (req.query.asOf as string) || new Date().toISOString().slice(0, 10);
      return { asOf, aging: await scoped(req, (c) => new Receivables(c).aging(req.companyId!, asOf)) };
    }),
  );

  r.post(
    "/ar/receipts",
    h(async (req) => {
      const b = receiptBody.parse(req.body);
      // Rebuilt with explicit keys: under strictNullChecks:false zod infers every
      // field optional, so the parsed object is not assignable to the service's
      // required-field input even though the runtime shape is validated.
      const res = await scoped(req, (c) =>
        new Receivables(c).registerReceipt({
          companyId: req.companyId!,
          postedBy: uid(req),
          customerId: b.customerId,
          receiptDate: b.receiptDate,
          amount: b.amount,
          method: b.method,
          reference: b.reference,
          applications: b.applications.map((a) => ({ openItemId: a.openItemId, amount: a.amount })),
        }),
      );
      return { status: 201, ...res };
    }),
  );

  // ── AP ─────────────────────────────────────────────────────────────────
  r.get(
    "/ap/open-items",
    h(async (req) =>
      scoped(req, async (c) => {
        const { rows } = await c.query(
          `SELECT id, supplier_id, document_id, issue_date, due_date, original_amount::text,
                  balance::text, status FROM ap_open_items
            WHERE company_id=$1 AND status <> 'paid' ORDER BY due_date`,
          [req.companyId],
        );
        return { items: rows };
      }),
    ),
  );

  r.get(
    "/ap/aging",
    h(async (req) => {
      const asOf = (req.query.asOf as string) || new Date().toISOString().slice(0, 10);
      return { asOf, aging: await scoped(req, (c) => new Payables(c).aging(req.companyId!, asOf)) };
    }),
  );

  r.post(
    "/ap/invoices",
    h(async (req) => {
      const b = supplierInvoiceBody.parse(req.body);
      const res = await scoped(req, (c) =>
        new Payables(c).registerInvoice({
          companyId: req.companyId!,
          postedBy: uid(req),
          supplierId: b.supplierId,
          supplierRnc: b.supplierRnc,
          ncf: b.ncf,
          ncfType: b.ncfType,
          date: b.date,
          dueDate: b.dueDate,
          counterpartyType: b.counterpartyType,
          operationType: b.operationType,
          applyRetentions: b.applyRetentions,
          purchaseType: b.purchaseType,
          // Rebuilt with explicit keys: zod infers every field optional under
          // strictNullChecks:false, and optional props are not assignable to the
          // service's required ones until they are made present in a fresh literal.
          fixedAsset: b.fixedAsset
            ? {
                code: b.fixedAsset.code,
                name: b.fixedAsset.name,
                usefulLifeMonths: b.fixedAsset.usefulLifeMonths,
                residualValue: b.fixedAsset.residualValue,
                category: b.fixedAsset.category,
              }
            : undefined,
          receiveToInventory: b.receiveToInventory,
          inventoryMethod: b.inventoryMethod,
          warehouseId: b.warehouseId,
          lines: b.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discount: l.discount,
            taxCode: l.taxCode,
            productId: l.productId,
          })),
        }),
      );
      return { status: 201, ...res };
    }),
  );

  r.post(
    "/ap/payments",
    h(async (req) => {
      const b = paymentBody.parse(req.body);
      const res = await scoped(req, (c) =>
        new Payables(c).registerPayment({
          companyId: req.companyId!,
          postedBy: uid(req),
          supplierId: b.supplierId,
          paymentDate: b.paymentDate,
          amount: b.amount,
          method: b.method,
          reference: b.reference,
          applications: b.applications.map((a) => ({ openItemId: a.openItemId, amount: a.amount })),
        }),
      );
      return { status: 201, ...res };
    }),
  );

  return r;
}

const receiptBody = z.object({
  customerId: z.number().int().positive().optional(),
  receiptDate: isoDate,
  amount: decimal,
  method: z.string().optional(),
  reference: z.string().optional(),
  applications: z.array(application).min(1),
});

const supplierInvoiceBody = z.object({
  supplierId: z.number().int().positive().optional(),
  supplierRnc: z.string().regex(/^\d{9}$|^\d{11}$/),
  ncf: z.string().min(1),
  ncfType: z.string().min(3).max(3),
  date: isoDate,
  dueDate: isoDate,
  counterpartyType: z.enum(["persona_fisica", "persona_juridica"]).optional(),
  operationType: z.enum(["bienes", "servicios"]).optional(),
  applyRetentions: z.boolean().optional(),
  purchaseType: z.enum(["inventory", "supply", "fixed_asset", "service", "expense"]).optional(),
  fixedAsset: z
    .object({
      code: z.string().min(1),
      name: z.string().min(1),
      usefulLifeMonths: z.number().int().positive(),
      residualValue: decimal.optional(),
      category: z.string().optional(),
    })
    .optional(),
  receiveToInventory: z.boolean().optional(),
  inventoryMethod: z.enum(["average", "fifo"]).optional(),
  warehouseId: z.number().int().min(0).optional(),
  lines: z
    .array(
      z.object({
        description: z.string().min(1),
        quantity: decimal,
        unitPrice: decimal,
        discount: decimal.optional(),
        taxCode: z.string().min(1),
        productId: z.number().int().positive().optional(),
      }),
    )
    .min(1),
});

const paymentBody = z.object({
  supplierId: z.number().int().positive().optional(),
  paymentDate: isoDate,
  amount: decimal,
  method: z.string().optional(),
  reference: z.string().optional(),
  applications: z.array(application).min(1),
});

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
      if (err instanceof ReceivablesError || err instanceof PayablesError || err instanceof PostingError)
        return res.status(400).json({ error: (err as Error).message });
      console.error("[subledgers]", err);
      res.status(500).json({ error: "error interno" });
    }
  };
}
