import { randomUUID } from "node:crypto";
import { DgiiEcfGateway, DgiiToken, SubmitResult, DgiiUnavailableError } from "./types";

/**
 * An in-memory stand-in for the DGII e-CF webservices.
 *
 * It runs the real state machine — authenticate, submit, query — so the service,
 * the contingency path and the status transitions are all exercised without a
 * network or a certificate. Behaviour is configurable so tests can drive
 * rejection and outages, not just the happy path.
 *
 * The live gateway implements the same interface against the DGII endpoints
 * (seed → signed seed → token, then recepción/consulta) once credentials exist.
 */
export interface TestGatewayOptions {
  /** Force every submission to this outcome. Default: 'aceptado'. */
  outcome?: "aceptado" | "aceptado_condicional" | "rechazado";
  /** Throw on submit, as if DGII were unreachable, to exercise contingency. */
  unavailable?: boolean;
  /** Reject any e-CF whose XML contains this string. Simulates a schema error. */
  rejectIfContains?: string;
}

export class DgiiTestGateway implements DgiiEcfGateway {
  private submissions = new Map<string, SubmitResult>();

  constructor(private readonly opts: TestGatewayOptions = {}) {}

  async authenticate(): Promise<DgiiToken> {
    if (this.opts.unavailable) throw new DgiiUnavailableError("DGII auth unreachable (test)");
    return { token: `test-${randomUUID()}`, expiresAt: new Date(Date.now() + 3600_000).toISOString() };
  }

  async submit(signedXml: string, _token: DgiiToken): Promise<SubmitResult> {
    if (this.opts.unavailable) throw new DgiiUnavailableError("DGII recepción unreachable (test)");

    const trackId = randomUUID();
    let status = this.opts.outcome ?? "aceptado";
    let message: string | undefined;

    if (this.opts.rejectIfContains && signedXml.includes(this.opts.rejectIfContains)) {
      status = "rechazado";
      message = `contiene ${this.opts.rejectIfContains}`;
    }

    const result: SubmitResult = { trackId, status, message };
    this.submissions.set(trackId, result);
    return result;
  }

  async queryStatus(trackId: string): Promise<SubmitResult> {
    const found = this.submissions.get(trackId);
    if (!found) return { trackId, status: "enviado", message: "no encontrado" };
    return found;
  }
}
