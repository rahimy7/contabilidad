/**
 * The e-CF catalogue: what each comprobante type is for, and what DGII demands
 * of it.
 *
 * The type is not decoration — it decides which XML blocks are mandatory, which
 * totals may be zero, whether a buyer RNC is required, and whether the document
 * can go in a periodic summary instead of one submission per sale. Encoding that
 * here rather than in a chain of `if (type === "E31")` across the builder is what
 * keeps a new type (DGII adds them) from being a rewrite.
 */

export interface EcfTypeSpec {
  /** Numeric code as it appears inside the XML: '31' for E31. */
  code: string;
  /** Full prefix as it appears in the eNCF: 'E31'. */
  prefix: string;
  name: string;
  /**
   * A comprobante that grants the buyer an ITBIS credit must identify them; one
   * for a final consumer need not. Getting this backwards is the single most
   * common rejection.
   */
  requiresBuyerRnc: boolean;
  /** Notes reference the document they modify (E33 débito, E34 crédito). */
  modifiesAnother: boolean;
  /**
   * Whether the taxpayer *issues* this type or *receives* it. E41 (compras) and
   * E43 (gastos menores) are self-issued against a supplier who cannot invoice
   * electronically, so they carry our RNC as buyer and theirs as issuer.
   */
  direction: "issued" | "self_issued";
  /** E32 below the RFCE threshold goes as a summary, not one call per sale. */
  eligibleForRfce: boolean;
  /** Whether the totals block may legitimately be all-exempt. */
  allowsFullyExempt: boolean;
}

export const ECF_TYPES: Record<string, EcfTypeSpec> = {
  E31: {
    code: "31", prefix: "E31", name: "Factura de Crédito Fiscal Electrónica",
    requiresBuyerRnc: true, modifiesAnother: false, direction: "issued",
    eligibleForRfce: false, allowsFullyExempt: true,
  },
  E32: {
    code: "32", prefix: "E32", name: "Factura de Consumo Electrónica",
    // A consumo invoice above RD$250,000 does need the buyer identified; below
    // it does not. The builder enforces the amount rule, not this flag.
    requiresBuyerRnc: false, modifiesAnother: false, direction: "issued",
    eligibleForRfce: true, allowsFullyExempt: true,
  },
  E33: {
    code: "33", prefix: "E33", name: "Nota de Débito Electrónica",
    requiresBuyerRnc: true, modifiesAnother: true, direction: "issued",
    eligibleForRfce: false, allowsFullyExempt: true,
  },
  E34: {
    code: "34", prefix: "E34", name: "Nota de Crédito Electrónica",
    requiresBuyerRnc: false, modifiesAnother: true, direction: "issued",
    eligibleForRfce: false, allowsFullyExempt: true,
  },
  E41: {
    code: "41", prefix: "E41", name: "Comprobante de Compras Electrónico",
    requiresBuyerRnc: true, modifiesAnother: false, direction: "self_issued",
    eligibleForRfce: false, allowsFullyExempt: true,
  },
  E43: {
    code: "43", prefix: "E43", name: "Comprobante para Gastos Menores Electrónico",
    requiresBuyerRnc: false, modifiesAnother: false, direction: "self_issued",
    eligibleForRfce: false, allowsFullyExempt: true,
  },
  E44: {
    code: "44", prefix: "E44", name: "Comprobante de Regímenes Especiales Electrónico",
    requiresBuyerRnc: true, modifiesAnother: false, direction: "issued",
    // Regímenes especiales are exempt by definition — zonas francas, diplomatic
    // missions. An ITBIS amount here is the error, not its absence.
    eligibleForRfce: false, allowsFullyExempt: true,
  },
  E45: {
    code: "45", prefix: "E45", name: "Comprobante Gubernamental Electrónico",
    requiresBuyerRnc: true, modifiesAnother: false, direction: "issued",
    eligibleForRfce: false, allowsFullyExempt: true,
  },
  E46: {
    code: "46", prefix: "E46", name: "Comprobante de Exportaciones Electrónico",
    // An export has no domestic buyer RNC — the buyer is abroad and identified
    // by name and country instead.
    requiresBuyerRnc: false, modifiesAnother: false, direction: "issued",
    eligibleForRfce: false, allowsFullyExempt: true,
  },
  E47: {
    code: "47", prefix: "E47", name: "Comprobante de Pagos al Exterior Electrónico",
    requiresBuyerRnc: false, modifiesAnother: false, direction: "issued",
    eligibleForRfce: false, allowsFullyExempt: true,
  },
};

export const ecfSpec = (ncfType: string): EcfTypeSpec | undefined =>
  ECF_TYPES[ncfType.toUpperCase()];

export const isEcfPrefix = (ncfType: string): boolean => ncfType.toUpperCase() in ECF_TYPES;

/**
 * DGII "tipo de ingreso" — how the revenue arose. 01 operacionales is the
 * default and covers ordinary sales; the rest exist for financial income, leases
 * and extraordinary items, which route differently on the IR-2.
 */
export const INCOME_TYPES: Record<string, string> = {
  "01": "Ingresos por operaciones (no financieros)",
  "02": "Ingresos financieros",
  "03": "Ingresos extraordinarios",
  "04": "Ingresos por arrendamientos",
  "05": "Ingresos por venta de activo depreciable",
  "06": "Otros ingresos",
};

/** DGII "tipo de pago": 1 contado, 2 crédito, 3 gratuito. */
export const PAYMENT_TYPES: Record<string, string> = {
  "1": "Contado",
  "2": "Crédito",
  "3": "Gratuito",
};

/**
 * Forma de pago, per DGII's table. The distinction matters on the 607 and for
 * the ITBIS-withholding rules that apply to card settlements.
 */
export const PAYMENT_METHODS: Record<string, string> = {
  "01": "Efectivo",
  "02": "Cheque/Transferencia/Depósito",
  "03": "Tarjeta de débito/crédito",
  "04": "Venta a crédito",
  "05": "Bonos o certificados de regalo",
  "06": "Permuta",
  "07": "Nota de crédito",
  "08": "Otras formas de pago",
};

/** Maps this system's payment vocabulary onto DGII's codes. */
export function dgiiPaymentMethod(method?: string): string {
  switch (method) {
    case "cash": return "01";
    case "transfer": return "02";
    case "card": return "03";
    case "credit": return "04";
    default: return "01";
  }
}

/** Contado unless the sale is on credit — DGII's TipoPago, not the method. */
export const dgiiPaymentType = (method?: string): string => (method === "credit" ? "2" : "1");
