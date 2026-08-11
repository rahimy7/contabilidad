import express, { type Response } from "express";
import { z } from "zod";
import { authenticateToken, type AuthenticatedRequest } from "../authMiddleware";
import { masterPool } from "../multi-tenant-db";
import {
  computeTssContributions, DEFAULT_RATES_2026,
  registerNovedad, listPendingNovedades,
  prepareTssSubmission, saveTssSubmission, markSubmissionSubmitted,
} from "../services/hr-tss";
import { quotePrice, checkCreditAvailability } from "../services/pricing";
import {
  calculateCommissions, closeCommissionPeriod, approveCommissionEarning,
} from "../services/commissions";

const router = express.Router();
const storeIdOf = (req: AuthenticatedRequest) => {
  const s = req.user!.storeId;
  return typeof s === "string" ? parseInt(s) : s;
};

// ── TSS ─────────────────────────────────────────────────────────────────────

router.get("/hr/tss/afp-funds", authenticateToken, async (_req, res: Response) => {
  const r = await masterPool.query(
    `SELECT id, code, name, sipen_code AS "sipenCode", is_active AS "isActive"
       FROM hr_afp_funds WHERE is_active = true ORDER BY name`,
  );
  res.json({ rows: r.rows });
});

router.get("/hr/tss/ars-providers", authenticateToken, async (_req, res: Response) => {
  const r = await masterPool.query(
    `SELECT id, code, name, sisalril_code AS "sisalrilCode",
            is_public AS "isPublic", is_active AS "isActive"
       FROM hr_ars_providers WHERE is_active = true ORDER BY is_public DESC, name`,
  );
  res.json({ rows: r.rows });
});

router.post("/hr/employees/:id/tss-selection", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      afpFundId: z.number().int().positive().optional(),
      arsProviderId: z.number().int().positive().optional(),
      arsCoversDependents: z.boolean().optional(),
      tssRegisteredAt: z.string().optional(),
    }).parse(req.body);
    await masterPool.query(
      `UPDATE hr_employees
          SET afp_fund_id = coalesce($2, afp_fund_id),
              ars_provider_id = coalesce($3, ars_provider_id),
              ars_covers_dependents = coalesce($4, ars_covers_dependents),
              tss_registered_at = coalesce($5::date, tss_registered_at),
              tss_status = CASE WHEN $5 IS NOT NULL THEN 'registered' ELSE tss_status END,
              updated_at = now()
        WHERE id = $1`,
      [
        Number(req.params.id),
        body.afpFundId ?? null, body.arsProviderId ?? null,
        body.arsCoversDependents ?? null, body.tssRegisteredAt ?? null,
      ],
    );
    res.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/hr/tss/compute", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      grossSalary: z.number().positive(),
      minSalary: z.number().positive().optional(),
    }).parse(req.body);
    const rates = { ...DEFAULT_RATES_2026, minSalary: body.minSalary ?? DEFAULT_RATES_2026.minSalary };
    res.json(computeTssContributions(body.grossSalary, rates));
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/hr/tss/novedades", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      employeeId: z.number().int().positive(),
      novedadCode: z.enum(["1", "2", "3", "4", "5", "6", "7", "8", "9"]),
      periodYear: z.number().int(),
      periodMonth: z.number().int().min(1).max(12),
      effectiveDate: z.string(),
      oldSalary: z.number().nonnegative().optional(),
      newSalary: z.number().nonnegative().optional(),
      daysOff: z.number().int().nonnegative().optional(),
      reason: z.string().optional(),
    }).parse(req.body);
    const r = await registerNovedad(masterPool, { storeId: storeIdOf(req), ...body });
    res.status(201).json(r);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/hr/tss/novedades", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  res.json(await listPendingNovedades(masterPool, storeIdOf(req), year, month));
});

router.get("/hr/tss/submissions/preview", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  res.json(await prepareTssSubmission(masterPool, storeIdOf(req), year, month));
});

