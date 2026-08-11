/**
 * e-CF (facturación electrónica) contracts.
 *
 * The two hard dependencies of e-CF — a XAdES signature made with a certificate
 * from a DGII-authorized CA, and the DGII webservices themselves — sit behind
 * these interfaces. Everything else (building the XML, the state machine,
 * contingency, the representación impresa) is written against the interfaces and
 * develops and tests against in-memory implementations, so the external
 * onboarding never blocks internal progress.
 *
 * What is genuinely blocked until the certificate and DGII credentials exist:
 *   - a signature the DGII will accept (the dev signer proves the shape, not the
 *     trust chain);
 *   - the live endpoints and their auth handshake.
 */

/** Where a document sits in the DGII round trip. Mirrors the ecf_status enum. */
export type EcfStatus =
  | "pendiente"
  | "firmado"
  | "enviado"
  | "aceptado"
  | "aceptado_condicional"
  | "rechazado"
  | "en_contingencia"
  | "anulado";

/** The data an e-CF XML is built from. Amounts are decimal strings. */
export interface EcfDocument {
  tipoECF: string; // '31', '32', ...
  eNCF: string; // 'E310000000001'
  issuerRnc: string;
  issuerName: string;
  buyerRnc?: string;
  buyerName?: string;
  emittedAt: string; // ISO date
  currency: string;
  sequenceExpiry?: string; // fecha de vencimiento de la secuencia

  /** Comercial name, address and contact — printed, and required by some types. */
  issuerTradeName?: string;
  issuerAddress?: string;
  issuerPhone?: string;
  issuerEmail?: string;

  /** DGII TipoIngresos (01–06) and TipoPago (1 contado, 2 crédito, 3 gratuito). */
  incomeType?: string;
  paymentType?: string;
  /** FormaPago table code: 01 efectivo, 03 tarjeta, 04 crédito… */
  paymentMethod?: string;
  /** Credit terms, when TipoPago is 2. */
  dueDate?: string;

  /** Notes (E33/E34) point at the comprobante they modify. */
  modifiesNcf?: string;
  modifiesDate?: string;
  /** 1 = anula el anterior, 2 = lo modifica parcialmente. */
  modificationCode?: string;

  /** Exports (E46) identify the buyer by country instead of RNC. */
  buyerCountry?: string;
  /** Non-DOP documents carry the rate the totals convert at. */
  fxRate?: string;

  totals: {
    gravadoTotal: string;
    gravado18: string;
    gravado16: string;
    /** ITBIS 0% — taxed at zero, which is not the same as exempt. */
    gravado0?: string;
    exento: string;
    itbis18: string;
    itbis16: string;
    itbis0?: string;
    totalItbis: string;
    /** Impuesto selectivo al consumo and propina legal, when present. */
    isc?: string;
    tipLegal?: string;
    /** Retentions the buyer withholds from us. */
    retentionItbis?: string;
    retentionIsr?: string;
    montoTotal: string;
  };

  lines: Array<{
    lineNo: number;
    name: string;
    /** 1 = gravado 18%, 2 = exento, 3 = gravado 16%, 4 = gravado 0%. */
    indicadorFacturacion: 1 | 2 | 3 | 4;
    quantity: string;
    unitPrice: string;
    amount: string;
    /** Unidad de medida per DGII's table; free text is not accepted. */
    unitOfMeasure?: string;
    discount?: string;
    itbisRate?: string;
    itbisAmount?: string;
    /** Supplier/product code, when the buyer needs it for their own records. */
    productCode?: string;
  }>;
}

/** A periodic summary of consumo e-CF below the RFCE threshold. */
export interface RfceSummary {
  issuerRnc: string;
  issuerName: string;
  /** The eNCF range this summary covers. */
  encfFrom: string;
  encfTo: string;
  periodFrom: string;
  periodTo: string;
  documentCount: number;
  totals: {
    gravadoTotal: string;
    exento: string;
    totalItbis: string;
    montoTotal: string;
  };
}

/** Aprobación comercial (ACECF): the buyer's verdict on a received e-CF. */
export interface CommercialApproval {
  issuerRnc: string;
  issuerName?: string;
  buyerRnc: string;
  buyerName?: string;
  encf: string;
  emittedAt: string;
  montoTotal: string;
  /** 1 = aceptado, 2 = rechazado. */
  status: "1" | "2";
  reason?: string;
  approvedAt: string;
}

/** Acuse de recibo (ARECF): confirms the XML arrived and parsed. */
export interface Acknowledgement {
  issuerRnc: string;
  buyerRnc: string;
  encf: string;
  /** 0 = recibido conforme, 1 = rechazado por error de estructura/firma. */
  status: "0" | "1";
  /** DGII coded reason when status is 1. */
  reasonCode?: string;
  reason?: string;
  receivedAt: string;
}

/** Anulación de rangos: eNCF numbers declared as never to be used. */
export interface SequenceVoid {
  issuerRnc: string;
  ecfType: string;
  rangeFrom: number;
  rangeTo: number;
  voidedAt: string;
}

/** A signing identity: the PKCS#12 material, in production; nothing, in the dev path. */
export interface SigningIdentity {
  /** PEM private key, or generated ephemerally by the dev signer. */
  privateKeyPem?: string;
  /** PEM certificate, for the KeyInfo block. */
  certificatePem?: string;
  /**
   * The RNC this identity acts as. DGII binds the token to it, so a taxpayer
   * cannot submit another's comprobantes with their own certificate — the check
   * the simulator reproduces.
   */
  rnc?: string;
}

export interface SignedEcf {
  /** The enveloped, signed XML. */
  xml: string;
  /** códigoSeguridad — first six chars of the signature digest, printed and in the QR. */
  securityCode: string;
  signedAt: string;
}

export interface EcfSigner {
  /**
   * Signs the e-CF XML with an enveloped signature and returns the security
   * code DGII derives from it. The dev signer produces a structurally valid
   * RSA-SHA256 signature; a production XAdES-BES signer with the CA certificate
   * drops in behind the same method.
   */
  sign(xml: string, identity: SigningIdentity): Promise<SignedEcf>;
}

export interface DgiiToken {
  token: string;
  expiresAt: string;
}

export interface SubmitResult {
  trackId: string;
  status: EcfStatus;
  message?: string;
}

/**
 * The DGII e-CF webservices. Two implementations: an in-memory one for
 * development and tests, and a live one that talks to the real endpoints once
 * credentials exist.
 */
export interface DgiiEcfGateway {
  authenticate(identity: SigningIdentity): Promise<DgiiToken>;
  submit(signedXml: string, token: DgiiToken): Promise<SubmitResult>;
  queryStatus(trackId: string, token: DgiiToken): Promise<SubmitResult>;
}

/** Raised when the gateway is unreachable, so callers can fall to contingency. */
export class DgiiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DgiiUnavailableError";
  }
}
