import {
  EcfDocument, RfceSummary, CommercialApproval, Acknowledgement, SequenceVoid,
} from "./types";
import { ecfSpec } from "./ecf-types";

/**
 * Builds the DGII e-CF XML documents.
 *
 * Five documents live here because they are one grammar: the comprobante
 * itself, the periodic consumo summary (RFCE), the buyer's commercial approval
 * (ACECF), the receipt acknowledgement (ARECF), and the declaration of voided
 * ranges. They share the escaping, the date format and the element ordering, and
 * splitting them across files would duplicate all three.
 *
 * Element *order* is load-bearing. The DGII XSD declares sequences, not choices,
 * so a correct element in the wrong position is a rejection with a message that
 * names neither. The order below follows the schema; when the official .xsd for
 * a new version arrives, this file is the one to reconcile against it.
 *
 * Written without an XML library on purpose: nothing here needs a DOM, and the
 * candidate for XSD validation (libxmljs2) wants native compilation. Escaping is
 * explicit and total — every value goes through `esc`.
 */

const esc = (v: string | number | undefined | null): string => {
  if (v === undefined || v === null) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

/** An element, omitted entirely when it has no value. DGII rejects empty tags. */
const el = (tag: string, value: string | number | undefined | null): string =>
  value === undefined || value === null || value === "" ? "" : `<${tag}>${esc(value)}</${tag}>`;

/** DGII wants dd-MM-yyyy in the body, never ISO. */
export const dgiiDate = (iso?: string): string | undefined => {
  if (!iso) return undefined;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}-${m}-${y}` : undefined;
};

/** dd-MM-yyyy HH:mm:ss, used for signature and approval timestamps. */
const dgiiDateTime = (iso?: string): string | undefined => {
  if (!iso) return undefined;
  const date = dgiiDate(iso);
  const time = iso.slice(11, 19) || "00:00:00";
  return date ? `${date} ${time}` : undefined;
};

/** Amounts go as plain decimals with two places; DGII rejects thousands separators. */
const amt = (v: string | number | undefined): string | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  // Zero is meaningful in some blocks and noise in others; callers omit by
  // passing undefined, so a real zero that reaches here is printed.
  return n.toFixed(2);
};

/** Drops the blank lines that optional elements leave behind. */
const lines = (parts: (string | undefined)[]): string =>
  parts.filter((p) => p !== undefined && p !== null && p.trim() !== "").join("\n");

const indent = (block: string, spaces: number): string =>
  block
    .split("\n")
    .map((l) => (l.trim() ? " ".repeat(spaces) + l : l))
    .join("\n");

// ── el comprobante ───────────────────────────────────────────────────────────

export function buildEcfXml(doc: EcfDocument): string {
  const spec = ecfSpec(`E${doc.tipoECF}`);
  const t = doc.totals;

  const idDoc = lines([
    el("TipoeCF", doc.tipoECF),
    el("eNCF", doc.eNCF),
    el("FechaVencimientoSecuencia", dgiiDate(doc.sequenceExpiry)),
    el("IndicadorMontoGravado", "0"),
    el("TipoIngresos", doc.incomeType ?? "01"),
    el("TipoPago", doc.paymentType ?? "1"),
    // Credit terms only appear on a credit sale; on a cash sale DGII rejects them.
    doc.paymentType === "2" ? el("FechaLimitePago", dgiiDate(doc.dueDate)) : "",
  ]);

  const emisor = lines([
    el("RNCEmisor", doc.issuerRnc),
    el("RazonSocialEmisor", doc.issuerName),
    el("NombreComercial", doc.issuerTradeName),
    el("DireccionEmisor", doc.issuerAddress),
    el("TelefonoEmisor", doc.issuerPhone),
    el("CorreoEmisor", doc.issuerEmail),
    el("FechaEmision", dgiiDate(doc.emittedAt)),
  ]);

  // The buyer block is omitted entirely for an unidentified consumo sale — an
  // empty <Comprador/> is a schema error, not a neutral placeholder.
  const hasBuyer = Boolean(doc.buyerRnc || doc.buyerName);
  const comprador = hasBuyer
    ? lines([
        el("RNCComprador", doc.buyerRnc),
        el("RazonSocialComprador", doc.buyerName),
        el("PaisComprador", doc.buyerCountry),
      ])
    : "";

  const totales = lines([
    el("MontoGravadoTotal", amt(t.gravadoTotal)),
    el("MontoGravadoI1", amt(t.gravado18)),
    el("MontoGravadoI2", amt(t.gravado16)),
    el("MontoGravadoI3", amt(t.gravado0)),
    el("MontoExento", amt(t.exento)),
    // The rate elements only appear when there is a base taxed at that rate.
    Number(t.gravado18 ?? 0) > 0 ? el("ITBIS1", "18") : "",
    Number(t.gravado16 ?? 0) > 0 ? el("ITBIS2", "16") : "",
    Number(t.gravado0 ?? 0) > 0 ? el("ITBIS3", "0") : "",
    Number(t.gravado18 ?? 0) > 0 ? el("TotalITBIS1", amt(t.itbis18)) : "",
    Number(t.gravado16 ?? 0) > 0 ? el("TotalITBIS2", amt(t.itbis16)) : "",
    Number(t.gravado0 ?? 0) > 0 ? el("TotalITBIS3", amt(t.itbis0 ?? "0")) : "",
    el("TotalITBIS", amt(t.totalItbis)),
    Number(t.isc ?? 0) > 0 ? el("MontoImpuestoSelectivoConsumo", amt(t.isc)) : "",
    Number(t.tipLegal ?? 0) > 0 ? el("MontoPropinaLegal", amt(t.tipLegal)) : "",
    el("MontoTotal", amt(t.montoTotal)),
    Number(t.retentionItbis ?? 0) > 0 ? el("TotalITBISRetenido", amt(t.retentionItbis)) : "",
    Number(t.retentionIsr ?? 0) > 0 ? el("TotalISRRetencion", amt(t.retentionIsr)) : "",
  ]);

  // A note carries the comprobante it modifies; anything else must not.
  const infoRef = spec?.modifiesAnother && doc.modifiesNcf
    ? lines([
        el("NCFModificado", doc.modifiesNcf),
        el("FechaNCFModificado", dgiiDate(doc.modifiesDate)),
        el("CodigoModificacion", doc.modificationCode ?? "1"),
      ])
    : "";

  const otraMoneda = doc.currency && doc.currency !== "DOP"
    ? lines([
        el("TipoMoneda", doc.currency),
        el("TipoCambio", doc.fxRate),
        el("MontoTotalOtraMoneda", amt(t.montoTotal)),
      ])
    : "";

  const items = doc.lines
    .map((l) =>
      lines([
        "<Item>",
        indent(
          lines([
            el("NumeroLinea", l.lineNo),
            el("IndicadorFacturacion", l.indicadorFacturacion),
            el("NombreItem", l.name),
            el("IndicadorBienoServicio", "1"),
            el("CodigoItem", l.productCode),
            el("CantidadItem", l.quantity),
            el("UnidadMedida", l.unitOfMeasure),
            el("PrecioUnitarioItem", amt(l.unitPrice)),
            Number(l.discount ?? 0) > 0 ? el("DescuentoMonto", amt(l.discount)) : "",
            el("MontoItem", amt(l.amount)),
          ]),
          2,
        ),
        "</Item>",
      ]),
    )
    .join("\n");

  const encabezado = lines([
    "<Encabezado>",
    indent(
      lines([
        el("Version", "1.0"),
        "<IdDoc>", indent(idDoc, 2), "</IdDoc>",
        "<Emisor>", indent(emisor, 2), "</Emisor>",
        comprador ? lines(["<Comprador>", indent(comprador, 2), "</Comprador>"]) : "",
        infoRef ? lines(["<InformacionReferencia>", indent(infoRef, 2), "</InformacionReferencia>"]) : "",
        otraMoneda ? lines(["<OtraMoneda>", indent(otraMoneda, 2), "</OtraMoneda>"]) : "",
        "<Totales>", indent(totales, 2), "</Totales>",
      ]),
      2,
    ),
    "</Encabezado>",
  ]);

  const formaPago = doc.paymentMethod
    ? lines([
        "<FormaDePago>",
        indent(lines([el("FormaPago", doc.paymentMethod), el("MontoPago", amt(t.montoTotal))]), 2),
        "</FormaDePago>",
      ])
    : "";

  return lines([
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    indent(encabezado, 2),
    indent(lines(["<DetallesItems>", indent(items, 2), "</DetallesItems>"]), 2),
    formaPago ? indent(formaPago, 2) : "",
    "</ECF>",
  ]);
}

// ── RFCE: resumen de factura de consumo ──────────────────────────────────────

/**
 * The periodic summary that keeps a high-volume consumo issuer from making one
 * API call per sale. DGII accepts the range and the totals; the individual
 * comprobantes stay with the taxpayer, printed and available on request.
 */
export function buildRfceXml(s: RfceSummary): string {
  const body = lines([
    el("RNCEmisor", s.issuerRnc),
    el("RazonSocialEmisor", s.issuerName),
    el("eNCFDesde", s.encfFrom),
    el("eNCFHasta", s.encfTo),
    el("FechaDesde", dgiiDate(s.periodFrom)),
    el("FechaHasta", dgiiDate(s.periodTo)),
    el("CantidadeCF", s.documentCount),
    el("MontoGravadoTotal", amt(s.totals.gravadoTotal)),
    el("MontoExento", amt(s.totals.exento)),
    el("TotalITBIS", amt(s.totals.totalItbis)),
    el("MontoTotal", amt(s.totals.montoTotal)),
  ]);

  return lines([
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<RFCE xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    indent(lines(["<Encabezado>", indent(body, 2), "</Encabezado>"]), 2),
    "</RFCE>",
  ]);
}

// ── ACECF: aprobación comercial ──────────────────────────────────────────────

/**
 * The buyer's verdict on an e-CF they received. It is not optional: DGII gives
 * the buyer three days, and silence is treated as acceptance — which is exactly
 * why a rejection has to be deliberate and reasoned.
 */
export function buildCommercialApprovalXml(a: CommercialApproval): string {
  const body = lines([
    el("Version", "1.0"),
    el("RNCEmisor", a.issuerRnc),
    el("eNCF", a.encf),
    el("FechaEmision", dgiiDate(a.emittedAt)),
    el("MontoTotal", amt(a.montoTotal)),
    el("RNCComprador", a.buyerRnc),
    el("Estado", a.status),
    a.status === "2" ? el("DetalleMotivoRechazo", a.reason) : "",
    el("FechaHoraAprobacionComercial", dgiiDateTime(a.approvedAt)),
  ]);

  return lines([
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ACECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    indent(lines(["<DetalleAprobacionComercial>", indent(body, 2), "</DetalleAprobacionComercial>"]), 2),
    "</ACECF>",
  ]);
}

// ── ARECF: acuse de recibo ───────────────────────────────────────────────────

/**
 * Confirms the XML arrived and parsed. Distinct from the commercial approval:
 * this says "it reached me and it is well-formed", not "I agree with it". A
 * document can be acknowledged and then commercially rejected.
 */
export function buildAcknowledgementXml(a: Acknowledgement): string {
  const body = lines([
    el("Version", "1.0"),
    el("RNCEmisor", a.issuerRnc),
    el("RNCComprador", a.buyerRnc),
    el("eNCF", a.encf),
    el("Estado", a.status),
    a.status === "1" ? el("CodigoMotivoNoRecibido", a.reasonCode) : "",
    a.status === "1" ? el("DetalleMotivo", a.reason) : "",
    el("FechaHoraAcuseRecibo", dgiiDateTime(a.receivedAt)),
  ]);

  return lines([
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ARECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    indent(lines(["<DetalleAcusedeRecibo>", indent(body, 2), "</DetalleAcusedeRecibo>"]), 2),
    "</ARECF>",
  ]);
}

// ── anulación de rangos ──────────────────────────────────────────────────────

/** Declares eNCF numbers that will never be used, so they cannot resurface. */
export function buildSequenceVoidXml(v: SequenceVoid): string {
  const body = lines([
    el("RNCEmisor", v.issuerRnc),
    el("CantidadeNCFAnulados", v.rangeTo - v.rangeFrom + 1),
    "<Anulacion>",
    indent(
      lines([
        el("NoLinea", 1),
        el("TipoeCF", v.ecfType.replace(/^E/, "")),
        el("TipoAnulacion", "2"),
        el("SecuenciaeNCFDesde", encfOf(v.ecfType, v.rangeFrom)),
        el("SecuenciaeNCFHasta", encfOf(v.ecfType, v.rangeTo)),
      ]),
      2,
    ),
    "</Anulacion>",
  ]);

  return lines([
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ANECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    indent(lines(["<Encabezado>", indent(body, 2), "</Encabezado>"]), 2),
    "</ANECF>",
  ]);
}

/** E31 + 10 digits, zero-padded — the eNCF format DGII fixed in Norma 01-2020. */
export const encfOf = (ecfType: string, n: number): string =>
  `${ecfType.toUpperCase().replace(/^E?/, "E").slice(0, 3)}${String(n).padStart(10, "0")}`;

// ── QR de la representación impresa ──────────────────────────────────────────

/**
 * The DGII "consulta" URL a recipient scans to verify an e-CF against DGII's own
 * records. The buyer RNC is omitted for consumo final — including it for a sale
 * that had no identified buyer makes the lookup fail.
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
    MontoTotal: amt(params.montoTotal) ?? "0.00",
    FechaEmision: dgiiDate(params.fechaEmision) ?? "",
    CodigoSeguridad: params.securityCode,
  });
  if (params.buyerRnc) q.set("RncComprador", params.buyerRnc);
  return `${params.baseUrl}?${q.toString()}`;
}
