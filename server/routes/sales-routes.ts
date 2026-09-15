import { Router } from "express";
import { z } from "zod";
import { CompanyRequest, requireCompany, scoped } from "../http/require-company";
import { checkout } from "../sales/checkout";
import { sendLegacyError } from "../http/legacy-bridge";

const decimal = z.string().regex(/^\d+(\.\d+)?$/, "monto inválido");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha debe ser YYYY-MM-DD");

const checkoutBody = z.object({
  ncfType: z.string().length(3),
  date: isoDate,
  paymentMethod: z.enum(["cash", "card", "transfer", "credit"]),
  warehouseId: z.number().int().min(0),
  customerId: z.number().int().positive().optional(),
  buyerRnc: z.string().regex(/^\d{9}$|^\d{11}$/).optional(),
  buyerName: z.string().optional(),
  dueDate: isoDate.optional(),
  sellerUserId: z.number().int().positive().optional(),
  currency: z.string().length(3).optional(),
  fxRate: decimal.optional(),
  notes: z.string().optional(),
  createOrder: z.boolean().optional(),
  discountApprovedBy: z.number().int().positive().optional(),
  lines: z
    .array(
      z.object({
        productId: z.number().int().positive().optional(),
        description: z.string().min(1),
        quantity: decimal,
        unitPrice: decimal,
        discount: decimal.optional(),
        taxCode: z.string().min(1),
      }),
    )
    .min(1),
});

/**
 * One call per sale: the operational order, the fiscal invoice (NCF, revenue,
 * ITBIS), the cost of the goods and, on credit, the receivable — in one
 * transaction. The POS and the invoicing screen both use it.
 */
export function salesRoutes(): Router {
  const r = Router();
  r.use(requireCompany);

  r.post("/checkout", async (req: CompanyRequest, res) => {
    try {
      const b = checkoutBody.parse(req.body);
      const user = (req as any).user ?? {};
      const result = await scoped(req, async (c) => {
        const company = await c.query(`SELECT rnc, settings FROM companies WHERE id=$1`, [req.companyId]);
        const maxDiscount = company.rows[0]?.settings?.sales?.maxDiscountPercent;
        return checkout(c, {
          companyId: req.companyId!,
          storeId: Number(user.storeId ?? 1),
          userId: Number(user.id),
          issuerRnc: company.rows[0].rnc,
          warehouseId: b.warehouseId,
          ncfType: b.ncfType,
          date: b.date,
          paymentMethod: b.paymentMethod,
          customerId: b.customerId,
          buyerRnc: b.buyerRnc,
          buyerName: b.buyerName,
          dueDate: b.dueDate,
          sellerUserId: b.sellerUserId,
          currency: b.currency,
          fxRate: b.fxRate,
          notes: b.notes,
          createOrder: b.createOrder,
          maxDiscountPercent: maxDiscount !== undefined && maxDiscount !== null ? String(maxDiscount) : undefined,
          discountApprovedBy: b.discountApprovedBy,
          lines: b.lines.map((l) => ({
            productId: l.productId, description: l.description, quantity: l.quantity,
            unitPrice: l.unitPrice, discount: l.discount, taxCode: l.taxCode,
          })),
        });
      });
      // Loyalty points follow the completed order, as in the legacy POS. Best
      // effort and after the commit: a points failure must not undo a sale.
      if (result.orderId) {
        import("../services/loyalty-points-service")
          .then(({ LoyaltyPointsService }) => new LoyaltyPointsService(Number(user.storeId ?? 1)).creditLoyaltyPointsFromOrder(result.orderId!))
          .catch((e) => console.warn("[sales] loyalty points not credited:", e?.message));
      }
      res.status(201).json(result);
    } catch (err: any) {
      if (err?.name === "NcfExhaustedError") return res.status(409).json({ error: err.message });
      if (err?.name === "CreditLimitError" || err?.constructor?.name === "CreditLimitError") {
        return res.status(422).json({ error: err.message, code: "credit_limit" });
      }
      if (err?.constructor?.name === "TaxConfigurationError") return res.status(400).json({ error: err.message });
      return sendLegacyError(res, err, "Error al registrar la venta");
    }
  });

  return r;
}
