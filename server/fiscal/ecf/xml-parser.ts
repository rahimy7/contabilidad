import { EcfDocument, CommercialApproval, Acknowledgement } from "./types";

/**
 * Reads an e-CF XML back into the shape the validator understands.
 *
 * The receiver needs this — the simulator, and the inbox that takes a supplier's
 * e-CF — because what arrives is a document, not an object. Written against the
 * same grammar `xml-builder` writes, without a DOM library, for the same reason:
 * nothing here needs a tree, and the XSD-validating candidate wants native
 * compilation.
 *
 * The deliberate limitation: this extracts elements by name, so it would not
 * notice a correct element in the wrong position. That is fine for what it is
 * for — the *validator* checks meaning, and the XSD is what checks order, and
 * neither job belongs to a parser. When the official .xsd files arrive, order
 * checking arrives with them.
 */

/** First occurrence of `<tag>…</tag>`, unescaped. Null when absent. */
function pick(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? unescapeXml(m[1].trim()) : undefined;
}

/** Every occurrence of a block, for repeating elements like <Item>. */
function pickAll(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

/** Narrows the search to one block, so <RNCEmisor> inside <Emisor> is unambiguous. */
function section(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : "";
}

const unescapeXml = (v: string): string =>
  v
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Ampersand last: doing it first would re-expand the others' escapes.
    .replace(/&amp;/g, "&");

/** dd-MM-yyyy back to ISO, which is what everything downstream expects. */
export const isoFromDgii = (v?: string): string | undefined => {
  if (!v) return undefined;
  const m = v.match(/^(\d{2})-(\d{2})-(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
};

export function parseEcfXml(xml: string): EcfDocument | null {
  if (!xml || !/<ECF[\s>]/.test(xml)) return null;

  const enc = section(xml, "Encabezado");
  const idDoc = section(enc, "IdDoc");
  const emisor = section(enc, "Emisor");
  const comprador = section(enc, "Comprador");
  const totales = section(enc, "Totales");
  const ref = section(enc, "InformacionReferencia");
  const moneda = section(enc, "OtraMoneda");
  const detalles = section(xml, "DetallesItems");

  const tipoECF = pick(idDoc, "TipoeCF");
  const eNCF = pick(idDoc, "eNCF");
  if (!tipoECF || !eNCF) return null;

  const lines = pickAll(detalles, "Item").map((item, i) => ({
    lineNo: Number(pick(item, "NumeroLinea") ?? i + 1),
    name: pick(item, "NombreItem") ?? "",
    indicadorFacturacion: (Number(pick(item, "IndicadorFacturacion") ?? 1) || 1) as 1 | 2 | 3 | 4,
    quantity: pick(item, "CantidadItem") ?? "0",
    unitPrice: pick(item, "PrecioUnitarioItem") ?? "0",
    amount: pick(item, "MontoItem") ?? "0",
    unitOfMeasure: pick(item, "UnidadMedida"),
    discount: pick(item, "DescuentoMonto"),
    productCode: pick(item, "CodigoItem"),
  }));

  return {
    tipoECF,
    eNCF,
    issuerRnc: pick(emisor, "RNCEmisor") ?? "",
    issuerName: pick(emisor, "RazonSocialEmisor") ?? "",
    issuerTradeName: pick(emisor, "NombreComercial"),
    issuerAddress: pick(emisor, "DireccionEmisor"),
    issuerPhone: pick(emisor, "TelefonoEmisor"),
    issuerEmail: pick(emisor, "CorreoEmisor"),
    emittedAt: isoFromDgii(pick(emisor, "FechaEmision")) ?? "",
    buyerRnc: comprador ? pick(comprador, "RNCComprador") : undefined,
    buyerName: comprador ? pick(comprador, "RazonSocialComprador") : undefined,
    buyerCountry: comprador ? pick(comprador, "PaisComprador") : undefined,
    currency: pick(moneda, "TipoMoneda") ?? "DOP",
    fxRate: pick(moneda, "TipoCambio"),
    sequenceExpiry: isoFromDgii(pick(idDoc, "FechaVencimientoSecuencia")),
    incomeType: pick(idDoc, "TipoIngresos"),
    paymentType: pick(idDoc, "TipoPago"),
    dueDate: isoFromDgii(pick(idDoc, "FechaLimitePago")),
    paymentMethod: pick(section(xml, "FormaDePago"), "FormaPago"),
    modifiesNcf: ref ? pick(ref, "NCFModificado") : undefined,
    modifiesDate: ref ? isoFromDgii(pick(ref, "FechaNCFModificado")) : undefined,
    modificationCode: ref ? pick(ref, "CodigoModificacion") : undefined,
    totals: {
      gravadoTotal: pick(totales, "MontoGravadoTotal") ?? "0",
      gravado18: pick(totales, "MontoGravadoI1") ?? "0",
      gravado16: pick(totales, "MontoGravadoI2") ?? "0",
      gravado0: pick(totales, "MontoGravadoI3") ?? "0",
      exento: pick(totales, "MontoExento") ?? "0",
      itbis18: pick(totales, "TotalITBIS1") ?? "0",
      itbis16: pick(totales, "TotalITBIS2") ?? "0",
      itbis0: pick(totales, "TotalITBIS3") ?? "0",
      totalItbis: pick(totales, "TotalITBIS") ?? "0",
      isc: pick(totales, "MontoImpuestoSelectivoConsumo"),
      tipLegal: pick(totales, "MontoPropinaLegal"),
      retentionItbis: pick(totales, "TotalITBISRetenido"),
      retentionIsr: pick(totales, "TotalISRRetencion"),
      montoTotal: pick(totales, "MontoTotal") ?? "0",
    },
    lines,
  };
}

/** The security code the issuer stamped into the signature block. */
export const securityCodeOf = (xml: string): string | undefined =>
  pick(xml, "CodigoSeguridad");

export const signatureValueOf = (xml: string): string | undefined =>
  pick(xml, "SignatureValue");

export function parseCommercialApprovalXml(xml: string): CommercialApproval | null {
  if (!/<ACECF[\s>]/.test(xml)) return null;
  const d = section(xml, "DetalleAprobacionComercial");
  const encf = pick(d, "eNCF");
  if (!encf) return null;
  return {
    issuerRnc: pick(d, "RNCEmisor") ?? "",
    buyerRnc: pick(d, "RNCComprador") ?? "",
    encf,
    emittedAt: isoFromDgii(pick(d, "FechaEmision")) ?? "",
    montoTotal: pick(d, "MontoTotal") ?? "0",
    status: (pick(d, "Estado") === "2" ? "2" : "1") as "1" | "2",
    reason: pick(d, "DetalleMotivoRechazo"),
    approvedAt: isoFromDgii(pick(d, "FechaHoraAprobacionComercial")) ?? "",
  };
}

export function parseAcknowledgementXml(xml: string): Acknowledgement | null {
  if (!/<ARECF[\s>]/.test(xml)) return null;
  const d = section(xml, "DetalleAcusedeRecibo");
  const encf = pick(d, "eNCF");
  if (!encf) return null;
  return {
    issuerRnc: pick(d, "RNCEmisor") ?? "",
    buyerRnc: pick(d, "RNCComprador") ?? "",
    encf,
    status: (pick(d, "Estado") === "1" ? "1" : "0") as "0" | "1",
    reasonCode: pick(d, "CodigoMotivoNoRecibido"),
    reason: pick(d, "DetalleMotivo"),
    receivedAt: isoFromDgii(pick(d, "FechaHoraAcuseRecibo")) ?? "",
  };
}
