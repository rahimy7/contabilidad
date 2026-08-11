import { withoutTenant, withCompany } from "../tenant-context";
import { EcfService } from "../fiscal/ecf/ecf-service";

/**
 * The e-CF retry worker.
 *
 * Everything the module does synchronously on a button press also has to happen
 * without one: a submission that came back "en proceso" needs polling until DGII
 * decides, and a document parked in contingency during an outage needs sending
 * once service returns. Without this, both states are permanent — the operator
 * sees "en proceso" forever and concludes the module is broken.
 *
 * Scoped per company, because `processQueue` runs inside a tenant transaction
 * and the retry schedule is the tenant's own. Companies are visited in turn and
 * a failure in one never stops the next: an expired certificate at one taxpayer
 * must not stall every other taxpayer on the instance.
 */

const RUN_EVERY_MS = Number(process.env.ECF_QUEUE_INTERVAL_MS ?? 120_000);
/** Per company, per run. Bounded so one backlog cannot monopolise the worker. */
const BATCH = Number(process.env.ECF_QUEUE_BATCH ?? 25);

let timer: NodeJS.Timeout | null = null;
let running = false;

export async function processEcfQueues(): Promise<{
  companies: number;
  checked: number;
  resolved: number;
  failed: number;
}> {
  // Only companies with e-CF actually turned on and something waiting. Reading
  // the roster outside any tenant scope is deliberate and is the one cross-tenant
  // query here — `withoutTenant` names it so it can be audited.
  const companies = await withoutTenant(async (c) => {
    const { rows } = await c.query(
      `SELECT DISTINCT t.company_id
         FROM ecf_transmissions t
         JOIN ecf_config cfg ON cfg.company_id = t.company_id AND cfg.is_enabled
        WHERE t.state IN ('queued','sending','sent')
          AND t.next_attempt_at IS NOT NULL AND t.next_attempt_at <= now()`,
    );
    return rows.map((r) => Number(r.company_id));
  });

  let checked = 0;
  let resolved = 0;
  let failed = 0;

  for (const companyId of companies) {
    try {
      const out = await withCompany(companyId, (c) => new EcfService(c).processQueue(companyId, BATCH));
      checked += out.checked;
      resolved += out.resolved;
      failed += out.failed;
    } catch (err) {
      // One tenant's problem is not the others'. It is logged and the loop
      // continues; the document stays queued and comes back next run.
      console.error(`[ecf-queue] empresa ${companyId}:`, (err as Error).message);
      failed++;
    }
  }

  return { companies: companies.length, checked, resolved, failed };
}

export function startEcfJobs(): void {
  if (timer) return;
  timer = setInterval(async () => {
    // Skip rather than queue up: a run that outlives its interval means DGII is
    // slow, and stacking another on top of it makes that worse.
    if (running) return;
    running = true;
    try {
      const out = await processEcfQueues();
      if (out.checked > 0) {
        console.log(
          `[ecf-queue] ${out.checked} revisados, ${out.resolved} resueltos, ${out.failed} con error ` +
            `(${out.companies} empresa(s))`,
        );
      }
    } catch (err) {
      console.error("[ecf-queue] error:", (err as Error).message);
    } finally {
      running = false;
    }
  }, RUN_EVERY_MS);
  // Do not hold the process open for this: an idle timer should never be the
  // reason a container refuses to shut down.
  timer.unref?.();
  console.log(`📄 Cola e-CF activa (cada ${Math.round(RUN_EVERY_MS / 1000)}s)`);
}

export function stopEcfJobs(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
