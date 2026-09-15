import { SqlClient } from "../accounting/types";
import { Decimal, add, sub, cmp, toMoney, isZero } from "../accounting/decimal";
import { PostingEngine, ManualEntryLine } from "../accounting/posting-engine";

/**
 * Fixed asset register and monthly depreciation.
 *
 * Straight-line: the depreciable base is cost − residual, spread evenly over the
 * useful life. A monthly charge is base / life, except the final charge, which
 * takes whatever is left so accumulated depreciation lands exactly on the base
 * and never overshoots through rounding.
 *
 * A charge is posted at most once per asset per period — the unique index on
 * `depreciation_entries` is the guard, so re-running a month's depreciation is
 * safe.
 */
export class FixedAssetError extends Error {}

export interface RegisterAssetInput {
  companyId: number;
  code: string;
  name: string;
  category?: string;
  acquisitionDate: string;
  cost: Decimal;
  residualValue?: Decimal;
  usefulLifeMonths: number;
  /** Asset class account: 1.2.01.001 mobiliario (default), 1.2.01.002 vehículos, 1.2.01.004 cómputo. */
  assetAccountCode?: string;
  /**
   * Also post the acquisition, crediting this account (a bank, a payable, a
   * capital contribution). Leave it out when the asset came in through a
   * supplier invoice, which already debited the asset account.
   */
  capitalizeAgainstAccount?: string;
  postedBy?: number;
}

export class FixedAssets {
  constructor(private readonly client: SqlClient) {}

