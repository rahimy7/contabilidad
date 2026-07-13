import { Router } from "express";
import { z } from "zod";
import { CompanyRequest, requireCompany, scoped } from "../http/require-company";
import { FiscalDocumentService, IssueLineInput } from "../fiscal/document-service";
import { NcfExhaustedError, sequencesNearingDepletion } from "../fiscal/ncf";
import { TaxConfigurationError } from "../fiscal/tax-calculator";
import { generate606, generate607, generate608, generate609, generateIt1, generateIr17 } from "../fiscal/dgii-reports";
import { ForeignPayments, ForeignPaymentError } from "../fiscal/foreign-payments";
import { PostingError } from "../accounting/types";

const REPORT_GENERATORS = {
  "606": generate606,
  "607": generate607,
  "608": generate608,
  "609": generate609,
} as const;
import { EcfService } from "../fiscal/ecf/ecf-service";
import { DevEcfSigner } from "../fiscal/ecf/dev-signer";
import { DgiiTestGateway } from "../fiscal/ecf/test-gateway";
import { DgiiEcfGateway, EcfSigner } from "../fiscal/ecf/types";

/**
 * HTTP surface for the DGII fiscal layer: issuing comprobantes, cancelling them,
 * managing NCF ranges, and producing the 606/607/608 filings.
 */
