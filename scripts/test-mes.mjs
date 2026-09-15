/**
 * Runs the October 2026 month simulation test against the database in .env.
 *
 *   yarn test:mes            (or: node scripts/test-mes.mjs)
 *   SCENARIO_VERBOSE=1 yarn test:mes   shows each step as it runs
 *   SCENARIO_KEEP=1 yarn test:mes      keeps the test company afterwards
 *
 * Integration tests only run when TEST_DATABASE_URL is set. This wrapper uses
 * TEST_DATABASE_URL if you exported one, otherwise DATABASE_URL from .env, so
 * nobody has to paste a connection string on the command line.
 */
import "dotenv/config";
import { spawn } from "node:child_process";

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!url || !/^postgres(ql)?:\/\//.test(url)) {
  console.error("No hay una URL de base de datos válida: defina DATABASE_URL en .env o exporte TEST_DATABASE_URL.");
  process.exit(1);
}
const host = (() => {
  try { return new URL(url).host; } catch { return "?"; }
})();
console.log(`Base de prueba: ${host}`);

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["vitest", "run", "test/scenario/distribuidora-october.test.ts", ...process.argv.slice(2)],
  { stdio: "inherit", env: { ...process.env, TEST_DATABASE_URL: url } },
);
child.on("exit", (code) => process.exit(code ?? 1));