  async register(input: RegisterAssetInput): Promise<number> {
    if (input.usefulLifeMonths <= 0) throw new FixedAssetError("la vida útil debe ser positiva");
    if (cmp(input.residualValue ?? "0", input.cost) > 0) {
      throw new FixedAssetError("el valor residual no puede exceder el costo");
    }
    const assetAccount = input.assetAccountCode ?? "1.2.01.001";
    await this.accountId(input.companyId, assetAccount);
    const { rows } = await this.client.query(
      `INSERT INTO fixed_assets
         (company_id, code, name, category, acquisition_date, cost, residual_value, useful_life_months, asset_account_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        input.companyId,
        input.code,
        input.name,
        input.category ?? null,
        input.acquisitionDate,
        toMoney(input.cost),
        toMoney(input.residualValue ?? "0"),
        input.usefulLifeMonths,
        assetAccount,
      ],
    );
    const assetId = Number(rows[0].id);
    if (input.capitalizeAgainstAccount) {
      await new PostingEngine(this.client).postManual({
        companyId: input.companyId,
        entryDate: input.acquisitionDate,
        reference: String(assetId),
        sourceType: "fixed_asset",
        sourceEvent: "acquisition",
        memo: `Alta de activo ${input.code} ${input.name}`,
        lines: [
          { accountCode: assetAccount, debit: toMoney(input.cost), memo: input.name },
          { accountCode: input.capitalizeAgainstAccount, credit: toMoney(input.cost), memo: input.name },
        ],
        postedBy: input.postedBy,
      });
    }
    return assetId;
  }

  /**
   * Sells or scraps an asset. Brings depreciation up to the disposal month
   * first, then removes cost and accumulated depreciation from the books; what
   * was received for it (if anything) lands in the proceeds account, and the
   * difference against book value is a gain (4.2.03.001) or a loss (5.3.01.003).
   */
  async dispose(input: {
    companyId: number; assetId: number; date: string; proceeds?: Decimal; proceedsAccountCode?: string; reason?: string; postedBy?: number;
  }): Promise<{ journalEntryId: number; bookValue: Decimal; gainOrLoss: Decimal }> {
    const { rows } = await this.client.query(
      `SELECT id, code, name, cost::text, accumulated_depreciation::text, asset_account_code, accum_account_code, status
         FROM fixed_assets WHERE id=$1 AND company_id=$2 FOR UPDATE`,
      [input.assetId, input.companyId],
    );
    if (rows.length === 0) throw new FixedAssetError(`activo ${input.assetId} no existe`);
    const a = rows[0];
    if (a.status === "disposed") throw new FixedAssetError(`el activo ${a.code} ya fue dado de baja`);
    const proceeds = input.proceeds ?? "0";
    if (!isZero(proceeds) && !input.proceedsAccountCode) throw new FixedAssetError("indique la cuenta donde entra el producto de la venta");

    const bookValue = sub(a.cost, a.accumulated_depreciation);
    const gainOrLoss = sub(proceeds, bookValue);
    const lines: ManualEntryLine[] = [];
    if (!isZero(a.accumulated_depreciation)) lines.push({ accountCode: a.accum_account_code, debit: toMoney(a.accumulated_depreciation), memo: "Baja: depreciación acumulada" });
    if (!isZero(proceeds)) lines.push({ accountCode: input.proceedsAccountCode, debit: toMoney(proceeds), memo: "Producto de la venta" });
    if (cmp(gainOrLoss, "0") < 0) lines.push({ accountCode: "5.3.01.003", debit: toMoney(sub("0", gainOrLoss)), memo: "Pérdida en baja de activo" });
    lines.push({ accountCode: a.asset_account_code, credit: toMoney(a.cost), memo: "Baja: costo del activo" });
    if (cmp(gainOrLoss, "0") > 0) lines.push({ accountCode: "4.2.03.001", credit: toMoney(gainOrLoss), memo: "Ganancia en venta de activo" });

    const posted = await new PostingEngine(this.client).postManual({
      companyId: input.companyId, entryDate: input.date, reference: String(a.id), sourceType: "fixed_asset", sourceEvent: "disposal",
      memo: `Baja de activo ${a.code} ${a.name}${input.reason ? ` — ${input.reason}` : ""}`, lines, postedBy: input.postedBy,
    });
    await this.client.query(`UPDATE fixed_assets SET status='disposed', disposal_date=$2 WHERE id=$1`, [a.id, input.date]);
    return { journalEntryId: posted.entryId, bookValue: toMoney(bookValue), gainOrLoss: toMoney(gainOrLoss) };
  }

  /**
   * The straight-line charge for one month, given what's left and how many
   * charges the asset has already had. The final scheduled charge (number
   * `life`) takes the entire remaining balance, so accumulated depreciation
   * lands on the base exactly rather than a rounded month short.
   */
  monthlyCharge(cost: Decimal, residual: Decimal, life: number, accumulated: Decimal, priorCharges = 0): Decimal {
    const base = sub(cost, residual);
    const remaining = sub(base, accumulated);
    if (cmp(remaining, "0") <= 0) return "0";
    if (priorCharges + 1 >= life) return remaining; // final charge clears the rest
    const perMonth = toMoney(divide(base, life));
    return cmp(perMonth, remaining) >= 0 ? remaining : perMonth;
  }

  /**
   * Posts depreciation for every active asset for one period. Returns how many
   * assets were charged. Idempotent per (asset, year, period).
   */
  async runDepreciation(
    companyId: number,
    year: number,
    periodNo: number,
    entryDate: string,
    postedBy?: number,
    /**
     * `full_month` (default): an asset depreciates from the month it was acquired.
     * `mid_month`: acquired after the 15th, it starts the following month — the
     * usual convention so a purchase on the 28th does not carry a whole month.
     */
    convention: "full_month" | "mid_month" = "full_month",
  ): Promise<{ charged: number; total: Decimal }> {
    const periodStart = `${year}-${String(periodNo).padStart(2, "0")}-01`;
    const { rows } = await this.client.query(
      `SELECT id, cost::text, residual_value::text, useful_life_months,
              accumulated_depreciation::text, expense_account_code, accum_account_code
         FROM fixed_assets
        WHERE company_id=$1 AND status='active'
          AND acquisition_date <= $2::date
          AND ($3::text <> 'mid_month' OR acquisition_date < $4::date OR extract(day from acquisition_date) <= 15)`,
      [companyId, entryDate, convention, periodStart],
    );

    let charged = 0;
    let total: Decimal = "0";

    for (const a of rows) {
      const already = await this.client.query(
        `SELECT 1 FROM depreciation_entries WHERE asset_id=$1 AND fiscal_year=$2 AND period_no=$3`,
        [a.id, year, periodNo],
      );
      if (already.rows.length > 0) continue; // month already depreciated

      const prior = await this.client.query(
        `SELECT count(*)::int c FROM depreciation_entries WHERE asset_id=$1`,
        [a.id],
      );
      const amount = this.monthlyCharge(
        a.cost,
        a.residual_value,
        a.useful_life_months,
        a.accumulated_depreciation,
        prior.rows[0].c,
      );
      if (isZero(amount)) continue;

      const entryId = await this.postCharge(companyId, Number(a.id), entryDate, year, amount, a.expense_account_code, a.accum_account_code, postedBy);

      const newAccum = add(a.accumulated_depreciation, amount);
      const base = sub(a.cost, a.residual_value);
      await this.client.query(
        `UPDATE fixed_assets
            SET accumulated_depreciation=$1,
                status=CASE WHEN $1::numeric >= $2::numeric THEN 'fully_depreciated' ELSE 'active' END
          WHERE id=$3`,
        [toMoney(newAccum), toMoney(base), a.id],
      );

      await this.client.query(
        `INSERT INTO depreciation_entries (company_id, asset_id, fiscal_year, period_no, amount, journal_entry_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [companyId, a.id, year, periodNo, toMoney(amount), entryId],
      );

      charged++;
      total = add(total, amount);
    }

    return { charged, total };
  }

