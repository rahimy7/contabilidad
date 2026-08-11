import { createHash, X509Certificate } from "node:crypto";
import { SqlClient } from "../../accounting/types";
import { DgiiEcfGateway, EcfSigner, SigningIdentity } from "./types";
import { DevEcfSigner } from "./dev-signer";
import { ProductionEcfSigner } from "./production-signer";
import { DgiiSimulatorGateway } from "./simulator-gateway";
import { DgiiHttpGateway } from "./http-gateway";

/**
 * Per-company e-CF configuration, and the wiring it selects.
 *
 * The environment is a property of the *company*, not of the deployment: one
 * instance serves a taxpayer already in producción alongside one still
 * certifying, and a global env var cannot express that. Choosing the gateway
 * here — rather than at module load — is what makes that possible.
 */

export interface EcfSettings {
  companyId: number;
  environment: "simulated" | "test" | "cert" | "prod";
  isEnabled: boolean;
  issuerRnc: string;
  issuerName: string;
  tradeName?: string;
  address?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
  rfceThreshold: string;
  maxTransmitAttempts: number;
  certificateFingerprint?: string;
  certificateSubject?: string;
  certificateExpiresAt?: string;
  hasCertificate: boolean;
}

/** DGII's own hosts, per environment. The simulator has none — it is local. */
const DGII_HOSTS: Record<string, { api: string; qr: string }> = {
  test: {
    api: "https://ecf.dgii.gov.do/testecf/emisorreceptor",
    qr: "https://ecf.dgii.gov.do/testecf/consultatimbre",
  },
  cert: {
    api: "https://ecf.dgii.gov.do/certecf/emisorreceptor",
    qr: "https://ecf.dgii.gov.do/certecf/consultatimbre",
  },
  prod: {
    api: "https://ecf.dgii.gov.do/ecf/emisorreceptor",
    qr: "https://ecf.dgii.gov.do/ecf/consultatimbre",
  },
  simulated: {
    api: "simulated://dgii",
    // The QR of a simulated document points at the real consulta URL anyway: the
    // printed representation should look exactly like the one that will be
    // printed in producción, or the transition changes the artifact.
    qr: "https://ecf.dgii.gov.do/ecf/consultatimbrefc",
  },
};

/**
 * Reads a company's settings, creating the row on first access.
 *
 * A company with no row is not misconfigured — it simply has not been set up for
 * e-CF yet, and the honest default is the simulator with the feature off. The
 * issuer identity falls back to the company record so a fresh tenant is coherent
 * before anyone opens the settings screen.
 */
export async function loadEcfSettings(client: SqlClient, companyId: number): Promise<EcfSettings> {
  await client.query(
    `INSERT INTO ecf_config (company_id) VALUES ($1) ON CONFLICT (company_id) DO NOTHING`,
    [companyId],
  );
  const { rows } = await client.query(
    `SELECT c.environment, c.is_enabled, c.rfce_threshold::text, c.max_transmit_attempts,
            coalesce(c.issuer_rnc, co.rnc)              AS issuer_rnc,
            coalesce(c.issuer_name, co.legal_name)      AS issuer_name,
            coalesce(c.trade_name, co.trade_name)       AS trade_name,
            c.address, c.phone, c.email, c.logo_url,
            c.certificate_fingerprint, c.certificate_subject, c.certificate_expires_at,
            (c.certificate_pem IS NOT NULL)             AS has_certificate
       FROM ecf_config c
       JOIN companies co ON co.id = c.company_id
      WHERE c.company_id=$1`,
    [companyId],
  );
  const r = rows[0];
  return {
    companyId,
    environment: r.environment,
    isEnabled: r.is_enabled === true,
    issuerRnc: r.issuer_rnc ?? "",
    issuerName: r.issuer_name ?? "",
    tradeName: r.trade_name ?? undefined,
    address: r.address ?? undefined,
    phone: r.phone ?? undefined,
    email: r.email ?? undefined,
    logoUrl: r.logo_url ?? undefined,
    rfceThreshold: r.rfce_threshold,
    maxTransmitAttempts: r.max_transmit_attempts,
    certificateFingerprint: r.certificate_fingerprint ?? undefined,
    certificateSubject: r.certificate_subject ?? undefined,
    certificateExpiresAt: r.certificate_expires_at
      ? new Date(r.certificate_expires_at).toISOString()
      : undefined,
    hasCertificate: r.has_certificate === true,
  };
}