router.post("/hr/tss/submissions", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      periodYear: z.number().int(),
      periodMonth: z.number().int().min(1).max(12),
    }).parse(req.body);
    const r = await saveTssSubmission(
      masterPool, storeIdOf(req), body.periodYear, body.periodMonth, req.user!.id,
    );
    res.status(201).json({ submissionId: r.submissionId, totals: r.prep.totals });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/hr/tss/submissions/:id/submit", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const body = z.object({ receiptId: z.string().optional() }).parse(req.body ?? {});
  await markSubmissionSubmitted(masterPool, Number(req.params.id), body.receiptId);
  res.json({ ok: true });
});

// ── Precios B2B ────────────────────────────────────────────────────────────

router.post("/pricing/quote", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      customerId: z.number().int().positive().optional(),
      productId: z.number().int().positive(),
      quantity: z.number().positive(),
      onDate: z.string().optional(),
    }).parse(req.body);
    res.json(await quotePrice(masterPool, { storeId: storeIdOf(req), ...body }));
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/pricing/credit-check/:customerId", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const amount = Number(req.query.amount ?? 0);
  res.json(await checkCreditAvailability(masterPool, Number(req.params.customerId), amount));
});

router.get("/price-lists", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const r = await masterPool.query(
    `SELECT id, code, name, tier, default_discount_percent::text AS "defaultDiscountPct",
            valid_from::text AS "validFrom", valid_to::text AS "validTo",
            is_active AS "isActive", is_default_for_tier AS "isDefaultForTier"
       FROM price_lists WHERE store_id = $1 ORDER BY tier, name`,
    [storeIdOf(req)],
  );
  res.json({ rows: r.rows });
});

router.post("/price-lists", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      code: z.string().min(1),
      name: z.string().min(1),
      tier: z.enum(["retail", "wholesale", "distributor", "institutional", "vip", "custom"]).default("retail"),
      currency: z.string().default("DOP"),
      validFrom: z.string().optional(),
      validTo: z.string().optional(),
      defaultDiscountPercent: z.number().min(0).max(100).optional(),
      isDefaultForTier: z.boolean().optional(),
    }).parse(req.body);
    const r = await masterPool.query(
      `INSERT INTO price_lists
         (store_id, code, name, tier, currency, valid_from, valid_to,
          default_discount_percent, is_default_for_tier)
       VALUES ($1, $2, $3, $4, $5, coalesce($6::date, CURRENT_DATE), $7::date, $8, $9)
       RETURNING id`,
      [
        storeIdOf(req), body.code, body.name, body.tier, body.currency,
        body.validFrom ?? null, body.validTo ?? null,
        String(body.defaultDiscountPercent ?? 0),
        body.isDefaultForTier ?? false,
      ],
    );
    res.status(201).json({ id: r.rows[0].id });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

router.put("/customers/:id/pricing-terms", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      priceListId: z.number().int().positive().optional(),
      additionalDiscountPercent: z.number().min(0).max(100).optional(),
      creditDays: z.number().int().nonnegative().optional(),
      creditLimit: z.number().nonnegative().optional(),
      earlyPaymentDiscountPercent: z.number().min(0).max(100).optional(),
      earlyPaymentDays: z.number().int().nonnegative().optional(),
      itbisRetentionPercent: z.number().min(0).max(100).optional(),
      isrRetentionPercent: z.number().min(0).max(100).optional(),
      requiresPurchaseOrder: z.boolean().optional(),
    }).parse(req.body);
    await masterPool.query(
      `UPDATE customer_pricing_terms SET is_active = false WHERE customer_id = $1`,
      [Number(req.params.id)],
    );
    const r = await masterPool.query(
      `INSERT INTO customer_pricing_terms
         (customer_id, store_id, price_list_id, additional_discount_percent,
          credit_days, credit_limit, early_payment_discount_percent,
          early_payment_days, itbis_retention_percent, isr_retention_percent,
          requires_purchase_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
       RETURNING id`,
      [
        Number(req.params.id), storeIdOf(req),
        body.priceListId ?? null,
        String(body.additionalDiscountPercent ?? 0),
        body.creditDays ?? 0, String(body.creditLimit ?? 0),
        String(body.earlyPaymentDiscountPercent ?? 0),
        body.earlyPaymentDays ?? null,
        String(body.itbisRetentionPercent ?? 0),
        String(body.isrRetentionPercent ?? 0),
        body.requiresPurchaseOrder ?? false,
      ],
    );
    res.status(201).json({ id: r.rows[0].id });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

