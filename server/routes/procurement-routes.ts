import { Router } from "express";
import { z } from "zod";
import { CompanyRequest, requireCompany, scoped } from "../http/require-company";
import { sendLegacyError } from "../http/legacy-bridge";
import { createPurchaseOrder, submitPurchaseOrder, syncPurchaseOrderApproval } from "../procurement/purchase-orders";
import { receivePurchaseOrder, uninvoicedReceipts } from "../procurement/receipts";

const decimal = z.string().regex(/^\d+(\.\d+)?$/, "valor inválido");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha debe ser YYYY-MM-DD");

const poBody = z.object({
  supplierId: z.number().int().positive().optional(),
  warehouseId: z.number().int().positive(),
  orderDate: isoDate,
  expectedDate: isoDate.optional(),
  currency: z.string().length(3).optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
  requisitionId: z.number().int().positive().optional(),
  supplierQuoteId: z.number().int().positive().optional(),
  items: z.array(z.object({
    productId: z.number().int().positive(),
    productName: z.string().min(1),
    quantity: decimal,
    unitCost: decimal,
    discountRate: decimal.optional(),
    taxRate: decimal.optional(),
    sku: z.string().optional(),
    notes: z.string().optional(),
  })).min(1),
});

const receiptBody = z.object({
  date: isoDate,
  notes: z.string().optional(),
  closeShort: z.boolean().optional(),
  lines: z.array(z.object({
    purchaseOrderItemId: z.number().int().positive(),
    quantity: decimal,
    lotNo: z.string().optional(),
    expirationDate: isoDate.optional(),
    method: z.enum(["average", "fifo"]).optional(),
    inventoryAccountRef: z.enum(["1.1.03.001", "1.1.03.002"]).optional(),
    locations: z.array(z.object({
      locationId: z.number().int().positive(),
      quantity: decimal,
      lotNo: z.string().optional(),
      expirationDate: isoDate.optional(),
    })).optional(),
  })).min(1),
});

/** Purchase orders, approvals, receipts and what is still waiting for an invoice. */
export function procurementRoutes(): Router {
  const r = Router();
  r.use(requireCompany);
  const user = (req: CompanyRequest) => (req as any).user ?? {};

  r.post("/purchase-orders", async (req: CompanyRequest, res) => {
    try {
      const b = poBody.parse(req.body);
      const out = await scoped(req, (c) =>
        createPurchaseOrder(c, {
          companyId: req.companyId!, storeId: Number(user(req).storeId ?? 1), userId: Number(user(req).id),
          supplierId: b.supplierId, warehouseId: b.warehouseId, orderDate: b.orderDate, expectedDate: b.expectedDate,
          currency: b.currency, paymentTerms: b.paymentTerms, notes: b.notes, requisitionId: b.requisitionId,
          supplierQuoteId: b.supplierQuoteId,
          items: b.items.map((i) => ({
            productId: i.productId, productName: i.productName, quantity: i.quantity, unitCost: i.unitCost,
            discountRate: i.discountRate, taxRate: i.taxRate, sku: i.sku, notes: i.notes,
          })),
        }),
      );
      res.status(201).json(out);
    } catch (err) {
      sendLegacyError(res, err, "Error al crear la orden de compra");
    }
  });

  r.post("/purchase-orders/:id/submit", async (req: CompanyRequest, res) => {
    try {
      const out = await scoped(req, (c) =>
        submitPurchaseOrder(c, {
          companyId: req.companyId!, storeId: Number(user(req).storeId ?? 1),
          purchaseOrderId: Number(req.params.id), userId: Number(user(req).id),
        }),
      );
      res.json(out);
    } catch (err) {
      sendLegacyError(res, err, "Error al enviar la orden a aprobación");
    }
  });

  r.post("/purchase-orders/:id/sync-approval", async (req: CompanyRequest, res) => {
    try {
      const status = await scoped(req, (c) =>
        syncPurchaseOrderApproval(c, { companyId: req.companyId!, storeId: Number(user(req).storeId ?? 1), purchaseOrderId: Number(req.params.id) }),
      );
      res.json({ approvalStatus: status });
    } catch (err) {
      sendLegacyError(res, err, "Error al consultar la aprobación");
    }
  });

  r.post("/purchase-orders/:id/receipts", async (req: CompanyRequest, res) => {
    try {
      const b = receiptBody.parse(req.body);
      const out = await scoped(req, (c) =>
        receivePurchaseOrder(c, {
          companyId: req.companyId!, purchaseOrderId: Number(req.params.id), date: b.date, userId: Number(user(req).id),
          notes: b.notes, closeShort: b.closeShort,
          lines: b.lines.map((l) => ({
            purchaseOrderItemId: l.purchaseOrderItemId, quantity: l.quantity, lotNo: l.lotNo,
            expirationDate: l.expirationDate, method: l.method, inventoryAccountRef: l.inventoryAccountRef,
            locations: l.locations?.map((x) => ({ locationId: x.locationId, quantity: x.quantity, lotNo: x.lotNo, expirationDate: x.expirationDate })),
          })),
        }),
      );
      res.status(201).json(out);
    } catch (err) {
      sendLegacyError(res, err, "Error al registrar la recepción");
    }
  });

  r.get("/purchase-orders/:id/receipts", async (req: CompanyRequest, res) => {
    try {
      const rows = await scoped(req, async (c) => {
        const { rows } = await c.query(
          `SELECT r.id, r.receipt_no, r.receipt_date, r.total_cost::text, r.status,
                  json_agg(json_build_object('productId', l.product_id, 'quantity', l.quantity::text,
                    'unitCost', l.unit_cost::text, 'qtyInvoiced', l.qty_invoiced::text, 'lotNo', l.lot_no) ORDER BY l.id) AS lines
             FROM purchase_receipts r JOIN purchase_receipt_lines l ON l.receipt_id = r.id
            WHERE r.company_id=$1 AND r.purchase_order_id=$2
            GROUP BY r.id ORDER BY r.receipt_date, r.id`,
          [req.companyId, Number(req.params.id)],
        );
        return rows;
      });
      res.json({ receipts: rows });
    } catch (err) {
      sendLegacyError(res, err, "Error al consultar recepciones");
    }
  });

  // Recibido y no facturado: el detalle del saldo de 2.1.01.002.
  r.get("/grni", async (req: CompanyRequest, res) => {
    try {
      const rows = await scoped(req, (c) =>
        uninvoicedReceipts(c, req.companyId!, {
          purchaseOrderId: req.query.purchaseOrderId ? Number(req.query.purchaseOrderId) : undefined,
          supplierId: req.query.supplierId ? Number(req.query.supplierId) : undefined,
        }),
      );
      res.json({ lines: rows });
    } catch (err) {
      sendLegacyError(res, err, "Error al consultar recepciones por facturar");
    }
  });

  return r;
}
