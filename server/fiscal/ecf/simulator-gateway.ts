import { createHash, randomUUID } from "node:crypto";
import { SqlClient } from "../../accounting/types";
import {
  DgiiEcfGateway, DgiiToken, SubmitResult, SigningIdentity, DgiiUnavailableError, EcfStatus,
} from "./types";
import { validateEcf } from "./validator";
import { parseEcfXml } from "./xml-parser";

/**
 * A DGII that runs on your own database.
 *
 * This is not a mock. A mock returns `aceptado` and forgets; that proves a code
 * path and teaches the application nothing. This keeps every submission in
 * `ecf_simulator_inbox`, enforces the constraints the real service enforces, and
 * — the part that actually matters — resolves *asynchronously*. A real e-CF
 * comes back "En Proceso" and reaches its verdict seconds or minutes later, so
 * an application built against an instant `aceptado` has never once exercised
 * the polling, the queue or the states an operator spends their day in.
 *
 * What it reproduces faithfully:
 *
 *   The handshake. DGII issues a *semilla*, the taxpayer signs it, and the
 *   signed seed is exchanged for a one-hour token. Tokens here really do expire,
 *   so token refresh is a path that gets exercised rather than discovered in
 *   producción.
 *
 *   The validations. It runs `validateEcf` — the same rules the issuer runs
 *   before signing — plus the two that only the receiver can check: a duplicate
 *   eNCF from the same issuer, and an RNC that is not the one that authenticated.
 *
 *   The verdicts. Aceptado, Aceptado Condicional (warnings only) and Rechazado,
 *   each with the coded messages DGII returns, so a rejection in development
 *   reads like a rejection in production.
 *
 * What it cannot reproduce: whether DGII trusts your certificate. Nothing local
 * can.
 */

export interface SimulatorOptions {
  /**
   * How long a submission sits in `en_proceso` before resolving. Zero makes it
   * synchronous, which is convenient in tests and dishonest everywhere else.
   */
  resolveAfterMs?: number;
  /** Simulates an outage, to exercise the contingency path. */
  unavailable?: boolean;
  /** Rejects submissions regardless of validity, to exercise the rejected path. */
  forceOutcome?: "aceptado" | "aceptado_condicional" | "rechazado";
}

interface StoredToken {
  token: string;
  rnc: string;
  expiresAt: number;
}

/** Issued semillas, awaiting their signed return. Short-lived by design. */
const seeds = new Map<string, { rnc: string; issuedAt: number }>();
const tokens = new Map<string, StoredToken>();

const SEED_TTL_MS = 5 * 60_000;
const TOKEN_TTL_MS = 60 * 60_000;

export class DgiiSimulatorGateway implements DgiiEcfGateway {
  constructor(
    private readonly client: SqlClient,
    private readonly opts: SimulatorOptions = {},
  ) {}

  /**
   * The two-step DGII handshake, collapsed into one call because that is what
   * the interface exposes: request a semilla, sign it, exchange it for a token.
   */
  async authenticate(identity: SigningIdentity): Promise<DgiiToken> {
    if (this.opts.unavailable) {
      throw new DgiiUnavailableError("simulador: servicio de autenticación no disponible");
    }

    const rnc = identity.rnc ?? "000000000";
    const seed = this.issueSeed(rnc);
    // The taxpayer signs the seed. Without a certificate we accept a digest of
    // it — the shape of the exchange is preserved, the trust is not asserted.
    const signedSeed = createHash("sha256")
      .update(`${seed}:${identity.privateKeyPem ?? "sin-certificado"}`)
      .digest("hex");

    const token = this.exchangeSeed(seed, signedSeed, rnc);
    return { token: token.token, expiresAt: new Date(token.expiresAt).toISOString() };
  }

