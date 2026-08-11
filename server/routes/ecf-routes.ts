import { Router } from "express";
import { z } from "zod";
import { CompanyRequest, requireCompany, scoped } from "../http/require-company";
import { PostingError } from "../accounting/types";
import { EcfService, EcfValidationError } from "../fiscal/ecf/ecf-service";
import {
  loadEcfSettings, saveEcfSettings, storeCertificate,
} from "../fiscal/ecf/ecf-config";
import {
  receiveEcf, listReceived, getReceived, approveReceived, buildAcknowledgement,
  matchToPurchase, EcfInboxError,
} from "../fiscal/ecf/ecf-inbox";
import {
  fileRfce, previewRfce, voidSequenceRange, listSequenceVoids, EcfSummaryError,
} from "../fiscal/ecf/ecf-summaries";
import { representationOf, ecfDashboard } from "../fiscal/ecf/representation";
import { ECF_TYPES } from "../fiscal/ecf/ecf-types";
import { runEcfReadiness } from "../fiscal/ecf/readiness";

/**
 * The e-CF HTTP surface.
 *
 * Split from `fiscal-routes` because the two answer different questions: that
 * one is about comprobantes as accounting documents, this one is about the DGII
 * round trip — configuration, transmission, the queue, the inbox and the
 * printable representation. They share `fiscal_documents` and nothing else.
 *
 * Two endpoints are deliberately unlike the rest. `POST /inbox` is a *receiving*
 * endpoint: DGII pushes a supplier's e-CF to it, so it accepts raw XML rather
 * than JSON. And `POST /validate` changes nothing at all — it exists so a screen
 * can tell an operator that a document will be rejected *before* it burns an
 * eNCF proving it.
 */
