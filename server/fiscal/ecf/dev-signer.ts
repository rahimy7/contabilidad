import { createSign, createHash, generateKeyPairSync, createVerify } from "node:crypto";
import { EcfSigner, SignedEcf, SigningIdentity } from "./types";

/**
 * A development e-CF signer.
 *
 * It produces a real RSA-SHA256 enveloped signature over the document, so the
 * whole pipeline — sign, derive the security code, transmit, verify — runs and
 * is testable end to end. What it is NOT is a XAdES-BES signature made with a
 * certificate the DGII trusts: that needs the certificate from an authorized CA
 * (Avansi, Cámara TC…), and only the trust chain is missing, not the mechanism.
 *
 * The production signer implements the same `EcfSigner` interface with the CA
 * certificate and the XAdES structure, and drops in without touching any caller.
 *
 * No native dependency: Node's built-in crypto, not node-forge or xadesjs.
 */
export class DevEcfSigner implements EcfSigner {
  /** Cached ephemeral keypair so repeated signings in one process are stable. */
  private cached?: { privateKeyPem: string; certificatePem: string };

  async sign(xml: string, identity: SigningIdentity): Promise<SignedEcf> {
    const key = identity.privateKeyPem ?? this.ephemeral().privateKeyPem;

    const signer = createSign("RSA-SHA256");
    signer.update(xml, "utf8");
    signer.end();
    const signatureB64 = signer.sign(key, "base64");

    // DGII's códigoSeguridad is a short digest printed on the document and
    // embedded in the QR. Six chars of a hash of the signature is a faithful
    // stand-in for the derivation.
    const securityCode = createHash("sha256")
      .update(signatureB64)
      .digest("base64")
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 6);

    const signedAt = new Date().toISOString();
    const signedXml = this.envelope(xml, signatureB64, signedAt, securityCode);

    return { xml: signedXml, securityCode, signedAt };
  }

  /** Lets a test confirm the signature actually verifies against the key. */
  verify(signedXml: string, certificatePem?: string): boolean {
    const sigMatch = signedXml.match(/<SignatureValue>([^<]+)<\/SignatureValue>/);
    if (!sigMatch) return false;
    const original = signedXml.replace(/\n?\s*<Signature>[\s\S]*<\/Signature>/, "");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(original, "utf8");
    verifier.end();
    const pem = certificatePem ?? this.ephemeral().certificatePem;
    try {
      return verifier.verify(pem, sigMatch[1], "base64");
    } catch {
      return false;
    }
  }

  private envelope(xml: string, signatureB64: string, signedAt: string, code: string): string {
    // Enveloped: the signature is appended as the last child of the document.
    const block = [
      "  <Signature>",
      `    <SignatureValue>${signatureB64}</SignatureValue>`,
      `    <FechaHoraFirma>${signedAt}</FechaHoraFirma>`,
      `    <CodigoSeguridad>${code}</CodigoSeguridad>`,
      "  </Signature>",
    ].join("\n");

    // El elemento raíz se descubre, no se asume. Esta clase firma cinco
    // documentos distintos —ECF, ACECF, ARECF, RFCE, ANECF— y buscar `</ECF>`
    // a ciegas hacía que los otros cuatro salieran sin firma y sin error: el
    // replace no encontraba nada y devolvía el XML intacto. Un documento que se
    // cree firmado y no lo está es peor que uno que falla al firmarse.
    const root = xml.match(/<([A-Za-z][\w.-]*)[\s>]/g)?.find((t) => !t.startsWith("<?"));
    const name = root?.replace(/^<|[\s>]$/g, "");
    if (!name) throw new Error("no se pudo determinar el elemento raíz del XML a firmar");

    const closing = new RegExp(`</${name}>\\s*$`);
    if (!closing.test(xml)) {
      throw new Error(`el XML no cierra con </${name}>: no se puede insertar la firma`);
    }
    return xml.replace(closing, `${block}\n</${name}>`);
  }

  private ephemeral() {
    if (this.cached) return this.cached;
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    // The "certificate" here is just the public key; the dev path verifies
    // against it. Production supplies a real X.509 chain.
    this.cached = { privateKeyPem: privateKey, certificatePem: publicKey };
    return this.cached;
  }
}
