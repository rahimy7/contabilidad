import { EcfDocument } from "./types";

/**
 * Builds the e-CF XML for a fiscal document.
 *
 * This is a faithful subset of the DGII e-CF structure — Encabezado (IdDoc,
 * Emisor, Comprador, Totales) and DetallesItems — enough to sign, transmit and
 * render, with the fields that carry money and identity. The exact element set
 * and ordering must be reconciled against the DGII XSD for the schema version in
 * force before certification; that reconciliation is a follow-up that needs the
 * official .xsd files, which is why validation is structural here rather than
 * XSD-based.
 *
 * Written without an XML library on purpose: the dependency the plan named for
 * XSD validation (libxmljs2) needs native compilation, and nothing here needs a
 * DOM. Escaping is handled explicitly.
 */

const esc = (v: string | number | undefined): string => {
  if (v === undefined || v === null) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

const el = (tag: string, value: string | number | undefined): string =>
  value === undefined || value === "" ? "" : `<${tag}>${esc(value)}</${tag}>`;

/** DGII wants dd-MM-yyyy in the XML body, not ISO. */
const dgiiDate = (iso?: string): string | undefined => {
  if (!iso) return undefined;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
};

export function buildEcfXml(doc: EcfDocument): string {
  const items = doc.lines
    .map((l) =>
      [
        "      <Item>",
        `        ${el("NumeroLinea", l.lineNo)}`,
        `        ${el("NombreItem", l.name)}`,
        `        ${el("IndicadorFacturacion", l.indicadorFacturacion)}`,
        `        ${el("CantidadItem", l.quantity)}`,
        `        ${el("PrecioUnitarioItem", l.unitPrice)}`,
        `        ${el("MontoItem", l.amount)}`,
        "      </Item>",
      ]
        .filter((s) => s.trim())
        .join("\n"),
    )
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    "  <Encabezado>",
    "    <Version>1.0</Version>",
    "    <IdDoc>",
    `      ${el("TipoeCF", doc.tipoECF)}`,
    `      ${el("eNCF", doc.eNCF)}`,
    `      ${el("FechaVencimientoSecuencia", dgiiDate(doc.sequenceExpiry))}`,
    `      ${el("TipoIngresos", "01")}`,
    `      ${el("TipoPago", "1")}`,
    "    </IdDoc>",
    "    <Emisor>",
    `      ${el("RNCEmisor", doc.issuerRnc)}`,
    `      ${el("RazonSocialEmisor", doc.issuerName)}`,
    `      ${el("FechaEmision", dgiiDate(doc.emittedAt))}`,
    "    </Emisor>",
    doc.buyerRnc || doc.buyerName
      ? [
          "    <Comprador>",
          `      ${el("RNCComprador", doc.buyerRnc)}`,
          `      ${el("RazonSocialComprador", doc.buyerName)}`,
          "    </Comprador>",
        ].join("\n")
      : "",
    "    <Totales>",
    `      ${el("MontoGravadoTotal", doc.totals.gravadoTotal)}`,
    `      ${el("MontoGravadoI1", doc.totals.gravado18)}`,
    `      ${el("MontoGravadoI2", doc.totals.gravado16)}`,
    `      ${el("MontoExento", doc.totals.exento)}`,
    `      ${el("ITBIS1", "18")}`,
    `      ${el("ITBIS2", "16")}`,
    `      ${el("TotalITBIS1", doc.totals.itbis18)}`,
    `      ${el("TotalITBIS2", doc.totals.itbis16)}`,
    `      ${el("TotalITBIS", doc.totals.totalItbis)}`,
    `      ${el("MontoTotal", doc.totals.montoTotal)}`,
    "    </Totales>",
    "  </Encabezado>",
    "  <DetallesItems>",
    items,
    "  </DetallesItems>",
    "</ECF>",
  ]
    .filter((s) => s !== "")
    .join("\n");
}

/**
 * The DGII "consulta" QR content: the URL a recipient scans to verify an e-CF
 * against DGII. Environment picks the host. The buyer RNC is omitted for
 * consumo final.
 */
export function buildQrUrl(params: {
  baseUrl: string;
  issuerRnc: string;
  buyerRnc?: string;
  eNCF: string;
  montoTotal: string;
  fechaEmision: string; // ISO
  securityCode: string;
}): string {
  const q = new URLSearchParams({
    RncEmisor: params.issuerRnc,
    ENCF: params.eNCF,
    MontoTotal: params.montoTotal,
    FechaEmision: dgiiDate(params.fechaEmision) ?? "",
    CodigoSeguridad: params.securityCode,
  });
  if (params.buyerRnc) q.set("RncComprador", params.buyerRnc);
  return `${params.baseUrl}?${q.toString()}`;
}