// ── Mercadeo ───────────────────────────────────────────────────────────────

router.get("/marketing/segments", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const r = await masterPool.query(
    `SELECT id, code, name, description, segment_type AS "segmentType",
            is_dynamic AS "isDynamic", member_count AS "memberCount",
            is_active AS "isActive"
       FROM customer_segments WHERE store_id = $1 ORDER BY name`,
    [storeIdOf(req)],
  );
  res.json({ rows: r.rows });
});

router.post("/marketing/segments", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      code: z.string().min(1),
      name: z.string().min(1),
      description: z.string().optional(),
      segmentType: z.enum([
        "b2b_wholesale", "b2b_distributor", "b2c_retail", "b2c_vip",
        "b2c_frequent", "inactive", "at_risk", "custom",
      ]).default("custom"),
      rules: z.record(z.unknown()).optional(),
      isDynamic: z.boolean().default(true),
    }).parse(req.body);
    const r = await masterPool.query(
      `INSERT INTO customer_segments
         (store_id, code, name, description, segment_type, rules, is_dynamic)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        storeIdOf(req), body.code, body.name, body.description ?? null,
        body.segmentType, JSON.stringify(body.rules ?? null), body.isDynamic,
      ],
    );
    res.status(201).json({ id: r.rows[0].id });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/marketing/segments/:id/members", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({ customerIds: z.array(z.number().int().positive()).min(1) }).parse(req.body);
    let added = 0;
    for (const cid of body.customerIds) {
      const r = await masterPool.query(
        `INSERT INTO customer_segment_memberships (segment_id, customer_id, added_by, is_manual)
         VALUES ($1, $2, $3, true) ON CONFLICT DO NOTHING RETURNING id`,
        [Number(req.params.id), cid, req.user!.id],
      );
      if (r.rowCount) added++;
    }
    await masterPool.query(
      `UPDATE customer_segments
          SET member_count = (SELECT count(*)::int FROM customer_segment_memberships WHERE segment_id = $1),
              last_recomputed_at = now()
        WHERE id = $1`,
      [Number(req.params.id)],
    );
    res.json({ added });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/marketing/campaigns", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const r = await masterPool.query(
    `SELECT id, code, name, channel, objective, status,
            start_date::text AS "startDate", end_date::text AS "endDate",
            budget_amount::text AS "budgetAmount",
            spent_amount::text AS "spentAmount",
            conversion_count AS "conversionCount",
            revenue_generated::text AS "revenueGenerated"
       FROM marketing_campaigns WHERE store_id = $1
       ORDER BY start_date DESC LIMIT 200`,
    [storeIdOf(req)],
  );
  res.json({ rows: r.rows });
});

router.post("/marketing/campaigns", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      code: z.string().min(1),
      name: z.string().min(1),
      description: z.string().optional(),
      channel: z.enum(["whatsapp", "email", "sms", "social", "offline", "multi"]),
      objective: z.enum(["conversion", "retention", "awareness", "reactivation", "loyalty", "launch"]),
      startDate: z.string(),
      endDate: z.string().optional(),
      targetSegmentIds: z.array(z.number().int().positive()).optional(),
      budgetAmount: z.number().nonnegative().optional(),
      targetReach: z.number().int().nonnegative().optional(),
      targetConversions: z.number().int().nonnegative().optional(),
    }).parse(req.body);
    const r = await masterPool.query(
      `INSERT INTO marketing_campaigns
         (store_id, code, name, description, channel, objective,
          start_date, end_date, target_segment_ids, budget_amount,
          target_reach, target_conversions, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::date, $9, $10, $11, $12, 'planning', $13)
       RETURNING id`,
      [
        storeIdOf(req), body.code, body.name, body.description ?? null,
        body.channel, body.objective,
        body.startDate, body.endDate ?? null,
        body.targetSegmentIds ?? [],
        String(body.budgetAmount ?? 0),
        body.targetReach ?? null, body.targetConversions ?? null,
        req.user!.id,
      ],
    );
    res.status(201).json({ id: r.rows[0].id });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/marketing/campaigns/:id/roi", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const c = await masterPool.query(
    `SELECT budget_amount::float AS budget, spent_amount::float AS spent,
            revenue_generated::float AS revenue, conversion_count AS conversions
       FROM marketing_campaigns WHERE id = $1 AND store_id = $2`,
    [id, storeIdOf(req)],
  );
  if (!c.rowCount) return res.status(404).json({ error: "not found" });
  const r = c.rows[0];
  const cost = Math.max(r.spent, 0);
  const roi = cost > 0 ? ((r.revenue - cost) / cost) * 100 : null;
  res.json({
    budget: r.budget, spent: r.spent, revenue: r.revenue,
    conversions: r.conversions,
    roiPercent: roi != null ? Math.round(roi * 100) / 100 : null,
    profit: r.revenue - cost,
  });
});

router.get("/marketing/leads", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const stage = req.query.stage ? String(req.query.stage) : null;
  const r = await masterPool.query(
    `SELECT id, first_name AS "firstName", last_name AS "lastName", company, email, phone,
            source, stage, score, estimated_value::text AS "estimatedValue",
            assigned_to_user_id AS "assignedToUserId", created_at::text AS "createdAt"
       FROM marketing_leads WHERE store_id = $1
         AND ($2::text IS NULL OR stage = $2)
       ORDER BY created_at DESC LIMIT 200`,
    [storeIdOf(req), stage],
  );
  res.json({ rows: r.rows });
});

router.post("/marketing/leads", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      firstName: z.string().min(1),
      lastName: z.string().optional(),
      company: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      source: z.string().min(1),
      sourceCampaignId: z.number().int().positive().optional(),
      interestedIn: z.string().optional(),
      estimatedValue: z.number().nonnegative().optional(),
      assignedToUserId: z.number().int().positive().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const r = await masterPool.query(
      `INSERT INTO marketing_leads
         (store_id, first_name, last_name, company, email, phone, source,
          source_campaign_id, interested_in, estimated_value,
          assigned_to_user_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [
        storeIdOf(req), body.firstName, body.lastName ?? null,
        body.company ?? null, body.email ?? null, body.phone ?? null,
        body.source, body.sourceCampaignId ?? null,
        body.interestedIn ?? null,
        body.estimatedValue != null ? String(body.estimatedValue) : null,
        body.assignedToUserId ?? null, body.notes ?? null,
      ],
    );
    res.status(201).json({ id: r.rows[0].id });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/marketing/leads/:id/stage", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      stage: z.enum(["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"]),
      notes: z.string().optional(),
      lostReason: z.string().optional(),
    }).parse(req.body);
    await masterPool.query(
      `UPDATE marketing_leads
          SET stage = $2,
              notes = coalesce($3, notes),
              lost_reason = coalesce($4, lost_reason),
              lost_at = CASE WHEN $2 = 'lost' AND lost_at IS NULL THEN now() ELSE lost_at END,
              converted_at = CASE WHEN $2 = 'won' AND converted_at IS NULL THEN now() ELSE converted_at END,
              updated_at = now()
        WHERE id = $1`,
      [Number(req.params.id), body.stage, body.notes ?? null, body.lostReason ?? null],
    );
    res.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

