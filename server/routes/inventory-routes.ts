import { Router } from "express";
import { z } from "zod";
import { CompanyRequest, requireCompany, scoped } from "../http/require-company";
import { InventoryCosting, InventoryCostingError } from "../inventory/costing";
import { marginReport } from "../inventory/margin";
import { stockReconciliation } from "../inventory/stock-reconciliation";
import { PostingError } from "../accounting/types";

const decimal = z.string().regex(/^\d+(\.\d+)?$/, "valor inválido");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** HTTP surface for inventory costing: valuation, movements, receipts and issues. */
export function inventoryRoutes(): Router {
  const r = Router();
  r.use(requireCompany);

  r.get("/valuation", h(async (req) =>
    scoped(req, async (c) => {
      const { rows } = await c.query(
        `SELECT v.product_id, v.warehouse_id, w.name AS warehouse_name,
                v.quantity_on_hand::text, v.average_cost::text, v.total_value::text,
                v.costing_method, v.inventory_account, v.updated_at
           FROM inventory_valuation v
           LEFT JOIN warehouses w ON w.id = v.warehouse_id
          WHERE v.company_id=$1 AND v.quantity_on_hand <> 0
          ORDER BY v.inventory_account, v.warehouse_id, v.product_id`,
        [req.companyId],
      );
      const total = await c.query(
        `SELECT coalesce(sum(total_value),0)::text v FROM inventory_valuation WHERE company_id=$1`,
        [req.companyId],
      );
      // Value held in each bodega — the physical view of the same money.
      const byWarehouse = await c.query(
        `SELECT v.warehouse_id, coalesce(w.name, 'Sin almacén') AS warehouse_name,
                coalesce(sum(v.total_value),0)::text AS total_value
           FROM inventory_valuation v
           LEFT JOIN warehouses w ON w.id = v.warehouse_id
          WHERE v.company_id=$1
          GROUP BY v.warehouse_id, w.name
          HAVING sum(v.total_value) <> 0
          ORDER BY v.warehouse_id`,
        [req.companyId],
      );
      return { items: rows, totalValue: total.rows[0].v, byWarehouse: byWarehouse.rows };
    }),
  ));

  r.get("/movements", h(async (req) => {
    const productId = req.query.productId ? Number(req.query.productId) : null;
    return scoped(req, async (c) => {
      const { rows } = await c.query(
        `SELECT id, product_id, movement_date, kind, quantity::text, unit_cost::text, total_cost::text,
                balance_qty::text, balance_value::text
           FROM inventory_cost_movements
          WHERE company_id=$1 AND ($2::int IS NULL OR product_id=$2)
          ORDER BY movement_date DESC, id DESC LIMIT 200`,
        [req.companyId, productId],
      );
      return { movements: rows };
    });
  }));

  r.post("/receive", h(async (req) => {
    const b = receiveBody.parse(req.body);
    const res = await scoped(req, (c) =>
      new InventoryCosting(c).receive({
        companyId: req.companyId!, postedBy: uid(req),
        productId: b.productId, date: b.date, quantity: b.quantity, unitCost: b.unitCost,
        method: b.method, inventoryAccountRef: b.inventoryAccountRef, warehouseId: b.warehouseId,
        sourceType: b.sourceType, sourceId: b.sourceId,
      }),
    );
    return { status: 201, ...res };
  }));

  r.post("/issue", h(async (req) => {
    const b = issueBody.parse(req.body);
    const res = await scoped(req, (c) =>
      new InventoryCosting(c).issue({
        companyId: req.companyId!, postedBy: uid(req),
        productId: b.productId, date: b.date, quantity: b.quantity, warehouseId: b.warehouseId,
        sourceType: b.sourceType, sourceId: b.sourceId,
      }),
    );
    return { status: 201, ...res };
  }));

  // Move stock between bodegas. No journal entry: both roll into the same control
  // account, so only the subledger buckets move.
  r.post("/transfer", h(async (req) => {
    const b = transferBody.parse(req.body);
    const res = await scoped(req, (c) =>
      new InventoryCosting(c).transfer({
        companyId: req.companyId!, postedBy: uid(req),
        productId: b.productId, date: b.date, quantity: b.quantity,
        fromWarehouseId: b.fromWarehouseId, toWarehouseId: b.toWarehouseId,
        sourceType: b.sourceType, sourceId: b.sourceId,
      }),
    );
    return { status: 201, ...res };
  }));

  r.get("/margin", h(async (req) => {
    const q = z.object({ year: z.coerce.number().int(), month: z.coerce.number().int().min(1).max(12) }).parse(req.query);
    return scoped(req, (c) => marginReport(c, { companyId: req.companyId!, year: q.year, month: q.month }));
  }));

  // Where the POS's stock count and the valued ledger disagree.
  r.get("/stock-reconciliation", h(async (req) =>
    scoped(req, (c) => stockReconciliation(c, req.companyId!)),
  ));

  return r;
}

const receiveBody = z.object({
  productId: z.number().int().positive(),
  date: isoDate,
  quantity: decimal,
  unitCost: decimal,
  method: z.enum(["average", "fifo"]).optional(),
  /** 1.1.03.001 = merchandise for sale (default), 1.1.03.002 = consumable supplies. */
  inventoryAccountRef: z.string().optional(),
  warehouseId: z.number().int().min(0).optional(),
  sourceType: z.string().optional(),
  sourceId: z.string().optional(),
});

const issueBody = z.object({
  productId: z.number().int().positive(),
  date: isoDate,
  quantity: decimal,
  warehouseId: z.number().int().min(0).optional(),
  sourceType: z.string().optional(),
  sourceId: z.string().optional(),
});

const transferBody = z.object({
  productId: z.number().int().positive(),
  date: isoDate,
  quantity: decimal,
  fromWarehouseId: z.number().int().min(0),
  toWarehouseId: z.number().int().min(0),
  sourceType: z.string().optional(),
  sourceId: z.string().optional(),
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
      if (err instanceof InventoryCostingError || err instanceof PostingError)
        return res.status(400).json({ error: (err as Error).message });
      console.error("[inventory]", err);
      res.status(500).json({ error: "error interno" });
    }
  };
}