export function ecfRoutes(): Router {
  const r = Router();
  r.use(requireCompany);

  // ── configuración ──────────────────────────────────────────────────────────

  r.get("/config", h(async (req) =>
    scoped(req, async (c) => ({ config: await loadEcfSettings(c, req.companyId!) })),
  ));

  r.put("/config", h(async (req) => {
    const b = configBody.parse(req.body);
    return scoped(req, async (c) => ({
      config: await saveEcfSettings(c, req.companyId!, {
        environment: b.environment, isEnabled: b.isEnabled, issuerRnc: b.issuerRnc,
        issuerName: b.issuerName, tradeName: b.tradeName, address: b.address,
        phone: b.phone, email: b.email, logoUrl: b.logoUrl,
        rfceThreshold: b.rfceThreshold, maxTransmitAttempts: b.maxTransmitAttempts,
      }),
    }));
  }));

  /**
   * Uploads the signing certificate. The private key goes in and is never
   * returned by any read path — what comes back is the fingerprint and expiry.
   */
  r.put("/certificate", h(async (req) => {
    const b = z.object({
      privateKeyPem: z.string().min(1, "falta la llave privada"),
      certificatePem: z.string().min(1, "falta el certificado"),
    }).parse(req.body);
    return scoped(req, async (c) => ({
      config: await storeCertificate(c, req.companyId!, {
        privateKeyPem: b.privateKeyPem, certificatePem: b.certificatePem,
      }),
    }));
  }));

  /** The catalogue, so a screen can label types without hardcoding them. */
  r.get("/types", h(async () => ({ types: Object.values(ECF_TYPES) })));

  r.get("/dashboard", h(async (req) => scoped(req, (c) => ecfDashboard(c, req.companyId!))));

  /** Diagnóstico de preparación: qué falta para poder emitir e-CF en producción. */
  r.get("/readiness", h(async (req) =>
    scoped(req, (c) => runEcfReadiness(c, req.companyId!)),
  ));

  // ── emisión ────────────────────────────────────────────────────────────────

  /** A dry run: what DGII would say, without spending anything. */
  r.post("/documents/:id/validate", h(async (req) =>
    scoped(req, (c) => new EcfService(c).validate(req.companyId!, Number(req.params.id))),
  ));

  r.post("/documents/:id/transmit", h(async (req) => {
    const id = Number(req.params.id);
    return scoped(req, async (c) => ({
      documentId: id,
      ...(await new EcfService(c).transmit(req.companyId!, id)),
    }));
  }));

  r.post("/documents/:id/refresh-status", h(async (req) => {
    const id = Number(req.params.id);
    return scoped(req, async (c) => ({
      documentId: id,
      ecfStatus: await new EcfService(c).refreshStatus(req.companyId!, id),
    }));
  }));

  /** Works the retry/poll queue on demand; the scheduler calls the same code. */
  r.post("/queue/process", h(async (req) => {
    const b = z.object({ limit: z.number().int().min(1).max(200).optional() }).parse(req.body ?? {});
    return scoped(req, (c) => new EcfService(c).processQueue(req.companyId!, b.limit ?? 25));
  }));

  r.get("/queue", h(async (req) =>
    scoped(req, async (c) => {
      const { rows } = await c.query(
        `SELECT t.id, t.document_id, d.ncf, d.ncf_type, d.total::text, d.ecf_status::text,
                t.state, t.attempts, t.next_attempt_at, t.last_error, t.track_id, t.dgii_status,
                t.created_at, t.updated_at
           FROM ecf_transmissions t
           JOIN fiscal_documents d ON d.id = t.document_id
          WHERE t.company_id=$1
          ORDER BY CASE t.state WHEN 'failed' THEN 0 WHEN 'abandoned' THEN 1 ELSE 2 END,
                   t.updated_at DESC
          LIMIT 200`,
        [req.companyId],
      );
      return { queue: rows };
    }),
  ));

  /** The DGII conversation for one document — the audit trail an inspection asks for. */
  r.get("/documents/:id/events", h(async (req) =>
    scoped(req, async (c) => {
      const { rows } = await c.query(
        `SELECT e.at, e.from_status, e.to_status, e.direction, e.dgii_message, e.http_status
           FROM fiscal_document_events e
           JOIN fiscal_documents d ON d.id = e.document_id AND d.company_id=$1
          WHERE e.document_id=$2 ORDER BY e.at`,
        [req.companyId, Number(req.params.id)],
      );
      return { events: rows };
    }),
  ));

  /** The signed XML itself: the legal document, downloadable. */
  r.get("/documents/:id/xml", async (req: CompanyRequest, res: any) => {
    try {
      const out = await scoped(req, async (c) => {
        const { rows } = await c.query(
          `SELECT ncf, xml_signed FROM fiscal_documents WHERE company_id=$1 AND id=$2`,
          [req.companyId, Number(req.params.id)],
        );
        return rows[0];
      });
      if (!out?.xml_signed) return res.status(404).json({ error: "el documento no ha sido firmado" });
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${out.ncf ?? "ecf"}.xml"`);
      res.send(out.xml_signed);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /** Everything the printable representation needs, including the QR payload. */
  r.get("/documents/:id/representation", h(async (req) =>
    scoped(req, async (c) => ({
      representation: await representationOf(c, req.companyId!, Number(req.params.id)),
    })),
  ));

  // ── bandeja de recibidos ───────────────────────────────────────────────────

  /**
   * Where a supplier's e-CF arrives. Accepts raw XML because that is what DGII
   * pushes; the JSON body form is there so the UI can paste one in for testing.
   */
  r.post("/inbox", h(async (req) => {
    const xml = typeof req.body === "string"
      ? req.body
      : z.object({ xml: z.string().min(1, "falta el XML") }).parse(req.body).xml;
    return scoped(req, async (c) => ({
      status: 201,
      ...(await receiveEcf(c, req.companyId!, xml)),
    }));
  }));

  r.get("/inbox", h(async (req) => {
    const q = z.object({
      approvalStatus: z.enum(["pendiente", "aceptado", "rechazado"]).optional(),
      from: isoDate.optional(),
      to: isoDate.optional(),
      limit: z.coerce.number().int().max(500).optional(),
    }).parse(req.query);
    return scoped(req, async (c) => ({ received: await listReceived(c, req.companyId!, q) }));
  }));

  r.get("/inbox/:id", h(async (req) =>
    scoped(req, (c) => getReceived(c, req.companyId!, Number(req.params.id))),
  ));

  /** The acuse de recibo we owe the issuer within the hour. */
  r.post("/inbox/:id/acknowledge", h(async (req) =>
    scoped(req, (c) => buildAcknowledgement(c, req.companyId!, Number(req.params.id))),
  ));

  /** The commercial verdict. Silence counts as acceptance, so this is the record. */
  r.post("/inbox/:id/approve", h(async (req) => {
    const b = z.object({
      status: z.enum(["aceptado", "rechazado"]),
      reason: z.string().optional(),
    }).parse(req.body);
    return scoped(req, (c) =>
      approveReceived(c, req.companyId!, Number(req.params.id), {
        status: b.status, reason: b.reason, userId: uid(req),
      }),
    );
  }));

  r.post("/inbox/:id/match", h(async (req) => {
    const b = z.object({ purchaseDocumentId: z.number().int().positive() }).parse(req.body);
    return scoped(req, (c) =>
      matchToPurchase(c, req.companyId!, Number(req.params.id), b.purchaseDocumentId),
    );
  }));

  // ── RFCE y anulación de rangos ─────────────────────────────────────────────

  r.get("/rfce/preview", h(async (req) => {
    const q = z.object({ from: isoDate, to: isoDate }).parse(req.query);
    return scoped(req, (c) => previewRfce(c, req.companyId!, { from: q.from, to: q.to }));
  }));

  r.post("/rfce", h(async (req) => {
    const b = z.object({ from: isoDate, to: isoDate }).parse(req.body);
    return scoped(req, (c) => fileRfce(c, req.companyId!, { from: b.from, to: b.to }));
  }));

  r.get("/sequence-voids", h(async (req) =>
    scoped(req, async (c) => ({ voids: await listSequenceVoids(c, req.companyId!) })),
  ));

  r.post("/sequence-voids", h(async (req) => {
    const b = z.object({
      ecfType: z.string().regex(/^E\d{2}$/, "tipo de e-CF inválido"),
      rangeFrom: z.number().int().positive(),
      rangeTo: z.number().int().positive(),
      reason: z.string().optional(),
    }).parse(req.body);
    return scoped(req, async (c) => ({
      status: 201,
      ...(await voidSequenceRange(c, req.companyId!, {
        ecfType: b.ecfType, rangeFrom: b.rangeFrom, rangeTo: b.rangeTo,
        reason: b.reason, userId: uid(req),
      })),
    }));
  }));

  return r;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha inválida");

const configBody = z.object({
  environment: z.enum(["simulated", "test", "cert", "prod"]).optional(),
  isEnabled: z.boolean().optional(),
  issuerRnc: z.string().regex(/^\d{9}$|^\d{11}$/, "RNC inválido").optional(),
  issuerName: z.string().optional(),
  tradeName: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  logoUrl: z.string().optional(),
  rfceThreshold: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  maxTransmitAttempts: z.number().int().min(1).max(50).optional(),
});

const uid = (req: CompanyRequest) => (req.user?.id ? Number(req.user.id) : undefined);

function h(fn: (req: CompanyRequest) => Promise<any>) {
  return async (req: CompanyRequest, res: any) => {
    try {
      const out = await fn(req);
      const status = out?.status ?? 200;
      if (out && typeof out === "object") delete out.status;
      res.status(status).json(out);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "validación", issues: err.issues });
      }
      // A document that fails DGII validation is a 422: the request was
      // well-formed, the document is not — and the caller needs the messages,
      // not a generic failure.
      if (err instanceof EcfValidationError) {
        return res.status(422).json({ error: err.message, messages: err.messages });
      }
      if (err instanceof EcfInboxError || err instanceof EcfSummaryError || err instanceof PostingError) {
        return res.status(400).json({ error: (err as Error).message });
      }
      console.error("[ecf]", err);
      res.status(500).json({ error: (err as Error).message ?? "error interno" });
    }
  };
}
