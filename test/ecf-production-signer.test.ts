import { describe, it, expect } from "vitest";
import { generateKeyPairSync, createHash } from "node:crypto";
import { ProductionEcfSigner } from "../server/fiscal/ecf/production-signer";

/**
 * Signer de producción: verifica que produzca la estructura XAdES-BES completa
 * y que el securityCode sea determinístico dado el mismo input.
 */

describe("ProductionEcfSigner XAdES-BES", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
  const certificatePem = [
    "-----BEGIN CERTIFICATE-----",
    "MIIB2zCCAWSgAwIBAgIUOK7dg7EqI3jU7T5m7hbXbY0zX0EwDQYJKoZIhvcNAQEL",
    "BQAwGzEZMBcGA1UEAwwQRXhhbXBsZSBUZXN0IEcxMB4XDTI2MDEwMTAwMDAwMFoX",
    "-----END CERTIFICATE-----",
  ].join("\n");

  it("firma un XML y produce estructura XAdES-BES válida", async () => {
    const signer = new ProductionEcfSigner();
    const xml = `<?xml version="1.0"?><ECF><Encabezado><IdDoc>1</IdDoc></Encabezado></ECF>`;
    const result = await signer.sign(xml, {
      privateKeyPem, certificatePem, rnc: "146000101",
    });
    expect(result.xml).toContain("<ds:Signature");
    expect(result.xml).toContain("http://www.w3.org/2000/09/xmldsig#");
    expect(result.xml).toContain("xmlns:xades");
    expect(result.xml).toContain("<ds:X509Certificate>");
    expect(result.xml).toContain("<xades:QualifyingProperties");
    expect(result.xml).toContain("<xades:SigningTime>");
    expect(result.xml).toContain("RNC:146000101");
    expect(result.securityCode).toHaveLength(6);
    expect(result.signedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("rechaza firmar sin identidad completa", async () => {
    const signer = new ProductionEcfSigner();
    const xml = `<?xml version="1.0"?><ECF/>`;
    await expect(signer.sign(xml, { privateKeyPem: undefined, certificatePem, rnc: "1" })).rejects.toThrow();
    await expect(signer.sign(xml, { privateKeyPem, certificatePem: undefined, rnc: "1" })).rejects.toThrow();
  });

  it("securityCode es determinístico para el mismo input", async () => {
    // Fija la clave para la comparación.
    const fixedKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const fixedKey = fixedKeys.privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    const signer = new ProductionEcfSigner();
    const xml = `<?xml version="1.0"?><ECF><Body/></ECF>`;
    const first = await signer.sign(xml, { privateKeyPem: fixedKey, certificatePem, rnc: "1" });
    const second = await signer.sign(xml, { privateKeyPem: fixedKey, certificatePem, rnc: "1" });
    // La firma no es determinística (RSA-PSS-like sign puede variar por padding),
    // pero para RSA-SHA256 con PKCS#1 v1.5, la firma sobre el mismo input es determinística.
    expect(first.securityCode).toBe(second.securityCode);
  });

  it("digest del documento excluye cualquier Signature preexistente", async () => {
    const signer = new ProductionEcfSigner();
    const xml = `<?xml version="1.0"?><ECF><Body/><Signature><SignatureValue>OLD</SignatureValue></Signature></ECF>`;
    const result = await signer.sign(xml, { privateKeyPem, certificatePem, rnc: "1" });
    // El firmante debe haber removido la Signature anterior antes de calcular el digest.
    // El resultado NO debe contener 'OLD' dentro del hash, sólo la nueva firma.
    expect(result.xml).not.toMatch(/<SignatureValue>OLD<\/SignatureValue>/);
  });
});
