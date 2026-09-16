/**
 * Reglas fiscales del maestro de proveedores.
 *
 * Del lado de la compra, lo que importa ante la DGII es otra cosa que en la
 * venta: qué comprobante respalda el gasto (el que emite el proveedor, o el que
 * emite la empresa por él cuando es informal o del exterior), cómo se clasifica
 * en el 606 y si hay que retenerle ITBIS o ISR para el IR-17.
 */

import { checkIdentityDocument, type FiscalCheck, type PersonType, type TaxIdType } from "./fiscal-identity";

export * from "./fiscal-identity";

export type SupplierTaxpayerType = "contribuyente" | "rst" | "regimen_especial" | "informal" | "exterior";
export type PurchaseType = "inventory" | "supply" | "fixed_asset" | "service" | "expense";

/** Régimen del proveedor y el comprobante que respalda sus compras. */
export const SUPPLIER_TAXPAYER_TYPES: Record<SupplierTaxpayerType, { label: string; ncf: string; hint: string }> = {
  contribuyente: { label: "Contribuyente (régimen ordinario)", ncf: "B01", hint: "Emite comprobante de crédito fiscal" },
  rst: { label: "Régimen Simplificado de Tributación (RST)", ncf: "B01", hint: "Emite comprobante de crédito fiscal" },
  regimen_especial: { label: "Régimen especial (zona franca)", ncf: "B01", hint: "Emite comprobante de crédito fiscal" },
  informal: { label: "Persona física no inscrita (informal)", ncf: "B11", hint: "La empresa le emite el comprobante de compras" },
  exterior: { label: "Proveedor del exterior", ncf: "B17", hint: "La empresa emite el comprobante de pagos al exterior (609)" },
};

/** Comprobantes que respaldan una compra; los B11, B13 y B17 los emite la empresa. */
export const PURCHASE_NCF_TYPES: Record<string, string> = {
  B01: "B01 · Crédito fiscal (lo emite el proveedor)",
  B11: "B11 · Comprobante de compras (lo emite la empresa)",
  B13: "B13 · Gastos menores (lo emite la empresa)",
  B17: "B17 · Pagos al exterior (lo emite la empresa)",
  E31: "E31 · e-CF Crédito fiscal",
  E41: "E41 · e-CF Compras",
  E43: "E43 · e-CF Gastos menores",
  E47: "E47 · e-CF Pagos al exterior",
};

/** Naturaleza del comprobante: el electrónico equivale a su serie B. */
const PURCHASE_NCF_NATURE: Record<string, "credito_fiscal" | "compras" | "gastos_menores" | "exterior"> = {
  B01: "credito_fiscal", E31: "credito_fiscal",
  B11: "compras", E41: "compras",
  B13: "gastos_menores", E43: "gastos_menores",
  B17: "exterior", E47: "exterior",
};

/** 606 — tipo de bienes y servicios comprados. */
export const DGII_606_EXPENSE_TYPES: Record<string, string> = {
  "01": "01 · Gastos de personal",
  "02": "02 · Gastos por trabajos, suministros y servicios",
  "03": "03 · Arrendamientos",
  "04": "04 · Gastos de activos fijos",
  "05": "05 · Gastos de representación",
  "06": "06 · Otras deducciones admitidas",
  "07": "07 · Gastos financieros",
  "08": "08 · Gastos extraordinarios",
  "09": "09 · Compras y gastos que forman parte del costo de venta",
  "10": "10 · Adquisiciones de activos",
  "11": "11 · Gastos de seguros",
};

/** IR-17 — concepto del ISR retenido. Las claves son las que agrupa el reporte. */
export const IR17_CONCEPTS: Record<string, string> = {
  alquileres: "Alquileres",
  honorarios: "Honorarios por servicios",
  otras_rentas: "Otras rentas",
  dividendos: "Dividendos",
  intereses: "Intereses a personas físicas",
  premios: "Premios o ganancias",
  remesas_exterior: "Remesas al exterior",
  retribuciones_complementarias: "Retribuciones complementarias",
  transferencia_bienes: "Transferencia de bienes",
  proveedores_estado: "Proveedores del Estado",
};

/** Qué se le compra normalmente: decide la cuenta que recibe el cargo. */
export const PURCHASE_TYPES: Record<PurchaseType, string> = {
  inventory: "Mercancía para la venta",
  supply: "Suministros y materiales de consumo",
  fixed_asset: "Activos fijos",
  service: "Servicios",
  expense: "Gastos generales",
};

