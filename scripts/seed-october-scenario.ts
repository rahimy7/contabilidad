/**
 * Loads the October 2026 month of "Distribuidora Caribe" into a company you can
 * open in the UI, and prints the month-end controls.
 *
 *   yarn tsx scripts/seed-october-scenario.ts            # run the month (fails if it exists)
 *   yarn tsx scripts/seed-october-scenario.ts --reset    # wipe that company first, then run
 *   yarn tsx scripts/seed-october-scenario.ts --only-reset
 *
 * Options: --rnc=131900002 --prefix=DSC --store=1 --grant=<username>
 *
 * The rows land in legacy store 1 by default, so the POS and warehouse screens
 * of a normal login show them; the admin from ADMIN_USERNAME is given access to
 * the company. Uses DATABASE_URL. Never run it against production data.
 */
import "dotenv/config";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { runOctoberScenario, resetScenarioCompany } from "../server/scenario/distribuidora/runner";

neonConfig.webSocketConstructor = ws;

const arg = (name: string, fallback?: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está definido");
  const opts = {
    rnc: arg("rnc", "131900002")!,
    prefix: arg("prefix", "DSC")!,
    storeId: Number(arg("store", "1")),
    grantUsername: arg("grant", process.env.ADMIN_USERNAME ?? "admin"),
  };
  const pool = new Pool({ connectionString: url, max: 4 });
  pool.on("error", (err) => console.warn("[pool] conexión inactiva cerrada:", err.message));
  try {
    if (flag("reset") || flag("only-reset")) {
      console.log(`Borrando la empresa ${opts.rnc} y sus datos de prueba…`);
      await resetScenarioCompany(pool, opts);
      if (flag("only-reset")) return;
    }
    const started = Date.now();
    const result = await runOctoberScenario(pool, { ...opts, log: (step, msg) => console.log(`  ${step.padEnd(12)} ${msg}`) });
    console.log(`\nEmpresa ${result.companyId} (${opts.rnc}) cargada en ${Math.round((Date.now() - started) / 1000)} s.\n`);
    console.log("Controles de cierre de octubre 2026:");
    for (const c of result.october.checks) {
      console.log(`  ${c.ok ? "OK " : "DIF"} ${c.label.padEnd(72)} esperado ${c.expected.padStart(16)}  real ${c.actual.padStart(16)}  dif ${c.difference}`);
    }
    console.log("\nPasivos después de los pagos de noviembre:");
    for (const [code, bal] of Object.entries(result.afterStatutoryPayments)) console.log(`  ${code}  ${bal}`);
    if (!result.october.ok) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
