import { SqlClient } from "../accounting/types";
import { PostingEngine } from "../accounting/posting-engine";
import { Decimal, mul, sub, roundTo, isZero, isNegative, toMoney } from "../accounting/decimal";

/**
 * Payments to non-residents, and the ISR withheld on them (Formato 609).
 *
 * Recording one posts a three-legged entry: the expense is booked gross, the
 * bank is credited what the beneficiary actually receives, and the ISR withheld
 * accrues to its own control account (2.1.02.005), separate from the domestic
 * retentions of the IR-17. The three legs balance by construction —
 * gross = net + withheld — so the entry always ties out.
 */
export class ForeignPaymentError extends Error {}

/** ISR withheld on payments abroad accrues here; remitted separately from IR-17. */
const ISR_EXTERIOR_ACCOUNT = "2.1.02.005";
const DEFAULT_EXPENSE = "5.2.02.003"; // Honorarios profesionales
const DEFAULT_PAYMENT = "1.1.01.003"; // Bancos

export interface ForeignPaymentInput {
  companyId: number;
  beneficiaryName: string;
  country?: string;
  /** 609 tipo de renta: servicios | intereses | dividendos | regalias | alquileres | … */
  incomeType?: string;
  paymentDate: string;
  /** Monto pagado, en DOP. */
  grossAmount: Decimal;
  /** Withholding rate; 27% unless a treaty reduces it. */
  isrRate?: Decimal;
  /** Overrides the computed withholding (rate × gross) when a treaty gives an exact figure. */
  isrRetained?: Decimal;
  expenseAccountRef?: string;
  paymentAccountRef?: string;
  memo?: string;
  reference?: string;
  postedBy?: number;
}

export class ForeignPayments {
  constructor(private readonly client: SqlClient) {}

  async record(
    input: ForeignPaymentInput,
  ): Promise<{ paymentId: number; journalEntryId: number; isrRetained: Decimal; net: Decimal }> {
    if (isNegative(input.grossAmount) || isZero(input.grossAmount)) {
      throw new ForeignPaymentError("el monto pagado debe ser positivo");
    }
    const rate = input.isrRate ?? "0.27";
    const gross = toMoney(input.grossAmount);
    const isrRetained =
      input.isrRetained != null ? toMoney(input.isrRetained) : toMoney(roundTo(mul(gross, rate), 2));
    if (isNegative(isrRetained)) throw new ForeignPaymentError("la retención no puede ser negativa");
    const net = sub(gross, isrRetained);
    if (isNegative(net)) throw new ForeignPaymentError("la retención excede el monto pagado");

    const expenseRef = input.expenseAccountRef ?? DEFAULT_EXPENSE;
    const paymentRef = input.paymentAccountRef ?? DEFAULT_PAYMENT;
    const incomeType = input.incomeType ?? "servicios";

    const inserted = await this.client.query(
      `INSERT INTO foreign_payments
         (company_id, beneficiary_name, country, income_type, payment_date, gross_amount,
          isr_rate, isr_retained, expense_account_ref, payment_account_ref, memo, reference)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [
        input.companyId,
        input.beneficiaryName,
        input.country ?? null,
        incomeType,
        input.paymentDate,
        gross,
        rate,
        isrRetained,
        expenseRef,
        paymentRef,
        input.memo ?? null,
        input.reference ?? null,
      ],
    );
    const paymentId = Number(inserted.rows[0].id);

    const memo = input.memo ?? `Pago al exterior — ${input.beneficiaryName}`;
    const lines: Array<{ accountCode: string; debit?: Decimal; credit?: Decimal; memo: string }> = [
      { accountCode: expenseRef, debit: gross, memo },
    ];
    if (!isZero(net)) lines.push({ accountCode: paymentRef, credit: net, memo });
    if (!isZero(isrRetained)) lines.push({ accountCode: ISR_EXTERIOR_ACCOUNT, credit: isrRetained, memo });

    const posted = await new PostingEngine(this.client).postManual({
      companyId: input.companyId,
      entryDate: input.paymentDate,
      currency: "DOP",
      reference: `foreign-payment-${paymentId}`,
      memo,
      lines,
      postedBy: input.postedBy,
    });

    await this.client.query(`UPDATE foreign_payments SET journal_entry_id=$1 WHERE id=$2`, [
      posted.entryId,
      paymentId,
    ]);
    return { paymentId, journalEntryId: posted.entryId, isrRetained, net };
  }
}