// ── Promociones ────────────────────────────────────────────────────────────

router.get("/promotions", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const active = req.query.active === "true";
  const r = await masterPool.query(
    `SELECT id, code, name, promotion_type AS "promotionType",
            discount_percent::text AS "discountPercent",
            discount_amount::text AS "discountAmount",
            applies_to AS "appliesTo",
            valid_from::text AS "validFrom", valid_to::text AS "validTo",
            current_uses AS "currentUses", max_uses AS "maxUses",
            is_active AS "isActive"
       FROM promotions WHERE store_id = $1
         AND ($2::boolean IS FALSE OR (is_active = true AND CURRENT_DATE >= valid_from AND (CURRENT_DATE <= valid_to OR valid_to IS NULL)))
       ORDER BY valid_from DESC LIMIT 200`,
    [storeIdOf(req), active],
  );
  res.json({ rows: r.rows });
});

router.post("/promotions", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      code: z.string().min(1),
      name: z.string().min(1),
      description: z.string().optional(),
      promotionType: z.enum(["percent_off", "amount_off", "bogo", "bundle", "gift", "free_shipping"]),
      discountPercent: z.number().min(0).max(100).optional(),
      discountAmount: z.number().nonnegative().optional(),
      buyQuantity: z.number().positive().optional(),
      getQuantity: z.number().positive().optional(),
      bundlePrice: z.number().nonnegative().optional(),
      appliesTo: z.enum(["product", "category", "order"]).default("order"),
      scopeProductIds: z.array(z.number().int().positive()).optional(),
      scopeCategoryIds: z.array(z.number().int().positive()).optional(),
      validFrom: z.string(),
      validTo: z.string().optional(),
      targetSegmentIds: z.array(z.number().int().positive()).optional(),
      minOrderAmount: z.number().nonnegative().optional(),
      maxUses: z.number().int().positive().optional(),
      maxUsesPerCustomer: z.number().int().positive().optional(),
      couponCode: z.string().optional(),
      requiresCouponCode: z.boolean().optional(),
      isExclusive: z.boolean().optional(),
    }).parse(req.body);
    const r = await masterPool.query(
      `INSERT INTO promotions
         (store_id, code, name, description, promotion_type,
          discount_percent, discount_amount, buy_quantity, get_quantity, bundle_price,
          applies_to, scope_product_ids, scope_category_ids,
          min_order_amount, valid_from, valid_to, target_segment_ids,
          max_uses, max_uses_per_customer, coupon_code, requires_coupon_code,
          is_exclusive, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::date,$16::date,$17,$18,$19,$20,$21,$22,$23)
       RETURNING id`,
      [
        storeIdOf(req), body.code, body.name, body.description ?? null,
        body.promotionType,
        body.discountPercent != null ? String(body.discountPercent) : null,
        body.discountAmount != null ? String(body.discountAmount) : null,
        body.buyQuantity != null ? String(body.buyQuantity) : null,
        body.getQuantity != null ? String(body.getQuantity) : null,
        body.bundlePrice != null ? String(body.bundlePrice) : null,
        body.appliesTo,
        body.scopeProductIds ?? null, body.scopeCategoryIds ?? null,
        String(body.minOrderAmount ?? 0),
        body.validFrom, body.validTo ?? null,
        body.targetSegmentIds ?? [],
        body.maxUses ?? null, body.maxUsesPerCustomer ?? null,
        body.couponCode ?? null, body.requiresCouponCode ?? false,
        body.isExclusive ?? false, req.user!.id,
      ],
    );
    res.status(201).json({ id: r.rows[0].id });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

