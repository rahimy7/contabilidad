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
  totals: {
    gravadoTotal: string;
    gravado18: string;
    gravado16: string;
    exento: string;
    itbis18: string;
    itbis16: string;
    totalItbis: string;
    montoTotal: string;
  };
  lines: Array<{
    lineNo: number;
    name: string;
    /** 1 = gravado, 2 = exento (DGII indicadorFacturacion). */
    indicadorFacturacion: 1 | 2;
    quantity: string;
    unitPrice: string;
    amount: string;
  }>;
}

/** A signing identity: the PKCS#12 material, in production; nothing, in the dev path. */
export interface SigningIdentity {
  /** PEM private key, or generated ephemerally by the dev signer. */
  privateKeyPem?: string;
  /** PEM certificate, for the KeyInfo block. */
  certificatePem?: string;
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
