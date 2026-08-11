import type { Pool } from "@neondatabase/serverless";
import { sendEmail } from "../email-service";
import { sendWhatsAppMessageDirect } from "../whatsapp-simple";

/**
 * Delivery worker: procesa `alert_deliveries` pendientes.
 *
 * Cada delivery apunta a un evento + canal + destinatario. Este worker:
 *   1. Toma N pending por corrida
 *   2. Resuelve el destinatario (usa recipient_user_id o busca admins)
 *   3. Llama al adapter del canal (email/whatsapp/in_app)
 *   4. Marca sent/failed con timestamp
 *
 * Diseñado para ser idempotente: si falla mid-flight, la próxima corrida
 * reintenta sólo los que quedaron en pending.
 */

export class DeliveryError extends Error {}

export interface DeliveryStats {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}

export async function processDeliveries(
  pool: Pool,
  options?: { batchSize?: number; maxRetries?: number },
): Promise<DeliveryStats> {
  const batchSize = options?.batchSize ?? 50;
  const maxRetries = options?.maxRetries ?? 3;
  const stats: DeliveryStats = { processed: 0, sent: 0, failed: 0, skipped: 0 };

  const pending = await pool.query(
    `SELECT ad.id, ad.event_id AS "eventId", ad.channel,
            ad.recipient_user_id AS "recipientUserId",
            ad.recipient_address AS "recipientAddress",
            ad.retry_count AS "retryCount",
            ae.title, ae.payload, ae.severity, ae.store_id AS "storeId"
       FROM alert_deliveries ad
       JOIN alert_events ae ON ae.id = ad.event_id
      WHERE ad.status = 'pending' AND ad.retry_count < $2
      ORDER BY ad.created_at
      LIMIT $1`,
    [batchSize, maxRetries],
  );

  for (const d of pending.rows) {
    stats.processed++;
    try {
      const result = await deliverOne(pool, d);
      if (result === "sent") {
        stats.sent++;
        await pool.query(
          `UPDATE alert_deliveries SET status='sent', sent_at=now() WHERE id=$1`,
          [d.id],
        );
      } else {
        stats.skipped++;
        await pool.query(
          `UPDATE alert_deliveries SET status='skipped' WHERE id=$1`,
          [d.id],
        );
      }
    } catch (err: any) {
      stats.failed++;
      const nextRetry = d.retryCount + 1;
      const finalStatus = nextRetry >= maxRetries ? "failed" : "pending";
      await pool.query(
        `UPDATE alert_deliveries
            SET status=$2, retry_count=$3, error_message=$4
          WHERE id=$1`,
        [d.id, finalStatus, nextRetry, String(err.message ?? err).slice(0, 500)],
      );
    }
  }

  return stats;
}

async function deliverOne(pool: Pool, d: any): Promise<"sent" | "skipped"> {
  switch (d.channel) {
    case "in_app":
      return "sent"; // El estado 'new' en alert_events ya sirve como notificación in-app.
    case "email":
      return await deliverEmail(pool, d);
    case "whatsapp":
      return await deliverWhatsApp(pool, d);
    default:
      return "skipped";
  }
}

async function deliverEmail(pool: Pool, d: any): Promise<"sent" | "skipped"> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new DeliveryError("SMTP no configurado");
  }
  const address = d.recipientAddress ?? await resolveEmail(pool, d.recipientUserId, d.storeId);
  if (!address) return "skipped";
  const subject = `[${String(d.severity ?? "info").toUpperCase()}] ${d.title}`;
  const text = buildTextBody(d);
  await sendEmail({ to: address, subject, text, html: text.replace(/\n/g, "<br>") });
  return "sent";
}

async function deliverWhatsApp(pool: Pool, d: any): Promise<"sent" | "skipped"> {
  const phone = d.recipientAddress ?? await resolvePhone(pool, d.recipientUserId, d.storeId);
  if (!phone) return "skipped";
  const emoji = d.severity === "critical" ? "🚨" : d.severity === "warning" ? "⚠️" : "ℹ️";
  const body = `${emoji} *Alerta*\n${d.title}\n\n${formatPayload(d.payload)}`;
  await sendWhatsAppMessageDirect(phone, body, d.storeId);
  return "sent";
}

async function resolveEmail(pool: Pool, userId: number | null, storeId: number): Promise<string | null> {
  if (userId) {
    const r = await pool.query(`SELECT email FROM users WHERE id = $1 LIMIT 1`, [userId]);
    return r.rows[0]?.email ?? null;
  }
  // Broadcast: admins del store.
  const r = await pool.query(
    `SELECT email FROM users WHERE store_id = $1 AND role IN ('admin','super_admin') AND email IS NOT NULL LIMIT 1`,
    [storeId],
  );
  return r.rows[0]?.email ?? null;
}

async function resolvePhone(pool: Pool, userId: number | null, storeId: number): Promise<string | null> {
  if (userId) {
    const r = await pool.query(`SELECT phone FROM users WHERE id = $1 LIMIT 1`, [userId]);
    return r.rows[0]?.phone ?? null;
  }
  const r = await pool.query(
    `SELECT phone FROM users WHERE store_id = $1 AND role IN ('admin','super_admin') AND phone IS NOT NULL LIMIT 1`,
    [storeId],
  );
  return r.rows[0]?.phone ?? null;
}

function buildTextBody(d: any): string {
  return `${d.title}\n\n${formatPayload(d.payload)}\n\n—\nAlerta generada automáticamente por el sistema ERP.`;
}

function formatPayload(payload: any): string {
  if (!payload || typeof payload !== "object") return "";
  return Object.entries(payload)
    .filter(([, v]) => v != null && typeof v !== "object")
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join("\n");
}