// ── Comisiones ─────────────────────────────────────────────────────────────

router.get("/commissions/rules", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const r = await masterPool.query(
    `SELECT id, code, name, calculation_base AS "calculationBase",
            scope_type AS "scopeType", scope_user_ids AS "scopeUserIds",
            product_id AS "productId", category_id AS "categoryId",
            percent_rate::text AS "percentRate",
            fixed_per_unit::text AS "fixedPerUnit",
            goal_amount::text AS "goalAmount",
            bonus_percent::text AS "bonusPercent",
            valid_from::text AS "validFrom", valid_to::text AS "validTo",
            priority, is_active AS "isActive"
       FROM commission_rules WHERE store_id = $1
       ORDER BY priority, name`,
    [storeIdOf(req)],
  );
  res.json({ rows: r.rows });
});

router.post("/commissions/rules", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      code: z.string().min(1),
      name: z.string().min(1),
      calculationBase: z.enum(["revenue", "gross_margin", "units"]),
      scopeType: z.enum(["all_sellers", "by_user", "by_role"]).default("all_sellers"),
      scopeUserIds: z.array(z.number().int().positive()).optional(),
      scopeRole: z.string().optional(),
      productId: z.number().int().positive().optional(),
      categoryId: z.number().int().positive().optional(),
      percentRate: z.number().min(0).max(100).optional(),
      fixedPerUnit: z.number().nonnegative().optional(),
      goalAmount: z.number().nonnegative().optional(),
      bonusPercent: z.number().min(0).max(100).optional(),
      priority: z.number().int().default(100),
      validFrom: z.string().optional(),
      validTo: z.string().optional(),
    }).parse(req.body);
    const r = await masterPool.query(
      `INSERT INTO commission_rules
         (store_id, code, name, calculation_base, scope_type, scope_user_ids,
          scope_role, product_id, category_id, percent_rate, fixed_per_unit,
          goal_amount, bonus_percent, priority, valid_from, valid_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, coalesce($15::date, CURRENT_DATE), $16::date)
       RETURNING id`,
      [
        storeIdOf(req), body.code, body.name, body.calculationBase, body.scopeType,
        body.scopeUserIds ?? null, body.scopeRole ?? null,
        body.productId ?? null, body.categoryId ?? null,
        body.percentRate != null ? String(body.percentRate) : null,
        body.fixedPerUnit != null ? String(body.fixedPerUnit) : null,
        body.goalAmount != null ? String(body.goalAmount) : null,
        body.bonusPercent != null ? String(body.bonusPercent) : null,
        body.priority, body.validFrom ?? null, body.validTo ?? null,
      ],
    );
    res.status(201).json({ id: r.rows[0].id });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/commissions/preview", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const userId = Number(req.query.userId);
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  res.json(await calculateCommissions(masterPool, storeIdOf(req), userId, year, month));
});

router.post("/commissions/close-period", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      userId: z.number().int().positive(),
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
    }).parse(req.body);
    const r = await closeCommissionPeriod(masterPool, storeIdOf(req), body.userId, body.year, body.month);
    res.status(201).json(r);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/commissions/earnings/:id/approve", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  await approveCommissionEarning(masterPool, Number(req.params.id), req.user!.id);
  res.json({ ok: true });
});

router.get("/commissions/earnings", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.query.userId ? Number(req.query.userId) : null;
  const r = await masterPool.query(
    `SELECT id, user_id AS "userId", period_year AS "periodYear",
            period_month AS "periodMonth",
            total_revenue::text AS "totalRevenue",
            commission_amount::text AS "commissionAmount",
            bonus_amount::text AS "bonusAmount",
            total_earned::text AS "totalEarned",
            status, goal_achieved AS "goalAchieved",
            created_at::text AS "createdAt"
       FROM commission_earnings WHERE store_id = $1
         AND ($2::int IS NULL OR user_id = $2)
       ORDER BY period_year DESC, period_month DESC, user_id LIMIT 200`,
    [storeIdOf(req), userId],
  );
  res.json({ rows: r.rows });
});

export default router;