  private async postCharge(
    companyId: number,
    assetId: number,
    entryDate: string,
    year: number,
    amount: Decimal,
    expenseCode: string,
    accumCode: string,
    postedBy?: number,
  ): Promise<number> {
    const expenseId = await this.accountId(companyId, expenseCode);
    const accumId = await this.accountId(companyId, accumCode);
    const period = await this.periodId(companyId, entryDate);

    const entry = await this.client.query(
      `INSERT INTO journal_entries
         (company_id, period_id, entry_date, memo, currency, status, source_type, source_id, source_event, posted_by, posted_at)
       VALUES ($1,$2,$3,$4,'DOP','draft','depreciation',$5,'monthly',$6, now())
       ON CONFLICT (company_id, source_type, source_id, source_event) DO NOTHING
       RETURNING id`,
      [companyId, period, entryDate, `Depreciación activo ${assetId} ${entryDate}`, `${assetId}-${entryDate}`, postedBy ?? null],
    );
    if (entry.rows.length === 0) throw new FixedAssetError("cargo de depreciación duplicado");
    const entryId = Number(entry.rows[0].id);

    const amt = toMoney(amount);
    await this.client.query(
      `INSERT INTO journal_entry_lines
         (entry_id, company_id, line_no, account_id, debit, credit, currency, fx_rate, debit_func, credit_func)
       VALUES ($1,$2,1,$3,$5::numeric,0,'DOP',1,$5::numeric,0),
              ($1,$2,2,$4,0,$5::numeric,'DOP',1,0,$5::numeric)`,
      [entryId, companyId, expenseId, accumId, amt],
    );
    await this.client.query(
      `UPDATE journal_entries SET status='posted', entry_no=allocate_entry_no($1,$2::smallint) WHERE id=$3`,
      [companyId, year, entryId],
    );
    return entryId;
  }

  private async accountId(companyId: number, code: string): Promise<number> {
    const { rows } = await this.client.query(`SELECT id FROM chart_of_accounts WHERE company_id=$1 AND code=$2`, [companyId, code]);
    if (rows.length === 0) throw new FixedAssetError(`cuenta ${code} no existe`);
    return Number(rows[0].id);
  }

  private async periodId(companyId: number, date: string): Promise<number> {
    const { rows } = await this.client.query(
      `SELECT id FROM accounting_periods WHERE company_id=$1 AND $2::date BETWEEN start_date AND end_date AND period_no <= 12 ORDER BY period_no LIMIT 1`,
      [companyId, date],
    );
    if (rows.length === 0) throw new FixedAssetError(`no hay período que cubra ${date}`);
    return Number(rows[0].id);
  }
}

/**
 * base / n to 8 decimals, exactly — parsed straight into a scaled BigInt so no
 * float ever touches the amount. `toMoney` rounds the caller's result to the
 * centavo; the final monthly charge absorbs any remainder so accumulated
 * depreciation lands on the base precisely.
 */
function divide(base: Decimal, n: number): Decimal {
  const [int, frac = ""] = base.split(".");
  const scaled = BigInt(int + frac.padEnd(8, "0").slice(0, 8));
  const q = scaled / BigInt(n);
  const s = q.toString().padStart(9, "0");
  return `${s.slice(0, -8)}.${s.slice(-8)}`;
}