export function fiscalRoutes(): Router {
  const r = Router();
  r.use(requireCompany);

  // Issue an invoice. The NCF allocation, the document and its journal entry all
  // commit together inside `scoped`'s transaction, or none of them do.
  r.post(
    "/invoices",
    handler(async (req) => {
      const body = invoiceBody.parse(req.body);
      const issuerRnc = await companyRnc(req);
      // Rebuilt as explicit literals so every required field is present, rather
      // than passing zod's inferred shape where refinements read as optional.
      const lines: IssueLineInput[] = body.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
        taxCode: l.taxCode,
        productId: l.productId,
      }));
      const doc = await scoped(req, (c) =>
        new FiscalDocumentService(c).issueInvoice({
          companyId: req.companyId!,
          issuerRnc,
          ncfType: body.ncfType,
          date: body.date,
          lines,
          customerId: body.customerId,
          buyerRnc: body.buyerRnc,
          buyerName: body.buyerName,
          orderId: body.orderId,
          currency: body.currency,
          fxRate: body.fxRate,
          paymentMethod: body.paymentMethod,
          applyLegalTip: body.applyLegalTip,
          dueDate: body.dueDate,
          bookCogs: body.bookCogs,
          warehouseId: body.warehouseId,
          postedBy: numericUserId(req),
        }),
      );
      return { status: 201, ...doc };
    }),
  );

  // Sign and transmit an e-CF to DGII. Until a production certificate and DGII
  // credentials are configured, this runs against the in-memory test gateway —
  // the whole pipeline works, but the signature is not one DGII trusts yet.
  // Credit note against an existing invoice.
  r.post(
    "/credit-notes",
    handler(async (req) => {
      const body = creditNoteBody.parse(req.body);
      const issuerRnc = await companyRnc(req);
      const lines: IssueLineInput[] = body.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
        taxCode: l.taxCode,
        productId: l.productId,
      }));
      const doc = await scoped(req, (c) =>
        new FiscalDocumentService(c).issueCreditNote({
          companyId: req.companyId!,
          issuerRnc,
          ncfType: body.ncfType,
          date: body.date,
          modifiesDocId: body.modifiesDocId,
          lines,
          restockInventory: body.restockInventory,
          postedBy: numericUserId(req),
        }),
      );
      return { status: 201, ...doc };
    }),
  );

  r.post(
    "/documents/:id/transmit",
    handler(async (req) => {
      const id = Number(req.params.id);
      const status = await scoped(req, (c) => ecfService(c).transmit(req.companyId!, id));
      return { documentId: id, ecfStatus: status };
    }),
  );

  r.post(
    "/documents/:id/refresh-status",
    handler(async (req) => {
      const id = Number(req.params.id);
      const status = await scoped(req, (c) => ecfService(c).refreshStatus(req.companyId!, id));
      return { documentId: id, ecfStatus: status };
    }),
  );

  r.post(
    "/documents/:id/cancel",
    handler(async (req) => {
      const id = Number(req.params.id);
      const reason = z.string().min(1, "se requiere un motivo").parse(req.body?.reason);
      await scoped(req, (c) => new FiscalDocumentService(c).cancel(id, reason, numericUserId(req)));
      return { status: 200, cancelled: id };
    }),
  );

  r.get(
    "/documents",
    handler(async (req) => {
      const q = documentsQuery.parse(req.query);
      const rows = await scoped(req, async (c) => {
        const { rows } = await c.query(
          `SELECT id, doc_type, ncf, ncf_type, is_ecf, buyer_rnc, buyer_name,
                  total::text, status, ecf_status, emitted_at
             FROM fiscal_documents
            WHERE company_id=$1
              AND ($2::text IS NULL OR doc_type::text = $2)
              AND ($3::date IS NULL OR emitted_at >= $3)
              AND ($4::date IS NULL OR emitted_at < ($4::date + interval '1 day'))
            ORDER BY emitted_at DESC NULLS LAST, id DESC LIMIT $5`,
          [req.companyId, q.type ?? null, q.from ?? null, q.to ?? null, q.limit],
        );
        return rows;
      });
      return { documents: rows };
    }),
  );

  r.get(
    "/documents/:id",
    handler(async (req) => {
      const id = Number(req.params.id);
      return scoped(req, async (c) => {
        const head = await c.query(
          `SELECT * FROM fiscal_documents WHERE company_id=$1 AND id=$2`,
          [req.companyId, id],
        );
        if (head.rows.length === 0) return notFound("documento no encontrado");
        const lines = await c.query(
          `SELECT line_no, description, quantity::text, unit_price::text, discount::text,
                  tax_code, itbis_rate::text, itbis_amount::text, line_total::text, is_exempt
             FROM fiscal_document_lines WHERE document_id=$2 AND company_id=$1 ORDER BY line_no`,
          [req.companyId, id],
        );
        return { document: head.rows[0], lines: lines.rows };
      });
    }),
  );

  // NCF sequences, with the ones nearing depletion flagged so an operator can
  // request a new range before running dry mid-sale.
  r.get(
    "/ncf-sequences",
    handler(async (req) => {
      return scoped(req, async (c) => {
        const { rows } = await c.query(
          `SELECT id, ncf_type, is_ecf, range_from, range_to, next_number,
                  range_to - next_number + 1 AS remaining, expiry_date, alert_threshold, is_active
             FROM ncf_sequences WHERE company_id=$1 ORDER BY ncf_type, range_from`,
          [req.companyId],
        );
        const alerts = await sequencesNearingDepletion(c, req.companyId!);
        return { sequences: rows, alerts };
      });
    }),
  );

  r.post(
    "/ncf-sequences",
    handler(async (req) => {
      const b = ncfSequenceBody.parse(req.body);
      if (b.rangeTo < b.rangeFrom) throw new HttpError(400, "range_to debe ser >= range_from");
      const id = await scoped(req, async (c) => {
        const { rows } = await c.query(
          `INSERT INTO ncf_sequences
             (company_id, ncf_type, is_ecf, range_from, range_to, next_number, expiry_date, alert_threshold)
           VALUES ($1,$2,$3,$4,$5,$4,$6,$7) RETURNING id`,
          [req.companyId, b.ncfType, b.isEcf ?? false, b.rangeFrom, b.rangeTo, b.expiryDate ?? null, b.alertThreshold ?? 50],
        );
        return rows[0].id;
      });
      return { status: 201, id };
    }),
  );

  // DGII filings. `?format=txt` returns the upload-ready file; the default is
  // JSON with the parsed lines for a preview grid.
  for (const form of ["606", "607", "608", "609"] as const) {
    r.get(
      `/reports/${form}`,
      handler(async (req) => {
        const q = reportQuery.parse(req.query);
        const rnc = await companyRnc(req);
        const report = await scoped(req, (c) =>
          REPORT_GENERATORS[form](c, { companyId: req.companyId!, rnc, year: q.year, month: q.month }),
        );
        if (q.format === "txt") {
          return {
            raw: report.content,
            contentType: "text/plain",
            filename: `${form}_${rnc}_${report.period}.txt`,
          };
        }
        return {
          form: report.form,
          period: report.period,
          recordCount: report.recordCount,
          header: report.header,
          lines: report.lines,
        };
      }),
    );
  }

  // IT-1: monthly ITBIS declaration summary.
  r.get(
    "/reports/it1",
    handler(async (req) => {
      const q = z.object({ year: z.coerce.number().int(), month: z.coerce.number().int().min(1).max(12) }).parse(req.query);
      return scoped(req, (c) => generateIt1(c, { companyId: req.companyId!, rnc: "", year: q.year, month: q.month }));
    }),
  );

  // IR-17: monthly ISR-retention declaration summary.
  r.get(
    "/reports/ir17",
    handler(async (req) => {
      const q = z.object({ year: z.coerce.number().int(), month: z.coerce.number().int().min(1).max(12) }).parse(req.query);
      return scoped(req, (c) => generateIr17(c, { companyId: req.companyId!, rnc: "", year: q.year, month: q.month }));
    }),
  );

  // Payments abroad, which feed the 609.
  r.get(
    "/foreign-payments",
    handler(async (req) =>
      scoped(req, async (c) => {
        const { rows } = await c.query(
          `SELECT id, beneficiary_name, country, income_type, payment_date,
                  gross_amount::text, isr_rate::text, isr_retained::text, memo, reference
             FROM foreign_payments WHERE company_id=$1 ORDER BY payment_date DESC, id DESC LIMIT 200`,
          [req.companyId],
        );
        return { payments: rows };
      }),
    ),
  );

  r.post(
    "/foreign-payments",
    handler(async (req) => {
      const b = foreignPaymentBody.parse(req.body);
      const res = await scoped(req, (c) =>
        new ForeignPayments(c).record({
          companyId: req.companyId!,
          postedBy: numericUserId(req),
          beneficiaryName: b.beneficiaryName,
          country: b.country,
          incomeType: b.incomeType,
          paymentDate: b.paymentDate,
          grossAmount: b.grossAmount,
          isrRate: b.isrRate,
          isrRetained: b.isrRetained,
          expenseAccountRef: b.expenseAccountRef,
          paymentAccountRef: b.paymentAccountRef,
          memo: b.memo,
          reference: b.reference,
        }),
      );
      return { status: 201, ...res };
    }),
  );

  return r;
}

