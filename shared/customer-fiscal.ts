/**
 * Reglas fiscales del maestro de clientes.
 *
 * Compartidas a propósito: el servidor las hace cumplir al guardar y la ficha
 * las explica mientras se llena, así un error se ve antes de pulsar Guardar y
 * no puede haber una regla en pantalla que el servidor no conozca.
 */

import {
  checkIdentityDocument,
  type FiscalCheck, type PersonType, type TaxIdType,
} from "./fiscal-identity";

// Lo común a clientes y proveedores; se reexporta para quien ya importa de aquí.
export * from "./fiscal-identity";

export type TaxpayerType =
  | "contribuyente"
  | "rst"
  | "regimen_especial"
  | "gubernamental"
  | "consumidor_final"
  | "exterior";
export type CreditLineStatus = "none" | "active" | "suspended" | "blocked";
export type CreditApplicationStatus = "pending" | "approved" | "rejected" | "cancelled";
export type GuaranteeType =
  | "ninguna"
  | "pagare"
  | "fianza"
  | "hipotecaria"
  | "prendaria"
  | "carta_credito"
  | "deposito";

/** Régimen del cliente y el comprobante que le corresponde por defecto. */
export const TAXPAYER_TYPES: Record<TaxpayerType, { label: string; ncf: string }> = {
  contribuyente: { label: "Contribuyente (régimen ordinario)", ncf: "B01" },
  rst: { label: "Régimen Simplificado de Tributación (RST)", ncf: "B01" },
  regimen_especial: { label: "Régimen especial (zona franca, exento)", ncf: "B14" },
  gubernamental: { label: "Entidad gubernamental", ncf: "B15" },
  consumidor_final: { label: "Consumidor final", ncf: "B02" },
  exterior: { label: "Cliente del exterior", ncf: "B16" },
};

export const NCF_TYPES: Record<string, string> = {
  B01: "B01 · Crédito fiscal",
  B02: "B02 · Consumo",
  B14: "B14 · Régimen especial",
  B15: "B15 · Gubernamental",
  B16: "B16 · Exportaciones",
  E31: "E31 · e-CF Crédito fiscal",
  E32: "E32 · e-CF Consumo",
  E44: "E44 · e-CF Régimen especial",
  E45: "E45 · e-CF Gubernamental",
  E46: "E46 · e-CF Exportaciones",
};

/** Comprobantes para los que la DGII exige RNC o cédula del comprador. */
export const NCF_REQUIRES_TAX_ID = ["B01", "E31", "B14", "E44", "B15", "E45"];

/** El comprobante electrónico equivalente comparte la misma naturaleza. */
const NCF_NATURE: Record<string, string> = {
  B01: "01", E31: "01", B02: "02", E32: "02", B14: "14", E44: "14",
  B15: "15", E45: "15", B16: "16", E46: "16",
};

export const CREDIT_LINE_STATUS: Record<CreditLineStatus, string> = {
  none: "Sin crédito",
  active: "Activo",
  suspended: "Suspendido",
  blocked: "Bloqueado",
};

export const CREDIT_APPLICATION_STATUS: Record<CreditApplicationStatus, string> = {
  pending: "En evaluación",
  approved: "Aprobada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
};

export const GUARANTEE_TYPES: Record<GuaranteeType, string> = {
  ninguna: "Sin garantía",
  pagare: "Pagaré notarial",
  fianza: "Fianza personal / solidaria",
  hipotecaria: "Garantía hipotecaria",
  prendaria: "Garantía prendaria",
  carta_credito: "Carta de crédito bancaria",
  deposito: "Depósito en garantía",
};

export interface FiscalIdentity {
  personType: PersonType;
  taxIdType?: TaxIdType | null;
  rnc?: string | null;
  foreignId?: string | null;
  legalName?: string | null;
  taxpayerType: TaxpayerType;
  defaultNcfType?: string | null;
  itbisExempt?: boolean;
  exemptionReference?: string | null;
}

/**
 * Coherencia entre quién es el cliente, su identificación, su régimen y el
 * comprobante que se le emitirá. Es la misma validación que la DGII hará sobre
 * el 607: un B01 sin RNC válido se rechaza allá, mejor rechazarlo aquí.
 */
export function checkFiscalIdentity(f: FiscalIdentity): FiscalCheck {
  const { errors, warnings } = checkIdentityDocument({ ...f, isForeign: f.taxpayerType === "exterior" });
  const hasDominicanId = f.taxIdType === "rnc" || f.taxIdType === "cedula";

  const needsId = ["contribuyente", "rst", "regimen_especial", "gubernamental"].includes(f.taxpayerType);
  if (needsId && !hasDominicanId) {
    errors.push(`El régimen «${TAXPAYER_TYPES[f.taxpayerType].label}» exige RNC o cédula.`);
  }
  if (f.taxpayerType === "gubernamental" && f.personType !== "juridica") {
    errors.push("Una entidad gubernamental es persona jurídica.");
  }

  const ncf = f.defaultNcfType ?? "";
  if (ncf) {
    if (!NCF_TYPES[ncf]) errors.push(`Tipo de comprobante desconocido: ${ncf}.`);
    if (NCF_REQUIRES_TAX_ID.includes(ncf) && !hasDominicanId) {
      errors.push(`El comprobante ${ncf} exige RNC o cédula del cliente.`);
    }
    const nature = NCF_NATURE[ncf];
    if (nature === "14" && f.taxpayerType !== "regimen_especial") {
      errors.push("El comprobante de régimen especial es sólo para clientes de régimen especial.");
    }
    if (nature === "15" && f.taxpayerType !== "gubernamental") {
      errors.push("El comprobante gubernamental es sólo para entidades del Estado.");
    }
    if (f.taxpayerType === "gubernamental" && nature !== "15") {
      warnings.push("A una entidad gubernamental se le factura con comprobante gubernamental (B15/E45).");
    }
    if (f.taxpayerType === "regimen_especial" && nature !== "14") {
      warnings.push("A un cliente de régimen especial se le factura con B14/E44.");
    }
  }

  if (f.itbisExempt && !f.exemptionReference?.trim()) {
    errors.push("Un cliente exento de ITBIS necesita la resolución o constancia que lo respalda.");
  }

  return { errors, warnings };
}