export const OPERATION_TYPES: Record<"bienes" | "servicios", string> = {
  bienes: "Bienes",
  servicios: "Servicios",
};

export const SUPPLIER_PAYMENT_METHODS: Record<string, string> = {
  transfer: "Transferencia",
  check: "Cheque",
  cash: "Efectivo",
  card: "Tarjeta",
};

export const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];

export const BANK_ACCOUNT_TYPES: Record<string, string> = {
  corriente: "Corriente",
  ahorro: "Ahorro",
  otro: "Otra",
};

/** Bancos de plaza; se sugieren, no se imponen. */
export const DR_BANKS = [
  "Banco Popular Dominicano", "Banreservas", "Banco BHD", "Scotiabank", "Banco Santa Cruz",
  "Banesco", "Banco Caribe", "Banco BDI", "Banco López de Haro", "Banco Promerica",
  "Banco Vimenca", "Banco Lafise", "Citibank", "Banco Ademi", "Asociación Popular de Ahorros y Préstamos",
  "Asociación Cibao de Ahorros y Préstamos", "Asociación La Nacional",
];

export interface SupplierFiscalIdentity {
  personType: PersonType;
  taxIdType?: TaxIdType | null;
  rnc?: string | null;
  foreignId?: string | null;
  legalName?: string | null;
  taxpayerType: SupplierTaxpayerType;
  defaultNcfType?: string | null;
  operationType?: "bienes" | "servicios" | null;
  defaultExpenseType?: string | null;
  applyRetentions?: boolean;
  isrRetentionConcept?: string | null;
}

/**
 * Coherencia entre el proveedor, su régimen, el comprobante que respalda sus
 * compras y las retenciones. Un B01 de alguien sin RNC, o un B11 a una empresa
 * inscrita, es exactamente lo que la DGII rechaza al validar el 606.
 */
export function checkSupplierFiscalIdentity(f: SupplierFiscalIdentity): FiscalCheck {
  const isForeign = f.taxpayerType === "exterior";
  const { errors, warnings } = checkIdentityDocument({ ...f, isForeign });
  const hasDominicanId = f.taxIdType === "rnc" || f.taxIdType === "cedula";

  if (!isForeign && !hasDominicanId) {
    errors.push(`Un proveedor «${SUPPLIER_TAXPAYER_TYPES[f.taxpayerType].label}» se identifica con RNC o cédula.`);
  }
  if (f.taxpayerType === "informal" && (f.personType !== "fisica" || f.taxIdType !== "cedula")) {
    errors.push("Un proveedor informal es una persona física identificada con cédula.");
  }
  if (isForeign && hasDominicanId) {
    warnings.push("Un proveedor del exterior no suele tener RNC ni cédula dominicana.");
  }

  const ncf = f.defaultNcfType ?? "";
  if (ncf) {
    const nature = PURCHASE_NCF_NATURE[ncf];
    if (!nature) errors.push(`Tipo de comprobante de compra desconocido: ${ncf}.`);
    if (nature === "credito_fiscal" && (f.taxpayerType === "informal" || isForeign)) {
      errors.push(
        f.taxpayerType === "informal"
          ? "A un proveedor informal se le emite comprobante de compras (B11/E41), no crédito fiscal."
          : "Un proveedor del exterior no emite comprobante de crédito fiscal: use pagos al exterior (B17/E47).",
      );
    }
    if (nature === "compras" && f.taxpayerType !== "informal") {
      errors.push("El comprobante de compras (B11/E41) es sólo para personas físicas no inscritas.");
    }
    if (nature === "exterior" && !isForeign) {
      errors.push("El comprobante de pagos al exterior (B17/E47) es sólo para proveedores del exterior.");
    }
  }

  if (f.defaultExpenseType && !DGII_606_EXPENSE_TYPES[f.defaultExpenseType]) {
    errors.push(`Tipo de bienes y servicios del 606 desconocido: ${f.defaultExpenseType}.`);
  }
  if (f.isrRetentionConcept && !IR17_CONCEPTS[f.isrRetentionConcept]) {
    errors.push(`Concepto de retención desconocido: ${f.isrRetentionConcept}.`);
  }

  // La retención es obligación del que paga: se advierte, la tasa la ponen las reglas de la empresa.
  const usuallyWithheld = f.taxpayerType === "informal" || (f.personType === "fisica" && f.operationType === "servicios");
  if (usuallyWithheld && !f.applyRetentions) {
    warnings.push("A una persona física que presta servicios, o a un informal, normalmente se le retiene ITBIS e ISR.");
  }

  return { errors, warnings };
}
