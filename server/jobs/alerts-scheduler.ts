import cron from "node-cron";
import type { Pool } from "@neondatabase/serverless";
import { runAlerts } from "../services/alerts";
import { processDeliveries } from "../services/alert-delivery";

/**
 * Cron scheduler para el motor de alertas.
 *
 * Dos jobs corriendo periódicamente:
 *   - Evaluator: cada 15 min recorre todas las reglas activas por store
 *   - Delivery: cada 5 min despacha deliveries pending
 *
 * Se detiene limpiamente al recibir SIGTERM/SIGINT.
 */

interface SchedulerState {
  evaluatorJob?: cron.ScheduledTask;
  deliveryJob?: cron.ScheduledTask;
  running: boolean;
}

const state: SchedulerState = { running: false };

export function startAlertScheduler(pool: Pool) {
  if (state.running) {
    console.warn("[alerts scheduler] ya está corriendo");
    return;
  }
  const evaluatorSchedule = process.env.ALERTS_EVAL_CRON ?? "*/15 * * * *";
  const deliverySchedule = process.env.ALERTS_DELIVERY_CRON ?? "*/5 * * * *";

  state.evaluatorJob = cron.schedule(evaluatorSchedule, async () => {
    try {
      const stores = await pool.query(
        `SELECT DISTINCT store_id FROM alert_rules WHERE is_active = true`,
      );
      let totalEvents = 0;
      for (const row of stores.rows) {
        const r = await runAlerts(pool, Number(row.store_id));
        totalEvents += r.eventsCreated;
      }
      if (totalEvents > 0) {
        console.log(`[alerts scheduler] ${totalEvents} eventos nuevos generados`);
      }
    } catch (err) {
      console.error("[alerts scheduler] error evaluando:", err);
    }
  });

  state.deliveryJob = cron.schedule(deliverySchedule, async () => {
    try {
      const stats = await processDeliveries(pool);
      if (stats.sent > 0 || stats.failed > 0) {
        console.log(`[alerts scheduler] delivery: ${stats.sent} enviados, ${stats.failed} fallidos, ${stats.skipped} skipped`);
      }
    } catch (err) {
      console.error("[alerts scheduler] error entregando:", err);
    }
  });

  state.running = true;
  console.log(`[alerts scheduler] iniciado — evaluación ${evaluatorSchedule}, delivery ${deliverySchedule}`);

  const shutdown = () => {
    state.evaluatorJob?.stop();
    state.deliveryJob?.stop();
    state.running = false;
    console.log("[alerts scheduler] detenido");
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

export function stopAlertScheduler() {
  state.evaluatorJob?.stop();
  state.deliveryJob?.stop();
  state.running = false;
}

export function isSchedulerRunning(): boolean {
  return state.running;
}
