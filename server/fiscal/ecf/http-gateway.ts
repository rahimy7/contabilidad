import { createSign } from "node:crypto";
import {
  DgiiEcfGateway, DgiiToken, SubmitResult, SigningIdentity, DgiiUnavailableError, EcfStatus,
} from "./types";

/**
 * The real DGII webservices.
 *
 * Written now, unreachable until a certificate exists — which is deliberate. The
 * endpoints, the handshake and the response mapping are the part that can be
 * built from the published norm; only the trust chain has to wait. Leaving this
 * as a `throw new Error("not implemented")` would mean discovering the shape of
 * the integration on the day the certificate arrives, under pressure.
 *
 * The handshake, per Norma 01-2020:
 *
 *   GET  /autenticacion/api/autenticacion/semilla    → an XML seed
 *   POST /autenticacion/api/autenticacion/validacioncertificado (signed seed)
 *                                                     → { token, expira }
 *   POST /recepcion/api/facturaselectronicas          → { trackId }
 *   GET  /consultaresultado/api/consultas/estado?trackid=…
 *
 * Every failure that is a *network* failure raises `DgiiUnavailableError`, which
 * the service reads as contingency rather than as an error. A 400 is not that: a
 * document DGII refuses is refused however many times it is sent.
 */
export class DgiiHttpGateway implements DgiiEcfGateway {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 30_000,
  ) {}

  async authenticate(identity: SigningIdentity): Promise<DgiiToken> {
    if (!identity.privateKeyPem || !identity.certificatePem) {
      throw new Error(
        "no hay certificado digital configurado: cargue el certificado antes de usar un ambiente DGII real",
      );
    }

    const seedXml = await this.get<string>("/autenticacion/api/autenticacion/semilla", "text");
    const signed = this.signSeed(seedXml, identity.privateKeyPem);

    const body = new FormData();
    body.append("xml", new Blob([signed], { type: "text/xml" }), "semilla.xml");
    const auth = await this.post<{ token: string; expira: string }>(
      "/autenticacion/api/autenticacion/validacioncertificado",
      body,
    );

    return { token: auth.token, expiresAt: auth.expira };
  }

  async submit(signedXml: string, token: DgiiToken): Promise<SubmitResult> {
    const body = new FormData();
    body.append("xml", new Blob([signedXml], { type: "text/xml" }), "ecf.xml");
    const res = await this.post<{ trackId: string; estado?: string; mensajes?: any[] }>(
      "/recepcion/api/facturaselectronicas",
      body,
      token,
    );
    return {
      trackId: res.trackId,
      // Reception hands back a trackId, not a verdict; the verdict comes from
      // the consulta. Treating the acknowledgement as acceptance is the mistake
      // that reports unaccepted documents as filed.
      status: mapStatus(res.estado) ?? "enviado",
      message: summarize(res.mensajes),
    };
  }

  async queryStatus(trackId: string, token: DgiiToken): Promise<SubmitResult> {
    const res = await this.get<{ trackId: string; estado: string; mensajes?: any[] }>(
      `/consultaresultado/api/consultas/estado?trackid=${encodeURIComponent(trackId)}`,
      "json",
      token,
    );
    return {
      trackId,
      status: mapStatus(res.estado) ?? "enviado",
      message: summarize(res.mensajes),
    };
  }

  // ── transporte ─────────────────────────────────────────────────────────────

  private async get<T>(path: string, as: "json" | "text", token?: DgiiToken): Promise<T> {
    const res = await this.fetch(path, { method: "GET", headers: this.headers(token) });
    return (as === "text" ? await res.text() : await res.json()) as T;
  }

  private async post<T>(path: string, body: FormData, token?: DgiiToken): Promise<T> {
    const res = await this.fetch(path, { method: "POST", headers: this.headers(token), body });
    return (await res.json()) as T;
  }

  private async fetch(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, { ...init, signal: controller.signal });
    } catch (err) {
      // Unreachable, DNS failure, timeout — all contingency, none of them a
      // reason to consider the document rejected.
      throw new DgiiUnavailableError(`DGII inalcanzable (${path}): ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }

    // 5xx is DGII being down; 429 is DGII asking us to wait. Both are
    // contingency. A 4xx is our document being wrong, and retrying will not fix
    // it, so it surfaces as an ordinary error.
    if (res.status >= 500 || res.status === 429) {
      throw new DgiiUnavailableError(`DGII respondió ${res.status} en ${path}`);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`DGII rechazó la solicitud (${res.status}): ${detail.slice(0, 500)}`);
    }
    return res;
  }

  private headers(token?: DgiiToken): Record<string, string> {
    return token ? { Authorization: `Bearer ${token.token}` } : {};
  }

  /** The seed is returned signed, enveloped, as the authentication proof. */
  private signSeed(seedXml: string, privateKeyPem: string): string {
    const signer = createSign("RSA-SHA256");
    signer.update(seedXml, "utf8");
    signer.end();
    const signature = signer.sign(privateKeyPem, "base64");
    return seedXml.replace(
      /<\/SemillaModel>\s*$/,
      `  <Signature><SignatureValue>${signature}</SignatureValue></Signature>\n</SemillaModel>`,
    );
  }
}

/** DGII's Spanish estados onto our enum. Unknown values stay `enviado`. */
function mapStatus(estado?: string): EcfStatus | undefined {
  switch (estado?.trim().toLowerCase()) {
    case "aceptado": return "aceptado";
    case "aceptado condicional":
    case "aceptadocondicional": return "aceptado_condicional";
    case "rechazado": return "rechazado";
    case "en proceso":
    case "enproceso": return "enviado";
    default: return undefined;
  }
}

const summarize = (messages?: any[]): string | undefined =>
  !messages?.length
    ? undefined
    : messages
        .map((m) => (typeof m === "string" ? m : `[${m.codigo ?? m.code ?? "?"}] ${m.valor ?? m.mensaje ?? ""}`))
        .join(" | ")
        .slice(0, 1000);
