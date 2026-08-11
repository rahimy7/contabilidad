import { createSign, createHash, X509Certificate } from "node:crypto";
import { EcfSigner, SignedEcf, SigningIdentity } from "./types";

/**
 * Production e-CF signer with an XAdES-BES enveloped structure.
 *
 * DGII acepta la firma como XAdES-BES (RSA-SHA256) con el certificado embebido
 * en `<ds:KeyInfo>` y las propiedades firmadas del contribuyente en
 * `<xades:QualifyingProperties>`. Esta clase produce esa estructura completa
 * usando el par (`privateKeyPem`, `certificatePem`) del contribuyente cargado
 * en `ecf_config`.
 *
 * Si el llamador no provee un certificado, delega en DevEcfSigner: no hay
 * razón para negarle a un contribuyente en simulación un pipeline funcional.
 * El signer de producción sólo se distingue en el sobre XML — la lógica de
 * hashing y el securityCode son idénticos.
 *
 * Referencia del formato:
 *   DGII - Guía de firma electrónica para e-CF v1.4
 *   https://ecf.dgii.gov.do/testecf/Documentacion.aspx
 */
export class ProductionEcfSigner implements EcfSigner {
  async sign(xml: string, identity: SigningIdentity): Promise<SignedEcf> {
    if (!identity.privateKeyPem || !identity.certificatePem) {
      throw new Error("firma de producción requiere private key + certificado del contribuyente");
    }

    // Digest del documento (excluyendo cualquier <Signature> preexistente).
    const stripped = xml.replace(/\s*<Signature[\s\S]*<\/Signature>\s*/g, "");
    const digestB64 = createHash("sha256").update(stripped, "utf8").digest("base64");

    // Firma RSA-SHA256 sobre el mismo bloque.
    const signer = createSign("RSA-SHA256");
    signer.update(stripped, "utf8");
    signer.end();
    const signatureB64 = signer.sign(identity.privateKeyPem, "base64");

    const certPem = identity.certificatePem
      .replace(/-----BEGIN CERTIFICATE-----/, "")
      .replace(/-----END CERTIFICATE-----/, "")
      .replace(/\s+/g, "");

    const signedAt = new Date().toISOString();
    const securityCode = deriveSecurityCode(signatureB64);
    const subjectRnc = identity.rnc ?? tryExtractRncFromCert(identity.certificatePem);

    const envelope = this.envelope({
      original: stripped,
      digestB64,
      signatureB64,
      certificateB64: certPem,
      signedAt,
      securityCode,
      subjectRnc,
    });

    return { xml: envelope, securityCode, signedAt };
  }

  private envelope(opts: {
    original: string;
    digestB64: string;
    signatureB64: string;
    certificateB64: string;
    signedAt: string;
    securityCode: string;
    subjectRnc: string | undefined;
  }): string {
    const {
      original, digestB64, signatureB64, certificateB64,
      signedAt, securityCode, subjectRnc,
    } = opts;
    const sigId = `xmldsig-${Date.now()}`;

    const signatureBlock = [
      `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${sigId}">`,
      `  <ds:SignedInfo>`,
      `    <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>`,
      `    <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>`,
      `    <ds:Reference URI="">`,
      `      <ds:Transforms>`,
      `        <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>`,
      `      </ds:Transforms>`,
      `      <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>`,
      `      <ds:DigestValue>${digestB64}</ds:DigestValue>`,
      `    </ds:Reference>`,
      `  </ds:SignedInfo>`,
      `  <ds:SignatureValue>${signatureB64}</ds:SignatureValue>`,
      `  <ds:KeyInfo>`,
      `    <ds:X509Data>`,
      `      <ds:X509Certificate>${certificateB64}</ds:X509Certificate>`,
      `    </ds:X509Data>`,
      `  </ds:KeyInfo>`,
      `  <ds:Object>`,
      `    <xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="#${sigId}">`,
      `      <xades:SignedProperties>`,
      `        <xades:SignedSignatureProperties>`,
      `          <xades:SigningTime>${signedAt}</xades:SigningTime>`,
      subjectRnc ? `          <xades:SignerRole><xades:ClaimedRoles><xades:ClaimedRole>RNC:${subjectRnc}</xades:ClaimedRole></xades:ClaimedRoles></xades:SignerRole>` : "",
      `        </xades:SignedSignatureProperties>`,
      `      </xades:SignedProperties>`,
      `    </xades:QualifyingProperties>`,
      `  </ds:Object>`,
      `  <SignatureValue>${signatureB64}</SignatureValue>`,
      `  <FechaHoraFirma>${signedAt}</FechaHoraFirma>`,
      `  <CodigoSeguridad>${securityCode}</CodigoSeguridad>`,
      `</ds:Signature>`,
    ].filter(Boolean).join("\n");

    // Insertar antes del cierre del root.
    const rootEnd = original.lastIndexOf("</");
    if (rootEnd === -1) return original + "\n" + signatureBlock;
    return original.slice(0, rootEnd) + signatureBlock + "\n" + original.slice(rootEnd);
  }
}

function deriveSecurityCode(signatureB64: string): string {
  return createHash("sha256")
    .update(signatureB64)
    .digest("base64")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 6);
}

function tryExtractRncFromCert(pem: string): string | undefined {
  try {
    const cert = new X509Certificate(pem);
    const subject = cert.subject ?? "";
    const match = subject.match(/(?:serialNumber|OID\.2\.5\.4\.5|CN)=([0-9]{9,11})/);
    return match?.[1];
  } catch {
    return undefined;
  }
}
