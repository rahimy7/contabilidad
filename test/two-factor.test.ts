import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { TOTP, Secret } from "otpauth";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import {
  startEnrollment,
  completeEnrollment,
  disableTotp,
  verifyLoginCode,
  hasTotpEnabled,
  generateBackupCodes,
  consumeBackupCode,
} from "../server/services/two-factor";

neonConfig.webSocketConstructor = ws;

function currentCode(base32Secret: string): string {
  const totp = new TOTP({
    issuer: "Contabilidad DR",
    label: "totp-test",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(base32Secret),
  });
  return totp.generate();
}

/**
 * Enrolamiento y verificación TOTP. Los "códigos" se generan del secreto real
 * con la misma librería que usa el servidor, así el test es determinístico.
 */
describeIntegration("2FA (TOTP)", () => {
  let pool: Pool;
  let userId: number;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
    // Un usuario cualquiera; storage-level auth no toca estas columnas.
    await pool.query(`DELETE FROM users WHERE username = 'totp-test'`);
    const r = await pool.query(
      `INSERT INTO users (username, password, name, role, status)
       VALUES ('totp-test', 'irrelevant-hash', 'TOTP Test', 'admin', 'active') RETURNING id`,
    );
    userId = r.rows[0].id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await pool.end();
  });

  beforeEach(async () => {
    // Cada test parte con el usuario sin 2FA.
    await pool.query(
      `UPDATE users SET totp_secret = NULL, totp_enabled = false, totp_backup_codes = NULL,
                        totp_activated_at = NULL, totp_last_used_at = NULL
        WHERE id = $1`,
      [userId],
    );
  });

  it("enrolar deja el secreto guardado pero 2FA aún desactivado", async () => {
    const out = await startEnrollment(pool, userId, "totp-test");
    expect(out.secret).toBeTruthy();
    expect(out.otpauthUrl).toContain("otpauth://totp/");
    expect(out.qrDataUrl.startsWith("data:image/")).toBe(true);

    expect(await hasTotpEnabled(pool, userId)).toBe(false);
  });

  it("verificar el primer código activa 2FA y devuelve códigos de respaldo", async () => {
    const enroll = await startEnrollment(pool, userId, "totp-test");
    const code = currentCode(enroll.secret);

    const { backupCodes } = await completeEnrollment(pool, userId, code);
    expect(backupCodes).toHaveLength(8);
    expect(new Set(backupCodes).size).toBe(8);
    expect(await hasTotpEnabled(pool, userId)).toBe(true);
  });

  it("un código malo no activa 2FA", async () => {
    await startEnrollment(pool, userId, "totp-test");
    await expect(completeEnrollment(pool, userId, "000000")).rejects.toThrow(/invalid code/);
    expect(await hasTotpEnabled(pool, userId)).toBe(false);
  });

  it("verifyLoginCode acepta el TOTP actual y actualiza last_used_at", async () => {
    const enroll = await startEnrollment(pool, userId, "totp-test");
    await completeEnrollment(pool, userId, currentCode(enroll.secret));

    const code = currentCode(enroll.secret);
    const out = await verifyLoginCode(pool, { userId, code });
    expect(out.ok).toBe(true);
    expect(out.usedBackupCode).toBe(false);

    const r = await pool.query(`SELECT totp_last_used_at FROM users WHERE id = $1`, [userId]);
    expect(r.rows[0].totp_last_used_at).not.toBeNull();
  });

  it("un TOTP fuera de rango falla; el mismo backup code sólo sirve una vez", async () => {
    const enroll = await startEnrollment(pool, userId, "totp-test");
    const { backupCodes } = await completeEnrollment(
      pool,
      userId,
      currentCode(enroll.secret),
    );

    const bad = await verifyLoginCode(pool, { userId, code: "654321" });
    expect(bad.ok).toBe(false);

    const first = await verifyLoginCode(pool, { userId, code: backupCodes[0] });
    expect(first.ok).toBe(true);
    expect(first.usedBackupCode).toBe(true);
    expect(first.remainingBackupCodes).toBe(7);

    const second = await verifyLoginCode(pool, { userId, code: backupCodes[0] });
    expect(second.ok).toBe(false);
  });

  it("disable borra el secreto y los backups; el usuario debe reenrolarse", async () => {
    const enroll = await startEnrollment(pool, userId, "totp-test");
    await completeEnrollment(pool, userId, currentCode(enroll.secret));

    await disableTotp(pool, userId);
    expect(await hasTotpEnabled(pool, userId)).toBe(false);
    const r = await pool.query(
      `SELECT totp_secret, totp_backup_codes FROM users WHERE id = $1`,
      [userId],
    );
    expect(r.rows[0].totp_secret).toBeNull();
    expect(r.rows[0].totp_backup_codes).toBeNull();
  });
});

// Tests puros de las utilidades: no requieren BD ni interpolación asincrónica.
describeIntegration("2FA utility functions", () => {
  it("consumeBackupCode elimina el que acertó y deja el resto", async () => {
    const { plain, hashed } = await generateBackupCodes();
    const out = await consumeBackupCode(hashed, plain[2]);
    expect(out.matched).toBe(true);
    expect(out.remaining).toHaveLength(7);
  });

  it("consumeBackupCode con un valor cualquiera no coincide", async () => {
    const { hashed } = await generateBackupCodes();
    const out = await consumeBackupCode(hashed, "ZZZZZZZZZZ");
    expect(out.matched).toBe(false);
    expect(out.remaining).toHaveLength(8);
  });
});
