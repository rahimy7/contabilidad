import { EcfDocument } from "./types";
import { ecfSpec } from "./ecf-types";

/**
 * The DGII validation rules, as rules.
 *
 * This exists in one place and is used twice: the issuer runs it before signing,
 * so a document that would be rejected never burns an eNCF; the simulator runs
 * the same rules on arrival, so a rejection in development is a rejection for
 * the reason DGII would give. Two separate implementations would drift, and the
 * one that drifted would be the one you trusted.
 *
 * Codes follow DGII's numbering where it is public. The message is Spanish
 * because it is what an operator reads off a rejected document.
 */

export interface ValidationMessage {
  code: string;
  message: string;
  /** `error` blocks the document; `warning` lets it through with a note. */
  severity: "error" | "warning";
  field?: string;
}

export interface ValidationResult {
  valid: boolean;
  messages: ValidationMessage[];
}

const RNC_RE = /^\d{9}$|^\d{11}$/;
const ENCF_RE = /^E\d{2}\d{10}$/;

export function validateEcf(doc: EcfDocument): ValidationResult {
  const m: ValidationMessage[] = [];
  const err = (code: string, message: string, field?: string) =>
    m.push({ code, message, severity: "error", field });
  const warn = (code: string, message: string, field?: string) =>
    m.push({ code, message, severity: "warning", field });

  const spec = ecfSpec(`E${doc.tipoECF}`);
  if (!spec) {
    err("TIPO-01", `tipo de e-CF desconocido: E${doc.tipoECF}`, "TipoeCF");
  }

  // ── identidad ──────────────────────────────────────────────────────────────
  if (!ENCF_RE.test(doc.eNCF ?? "")) {
    err("ENCF-01", `eNCF con formato inválido: ${doc.eNCF} (se espera E## + 10 dígitos)`, "eNCF");
  } else if (spec && !doc.eNCF.startsWith(spec.prefix)) {
    err("ENCF-02", `el eNCF ${doc.eNCF} no corresponde al tipo ${spec.prefix}`, "eNCF");
  }

  if (!RNC_RE.test(doc.issuerRnc ?? "")) {
    err("EMIS-01", `RNC del emisor inválido: ${doc.issuerRnc}`, "RNCEmisor");
  }
  if (!doc.issuerName?.trim()) {
    err("EMIS-02", "falta la razón social del emisor", "RazonSocialEmisor");
  }
  if (!doc.emittedAt) {
    err("EMIS-03", "falta la fecha de emisión", "FechaEmision");
  }

  // ── comprador ──────────────────────────────────────────────────────────────
  const total = num(doc.totals?.montoTotal);
  if (spec?.requiresBuyerRnc && !RNC_RE.test(doc.buyerRnc ?? "")) {
    err(
      "COMP-01",
      `${spec.name} exige identificar al comprador con un RNC/cédula válido`,
      "RNCComprador",
    );
  }
  // A consumo sale above RD$250,000 must name its buyer: it is the threshold at
  // which an anonymous sale stops being credible to DGII.
  if (doc.tipoECF === "32" && total >= 250000 && !RNC_RE.test(doc.buyerRnc ?? "")) {
    err(
      "COMP-02",
      "una factura de consumo de RD$250,000 o más debe identificar al comprador",
      "RNCComprador",
    );
  }
  if (doc.buyerRnc && !RNC_RE.test(doc.buyerRnc)) {
    err("COMP-03", `RNC del comprador inválido: ${doc.buyerRnc}`, "RNCComprador");
  }
  if (doc.issuerRnc && doc.buyerRnc && doc.issuerRnc === doc.buyerRnc && spec?.direction === "issued") {
    err("COMP-04", "el emisor y el comprador no pueden ser el mismo RNC", "RNCComprador");
  }
  // An export has a buyer abroad; naming a country is how DGII knows it left.
  if (doc.tipoECF === "46" && !doc.buyerCountry) {
    warn("COMP-05", "un comprobante de exportación debería indicar el país del comprador", "PaisComprador");
  }

  // ── notas ──────────────────────────────────────────────────────────────────
  if (spec?.modifiesAnother) {
    if (!doc.modifiesNcf) {
      err("REF-01", `${spec.name} debe referenciar el comprobante que modifica`, "NCFModificado");
    }
    if (!doc.modifiesDate) {
      warn("REF-02", "falta la fecha del comprobante modificado", "FechaNCFModificado");
    }
  } else if (doc.modifiesNcf) {
    err("REF-03", "sólo las notas de crédito o débito referencian otro comprobante", "NCFModificado");
  }

  // ── líneas ─────────────────────────────────────────────────────────────────
  if (!doc.lines?.length) {
    err("ITEM-01", "el comprobante no tiene líneas de detalle", "DetallesItems");
  }
  let lineSum = 0;
  for (const l of doc.lines ?? []) {
    const label = `línea ${l.lineNo}`;
    if (!l.name?.trim()) err("ITEM-02", `${label}: falta la descripción del item`, "NombreItem");
    if (num(l.quantity) <= 0) err("ITEM-03", `${label}: la cantidad debe ser mayor que cero`, "CantidadItem");
    if (num(l.unitPrice) < 0) err("ITEM-04", `${label}: el precio unitario no puede ser negativo`, "PrecioUnitarioItem");
    if (![1, 2, 3, 4].includes(l.indicadorFacturacion)) {
      err("ITEM-05", `${label}: indicador de facturación inválido`, "IndicadorFacturacion");
    }
    lineSum += num(l.amount);
  }

  // ── totales ────────────────────────────────────────────────────────────────
  const t = doc.totals ?? ({} as EcfDocument["totals"]);
  const gravado = num(t.gravadoTotal);
  const exento = num(t.exento);
  const itbis = num(t.totalItbis);

  if (total <= 0 && doc.tipoECF !== "34") {
    err("TOT-01", "el monto total debe ser mayor que cero", "MontoTotal");
  }

  // The sum of the rate buckets is the taxed base; if they disagree the document
  // says two different things about the same money.
  const buckets = num(t.gravado18) + num(t.gravado16) + num(t.gravado0);
  if (gravado > 0 && !close(buckets, gravado)) {
    err(
      "TOT-02",
      `la suma de montos gravados por tasa (${buckets.toFixed(2)}) no cuadra con el gravado total (${gravado.toFixed(2)})`,
      "MontoGravadoTotal",
    );
  }

  // ITBIS must be what the rates produce, within a rounding centavo per bucket.
  const expectedItbis = num(t.gravado18) * 0.18 + num(t.gravado16) * 0.16;
  if (!close(expectedItbis, itbis, 0.05)) {
    err(
      "TOT-03",
      `el ITBIS declarado (${itbis.toFixed(2)}) no corresponde a las bases gravadas (se esperaba ${expectedItbis.toFixed(2)})`,
      "TotalITBIS",
    );
  }

  const expectedTotal = gravado + exento + itbis + num(t.isc) + num(t.tipLegal);
  if (!close(expectedTotal, total, 0.05)) {
    err(
      "TOT-04",
      `el monto total (${total.toFixed(2)}) no cuadra con gravado + exento + ITBIS (${expectedTotal.toFixed(2)})`,
      "MontoTotal",
    );
  }

  // The detail must add up to the header. A header that disagrees with its own
  // lines is the failure that silently misreports revenue.
  if (doc.lines?.length && !close(lineSum, gravado + exento, 0.05)) {
    err(
      "TOT-05",
      `la suma de las líneas (${lineSum.toFixed(2)}) no cuadra con gravado + exento (${(gravado + exento).toFixed(2)})`,
      "DetallesItems",
    );
  }

  // Regímenes especiales are exempt by definition; ITBIS on one is the error.
  if (doc.tipoECF === "44" && itbis > 0) {
    err("TOT-06", "un comprobante de régimen especial no debe liquidar ITBIS", "TotalITBIS");
  }
  // Likewise an export: the ITBIS is not charged, it is zero-rated.
  if (doc.tipoECF === "46" && itbis > 0) {
    err("TOT-07", "un comprobante de exportación no debe liquidar ITBIS", "TotalITBIS");
  }

  if (doc.currency && doc.currency !== "DOP" && !doc.fxRate) {
    err("MON-01", `un comprobante en ${doc.currency} debe indicar la tasa de cambio`, "TipoCambio");
  }

  if (doc.paymentType === "2" && !doc.dueDate) {
    warn("PAGO-01", "una venta a crédito debería indicar la fecha límite de pago", "FechaLimitePago");
  }

  return { valid: !m.some((x) => x.severity === "error"), messages: m };
}

const num = (v: string | number | undefined | null): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Money comparison with a tolerance, because rounding is real and exactness is not. */
const close = (a: number, b: number, tolerance = 0.02): boolean => Math.abs(a - b) <= tolerance;