export async function saveEcfSettings(
  client: SqlClient,
  companyId: number,
  patch: Partial<{
    environment: string;
    isEnabled: boolean;
    issuerRnc: string;
    issuerName: string;
    tradeName: string;
    address: string;
    phone: string;
    email: string;
    logoUrl: string;
    rfceThreshold: string;
    maxTransmitAttempts: number;
  }>,
): Promise<EcfSettings> {
  await client.query(
    `INSERT INTO ecf_config (company_id) VALUES ($1) ON CONFLICT (company_id) DO NOTHING`,
    [companyId],
  );
  await client.query(
    `UPDATE ecf_config SET
       environment  = coalesce($2::ecf_environment, environment),
       is_enabled   = coalesce($3, is_enabled),
       issuer_rnc   = coalesce($4, issuer_rnc),
       issuer_name  = coalesce($5, issuer_name),
       trade_name   = coalesce($6, trade_name),
       address      = coalesce($7, address),
       phone        = coalesce($8, phone),
       email        = coalesce($9, email),
       logo_url     = coalesce($10, logo_url),
       rfce_threshold = coalesce($11::numeric, rfce_threshold),
       max_transmit_attempts = coalesce($12, max_transmit_attempts),
       updated_at = now()
     WHERE company_id=$1`,
    [
      companyId, patch.environment ?? null, patch.isEnabled ?? null, patch.issuerRnc ?? null,
      patch.issuerName ?? null, patch.tradeName ?? null, patch.address ?? null, patch.phone ?? null,
      patch.email ?? null, patch.logoUrl ?? null, patch.rfceThreshold ?? null,
      patch.maxTransmitAttempts ?? null,
    ],
  );
  return loadEcfSettings(client, companyId);
}

/**
 * Stores the signing certificate.
 *
 * The private key goes in and never comes back out through any read path — the
 * column is revoked from the request role, and the signer reaches it through a
 * SECURITY DEFINER function. What an operator sees afterwards is the
 * fingerprint, the subject and the expiry, which is everything needed to answer
 * "is the right certificate loaded and when does it die".
 */
export async function storeCertificate(
  client: SqlClient,
  companyId: number,
  input: { privateKeyPem: string; certificatePem: string },
): Promise<EcfSettings> {
  let subject: string | undefined;
  let expiresAt: Date | undefined;
  let fingerprint: string;

  try {
    const x509 = new X509Certificate(input.certificatePem);
    subject = x509.subject?.replace(/\n/g, ", ");
    expiresAt = new Date(x509.validTo);
    fingerprint = x509.fingerprint256;
  } catch {
    // A PEM that is not an X.509 certificate — a bare public key, as the dev
    // path produces — still gets a fingerprint so the UI can show *something*
    // identifying, but no subject and no expiry, because it genuinely has none.
    fingerprint = createHash("sha256").update(input.certificatePem).digest("hex");
  }

  await client.query(
    `INSERT INTO ecf_config (company_id) VALUES ($1) ON CONFLICT (company_id) DO NOTHING`,
    [companyId],
  );
  await client.query(
    `UPDATE ecf_config
        SET certificate_private_key=$2, certificate_pem=$3, certificate_fingerprint=$4,
            certificate_subject=$5, certificate_expires_at=$6, updated_at=now()
      WHERE company_id=$1`,
    [companyId, input.privateKeyPem, input.certificatePem, fingerprint, subject ?? null, expiresAt ?? null],
  );
  return loadEcfSettings(client, companyId);
}

/**
 * The signing identity, read through the SECURITY DEFINER function so the
 * private key never travels through an ordinary SELECT.
 *
 * With no certificate loaded the dev signer generates an ephemeral key: the
 * pipeline runs, the signature verifies against itself, and only the trust chain
 * is absent. That is the honest state of an uncertified taxpayer, and it is
 * exactly what the simulated environment is for.
 */
export async function signingIdentity(
  client: SqlClient,
  companyId: number,
  settings: EcfSettings,
): Promise<SigningIdentity> {
  const { rows } = await client.query(`SELECT * FROM ecf_signing_key($1)`, [companyId]);
  return {
    privateKeyPem: rows[0]?.private_key ?? undefined,
    certificatePem: rows[0]?.certificate ?? undefined,
    rnc: settings.issuerRnc,
  };
}

/** The consulta URL the QR points at, for this company's environment. */
export const qrBaseUrl = (settings: EcfSettings): string =>
  process.env.DGII_ECF_QR_URL || DGII_HOSTS[settings.environment].qr;

export const apiBaseUrl = (settings: EcfSettings): string =>
  process.env.DGII_ECF_API_URL || DGII_HOSTS[settings.environment].api;

/**
 * Picks the gateway for a company's environment.
 *
 * `simulated` gets the local DGII; the other three get the HTTP one pointed at
 * the matching host. The application above this call cannot tell the difference,
 * which is the whole point — moving a taxpayer to producción is a settings
 * change, not a code change.
 */
export function gatewayFor(client: SqlClient, settings: EcfSettings): DgiiEcfGateway {
  if (settings.environment === "simulated") {
    return new DgiiSimulatorGateway(client, {
      // A submission that resolves instantly never exercises polling. Two
      // seconds is short enough not to slow anyone down and long enough that the
      // "en proceso" state is real.
      resolveAfterMs: Number(process.env.DGII_SIM_RESOLVE_MS ?? 2000),
    });
  }
  return new DgiiHttpGateway(apiBaseUrl(settings));
}

/** The signer. Production XAdES-BES when env != simulated, dev otherwise. */
export function signerFor(settings: EcfSettings): EcfSigner {
  if (settings.environment === "simulated" || process.env.ECF_SIGNER === "dev") {
    return new DevEcfSigner();
  }
  return new ProductionEcfSigner();
}
