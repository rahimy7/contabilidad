import { Pool } from "@neondatabase/serverless";
import { PostingEngine } from "./posting-engine";
import { AccountingEvent, SqlClient } from "./types";

/**
 * The transactional outbox.
 *
 * The happy path is to post an event in the same transaction that writes the
 * business document — see `FiscalDocumentService`. Sometimes that is impossible:
 * the ledger is not ready yet (fiscal documents shipped before the GL did), the
 * event arrives from a webhook, or a batch job produces thousands of postings
 * that should not hold one transaction open.
 *
 * In those cases the event is enqueued in the same transaction as the document —
 * so it can never be lost — and a worker drains it afterwards. Redelivery is
 * safe because `PostingEngine.post` is idempotent on
 * (source_type, source_id, source_event); the worst case of a crash mid-drain is
 * that a row is processed twice and the second attempt posts nothing.
 */

export interface OutboxRow {
  id: number;
  companyId: number;
  eventType: string;
  sourceType: string;
  sourceId: string;
  sourceEvent: string;
  payload: AccountingEvent;
  attempts: number;
}

/** Enqueue inside the caller's transaction. Never in a transaction of its own. */
export async function enqueue(
  client: SqlClient,
  event: AccountingEvent,
  sourceEvent: string,
): Promise<void> {
  await client.query(
    `INSERT INTO accounting_outbox
       (company_id, event_type, source_type, source_id, source_event, payload)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (company_id, source_type, source_id, source_event) DO NOTHING`,
    [
      event.companyId,
      event.eventType,
      event.sourceType,
      event.sourceId,
      sourceEvent,
      JSON.stringify(event),
    ],
  );
}

export interface DrainResult {
  processed: number;
  alreadyPosted: number;
  failed: number;
}

/**
 * Drains pending events, one transaction per event.
 *
 * `FOR UPDATE SKIP LOCKED` lets several workers drain concurrently without
 * either blocking on the other or handing the same row to both. A failing event
 * records its error and is left pending, so a bad posting rule does not stall
 * the queue behind it — `maxAttempts` is what eventually parks it.
 */
export async function drainOutbox(
  pool: Pool,
  opts: { limit?: number; maxAttempts?: number } = {},
): Promise<DrainResult> {
  const limit = opts.limit ?? 50;
  const maxAttempts = opts.maxAttempts ?? 5;
  const result: DrainResult = { processed: 0, alreadyPosted: 0, failed: 0 };

  for (let i = 0; i < limit; i++) {
    const client = await pool.connect();
    let claimed: OutboxRow | null = null;
    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        `SELECT id, company_id, event_type, source_type, source_id, source_event, payload, attempts
           FROM accounting_outbox
          WHERE status = 'pending' AND attempts < $1 AND next_attempt_at <= now()
          ORDER BY created_at
          FOR UPDATE SKIP LOCKED
          LIMIT 1`,
        [maxAttempts],
      );
      if (rows.length === 0) {
        await client.query("ROLLBACK");
        break;
      }

      const row = rows[0];
      claimed = {
        id: Number(row.id),
        companyId: row.company_id,
        eventType: row.event_type,
        sourceType: row.source_type,
        sourceId: row.source_id,
        sourceEvent: row.source_event,
        payload: row.payload,
        attempts: row.attempts,
      };

      // The posting and the row's status change share this transaction: the
      // queue cannot say "done" for an entry that was rolled back.
      await client.query(`SELECT set_config('app.company_id', $1, true)`, [String(claimed.companyId)]);
      await client.query("SET LOCAL ROLE app_rls");

      const engine = new PostingEngine(client);
      const posted = await engine.post(claimed.payload, claimed.sourceEvent);

      await client.query("RESET ROLE");
      await client.query(
        `UPDATE accounting_outbox SET status='processed', processed_at=now() WHERE id=$1`,
        [claimed.id],
      );
      await client.query("COMMIT");

      if (posted.created) result.processed++;
      else result.alreadyPosted++;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      if (claimed) {
        // Recorded outside the failed transaction, or it would roll back too.
        // The backoff also keeps this drain from immediately re-claiming the row
        // and burning every attempt in one pass.
        await pool.query(
          `UPDATE accounting_outbox
              SET attempts = attempts + 1,
                  last_error = $2,
                  next_attempt_at = now() + (interval '1 minute' * power(2, attempts)),
                  status = CASE WHEN attempts + 1 >= $3 THEN 'failed' ELSE 'pending' END
            WHERE id = $1`,
          [claimed.id, err instanceof Error ? err.message : String(err), maxAttempts],
        );
        result.failed++;
      } else {
        throw err;
      }
    } finally {
      client.release();
    }
  }

  return result;
}