  async submit(signedXml: string, token: DgiiToken): Promise<SubmitResult> {
    if (this.opts.unavailable) {
      throw new DgiiUnavailableError("simulador: servicio de recepción no disponible");
    }
    const session = this.requireToken(token);

    const parsed = parseEcfXml(signedXml);
    const trackId = randomUUID();
    const messages: { code: string; message: string; severity: string }[] = [];

    // 1 — the document has to parse at all.
    if (!parsed) {
      return this.reject(trackId, session.rnc, "", null, "0", [
        { code: "XML-01", message: "el XML no pudo interpretarse", severity: "error" },
      ]);
    }

    // 2 — it has to be signed. DGII rejects an unsigned e-CF outright.
    if (!/<SignatureValue>/.test(signedXml)) {
      return this.reject(trackId, session.rnc, parsed.eNCF, parsed, parsed.totals.montoTotal, [
        { code: "FIRMA-01", message: "el comprobante no viene firmado", severity: "error" },
      ]);
    }

    // 3 — the issuer must be who authenticated. A token for one RNC cannot
    //     submit another taxpayer's comprobantes.
    if (parsed.issuerRnc !== session.rnc) {
      return this.reject(trackId, session.rnc, parsed.eNCF, parsed, parsed.totals.montoTotal, [
        {
          code: "AUTH-02",
          message: `el RNC emisor ${parsed.issuerRnc} no corresponde al token autenticado (${session.rnc})`,
          severity: "error",
        },
      ]);
    }

    // 4 — the same rules the issuer should have run before signing.
    const validation = validateEcf(parsed);
    messages.push(...validation.messages);

    // 5 — the one check only the receiver can make: has this eNCF been sent
    //     before? DGII refuses a second submission of the same number, and this
    //     is the constraint that catches a retry loop billing twice.
    const dup = await this.client.query(
      `SELECT track_id, status FROM ecf_simulator_inbox WHERE issuer_rnc=$1 AND encf=$2`,
      [parsed.issuerRnc, parsed.eNCF],
    );
    if (dup.rows.length > 0) {
      // A resend of something already accepted is answered with the original
      // verdict rather than an error — that is what makes retries safe.
      return {
        trackId: dup.rows[0].track_id,
        status: dup.rows[0].status as EcfStatus,
        message: `eNCF ${parsed.eNCF} ya fue recibido previamente`,
      };
    }

    const hasErrors = messages.some((x) => x.severity === "error");
    const hasWarnings = messages.some((x) => x.severity === "warning");
    const verdict: EcfStatus =
      this.opts.forceOutcome ??
      (hasErrors ? "rechazado" : hasWarnings ? "aceptado_condicional" : "aceptado");

    const delay = this.opts.resolveAfterMs ?? 0;
    // A rejection is immediate — DGII knows straight away that the XML is wrong.
    // An acceptance takes time, because it is queued behind their validations.
    const resolvesAt = verdict === "rechazado" || delay === 0
      ? new Date()
      : new Date(Date.now() + delay);
    const initial: EcfStatus = resolvesAt.getTime() > Date.now() ? "enviado" : verdict;

    await this.client.query(
      `INSERT INTO ecf_simulator_inbox
         (track_id, issuer_rnc, encf, ecf_type, buyer_rnc, total, status, messages, xml_received, resolves_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
      [
        trackId, parsed.issuerRnc, parsed.eNCF, parsed.tipoECF, parsed.buyerRnc ?? null,
        parsed.totals.montoTotal || "0",
        // Stored as the final verdict; `resolves_at` is what gates revealing it.
        verdict, JSON.stringify(messages), signedXml, resolvesAt,
      ],
    );

    return {
      trackId,
      status: initial,
      message: initial === "enviado"
        ? "recibido, en proceso de validación"
        : summarize(messages) ?? "recibido conforme",
    };
  }

  /**
   * Polls a submission. Before `resolves_at` it answers `enviado`; after, the
   * verdict — which is exactly the behaviour that forces the caller to have a
   * polling story.
   */
  async queryStatus(trackId: string, token: DgiiToken): Promise<SubmitResult> {
    if (this.opts.unavailable) {
      throw new DgiiUnavailableError("simulador: servicio de consulta no disponible");
    }
    this.requireToken(token);

    const { rows } = await this.client.query(
      `SELECT track_id, status, messages, resolves_at FROM ecf_simulator_inbox WHERE track_id=$1`,
      [trackId],
    );
    if (rows.length === 0) {
      return { trackId, status: "enviado", message: "trackId no encontrado" };
    }
    const row = rows[0];
    const pending = row.resolves_at && new Date(row.resolves_at).getTime() > Date.now();
    if (pending) {
      return { trackId, status: "enviado", message: "en proceso de validación" };
    }
    return {
      trackId,
      status: row.status as EcfStatus,
      message: summarize(row.messages ?? []) ?? "procesado",
    };
  }

  // ── el directorio ──────────────────────────────────────────────────────────

  /**
   * DGII's directory of electronic issuers: whether a taxpayer can receive
   * e-CF and at what URL. Consulted before sending, because a buyer who is not
   * an electronic receiver gets a printed representation instead.
   */
  async lookupTaxpayer(rnc: string): Promise<{
    rnc: string;
    name: string;
    isElectronicIssuer: boolean;
    receptionUrl?: string;
  }> {
    // Any RNC that has submitted through the simulator is, by construction, an
    // electronic issuer — which is the same inference DGII's directory makes.
    const { rows } = await this.client.query(
      `SELECT DISTINCT issuer_rnc FROM ecf_simulator_inbox WHERE issuer_rnc=$1 LIMIT 1`,
      [rnc],
    );
    const known = rows.length > 0;
    return {
      rnc,
      name: known ? `Contribuyente ${rnc}` : "No registrado",
      isElectronicIssuer: known,
      receptionUrl: known ? `simulated://recepcion/${rnc}` : undefined,
    };
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private issueSeed(rnc: string): string {
    const seed = randomUUID();
    seeds.set(seed, { rnc, issuedAt: Date.now() });
    // Housekeeping: expired seeds are not evidence of anything.
    for (const [k, v] of seeds) if (Date.now() - v.issuedAt > SEED_TTL_MS) seeds.delete(k);
    return seed;
  }

  private exchangeSeed(seed: string, signedSeed: string, rnc: string): StoredToken {
    const record = seeds.get(seed);
    if (!record) throw new DgiiUnavailableError("simulador: semilla inválida o vencida");
    if (Date.now() - record.issuedAt > SEED_TTL_MS) {
      seeds.delete(seed);
      throw new DgiiUnavailableError("simulador: la semilla venció");
    }
    if (!signedSeed) throw new DgiiUnavailableError("simulador: la semilla no viene firmada");
    seeds.delete(seed);

    const stored: StoredToken = {
      token: `sim.${Buffer.from(`${rnc}.${randomUUID()}`).toString("base64url")}`,
      rnc,
      expiresAt: Date.now() + TOKEN_TTL_MS,
    };
    tokens.set(stored.token, stored);
    return stored;
  }

  /** An expired or unknown token is a 401, and callers must re-authenticate. */
  private requireToken(token: DgiiToken): StoredToken {
    const found = tokens.get(token.token);
    if (!found) throw new DgiiTokenError("simulador: token desconocido");
    if (found.expiresAt < Date.now()) {
      tokens.delete(token.token);
      throw new DgiiTokenError("simulador: el token venció, autentique de nuevo");
    }
    return found;
  }

  private async reject(
    trackId: string,
    issuerRnc: string,
    encf: string,
    parsed: any,
    total: string | null,
    messages: { code: string; message: string; severity: string }[],
  ): Promise<SubmitResult> {
    // A rejected submission is still recorded: "we never got it" and "we got it
    // and refused it" are different answers, and only the record distinguishes.
    if (encf) {
      await this.client.query(
        `INSERT INTO ecf_simulator_inbox
           (track_id, issuer_rnc, encf, ecf_type, buyer_rnc, total, status, messages, resolves_at)
         VALUES ($1,$2,$3,$4,$5,$6,'rechazado',$7::jsonb, now())
         ON CONFLICT (issuer_rnc, encf) DO NOTHING`,
        [
          trackId, issuerRnc, encf, parsed?.tipoECF ?? null, parsed?.buyerRnc ?? null,
          total ?? "0", JSON.stringify(messages),
        ],
      );
    }
    return { trackId, status: "rechazado", message: summarize(messages) ?? "rechazado" };
  }
}

/** Distinct from an outage: a bad token is retried by re-authenticating, not by waiting. */
export class DgiiTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DgiiTokenError";
  }
}

const summarize = (messages: { code: string; message: string }[]): string | undefined =>
  messages.length === 0
    ? undefined
    : messages.map((x) => `[${x.code}] ${x.message}`).join(" | ").slice(0, 1000);