// ── validation ────────────────────────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha debe ser YYYY-MM-DD");
const decimal = z.string().regex(/^\d+(\.\d+)?$/, "monto inválido");

const invoiceLine = z.object({
  description: z.string().min(1),
  quantity: decimal,
  unitPrice: decimal,
  discount: decimal.optional(),
  taxCode: z.string().min(1),
  productId: z.number().int().positive().optional(),
});

const invoiceBody = z.object({
  ncfType: z.string().min(3).max(3),
  date: isoDate,
  lines: z.array(invoiceLine).min(1),
  customerId: z.number().int().positive().optional(),
  buyerRnc: z.string().regex(/^\d{9}$|^\d{11}$/).optional(),
  buyerName: z.string().optional(),
  orderId: z.number().int().positive().optional(),
  currency: z.string().length(3).optional(),
  fxRate: decimal.optional(),
  paymentMethod: z.enum(["cash", "credit", "card", "transfer"]).optional(),
  applyLegalTip: z.boolean().optional(),
  dueDate: isoDate.optional(),
  // Recognise COGS for tracked products by default; a caller can opt out.
  bookCogs: z.boolean().default(true),
  warehouseId: z.number().int().min(0).optional(),
});

const creditNoteBody = z.object({
  ncfType: z.string().min(3).max(3),
  date: isoDate,
  modifiesDocId: z.number().int().positive(),
  lines: z.array(invoiceLine).min(1),
  restockInventory: z.boolean().optional(),
});

const documentsQuery = z.object({
  type: z.enum(["invoice", "credit_note", "debit_note", "receipt", "purchase"]).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const ncfSequenceBody = z.object({
  ncfType: z.string().min(3).max(3),
  isEcf: z.boolean().optional(),
  rangeFrom: z.number().int().positive(),
  rangeTo: z.number().int().positive(),
  expiryDate: isoDate.optional(),
  alertThreshold: z.number().int().min(0).optional(),
});

const reportQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  format: z.enum(["json", "txt"]).default("json"),
});

const foreignPaymentBody = z.object({
  beneficiaryName: z.string().min(1),
  country: z.string().optional(),
  incomeType: z.string().optional(),
  paymentDate: isoDate,
  grossAmount: decimal,
  isrRate: decimal.optional(),
  isrRetained: decimal.optional(),
  expenseAccountRef: z.string().optional(),
  paymentAccountRef: z.string().optional(),
  memo: z.string().optional(),
  reference: z.string().optional(),
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
 * Assembles an EcfService for the request's client.
 *
 * The signer and gateway are chosen by environment. Neither a production
 * certificate nor DGII credentials exist yet, so this returns the dev signer and
 * the in-memory gateway — the pipeline is exercised, but nothing is sent to a
 * real DGII. Wiring the live signer and gateway is a configuration change here,
 * not a code change at the call sites.
 */
function ecfService(client: import("../accounting/types").SqlClient): EcfService {
  const signer: EcfSigner = new DevEcfSigner();
  const gateway: DgiiEcfGateway = new DgiiTestGateway({ outcome: "aceptado" });
  const qrBaseUrl = process.env.DGII_ECF_QR_URL || "https://ecf.dgii.gov.do/ecf/consultatimbrefc";
  return new EcfService(client, { signer, gateway, identity: {}, qrBaseUrl });
}

/** The issuer RNC for the active company, read from `companies`. */
async function companyRnc(req: CompanyRequest): Promise<string> {
  const rows = await scoped(req, async (c) => {
    const { rows } = await c.query(`SELECT rnc FROM companies WHERE id=$1`, [req.companyId]);
    return rows;
  });
  if (rows.length === 0) throw new HttpError(404, "empresa no encontrada");
  return rows[0].rnc;
}

function handler(fn: (req: CompanyRequest) => Promise<any>) {
  return async (req: CompanyRequest, res: any) => {
    try {
      const out = await fn(req);
      if (out?.contentType === "text/plain") {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${out.filename}"`);
        return res.status(200).send(out.raw);
      }
      const status = out?.status ?? 200;
      if (out && typeof out === "object") delete out.status;
      res.status(status).json(out);
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      if (err instanceof z.ZodError) return res.status(400).json({ error: "validación", issues: err.issues });
      if (err instanceof NcfExhaustedError) return res.status(409).json({ error: err.message });
      if (err instanceof TaxConfigurationError) return res.status(400).json({ error: err.message });
      if (err instanceof ForeignPaymentError) return res.status(400).json({ error: err.message });
      if (err instanceof PostingError) return res.status(400).json({ error: err.message });
      console.error("[fiscal]", err);
      res.status(500).json({ error: "error interno" });
    }
  };
}
