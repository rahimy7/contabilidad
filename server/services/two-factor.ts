import { TOTP, Secret } from "otpauth";
import { toDataURL } from "qrcode";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import type { Pool } from "@neondatabase/serverless";

/**
 * TOTP RFC 6238 vía `otpauth`. Ventana de ±1 paso para tolerar drift; el
 * dispositivo típico se desincroniza minutos al día.
 */
const ISSUER = "Contabilidad DR";
const BACKUP_CODE_COUNT = 8;
const BACKUP_CODE_LENGTH = 10;

function totpFor(username: string, secret: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label: username,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
}

export interface EnrollmentResult {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

export function generateSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function verifyCode(secret: string, code: string, username = "user"): boolean {
  try {
    // `validate` devuelve el delta de pasos si coincide, o null si no.
    const delta = totpFor(username, secret).validate({
      token: code.trim(),
      window: 1,
    });
    return delta !== null;
  } catch {
    return false;
  }
}

export async function buildEnrollment(username: string, secret: string): Promise<EnrollmentResult> {
  const otpauthUrl = totpFor(username, secret).toString();
  const qrDataUrl = await toDataURL(otpauthUrl);
  return { secret, otpauthUrl, qrDataUrl };
}

/** Genera N códigos legibles y los devuelve en claro; hasheados van a la BD. */
export async function generateBackupCodes(): Promise<{ plain: string[]; hashed: string[] }> {
  const plain: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const raw = crypto.randomBytes(BACKUP_CODE_LENGTH).toString("hex").slice(0, BACKUP_CODE_LENGTH).toUpperCase();
    plain.push(raw);
    hashed.push(await bcrypt.hash(raw, 10));
  }
  return { plain, hashed };
}

/** Verifica un código de respaldo y, si acierta, lo consume del arreglo. */
export async function consumeBackupCode(
  hashedCodes: string[] | null,
  candidate: string,
): Promise<{ matched: boolean; remaining: string[] }> {
  if (!hashedCodes?.length) return { matched: false, remaining: hashedCodes ?? [] };
  const cleaned = candidate.trim().toUpperCase();
  for (let i = 0; i < hashedCodes.length; i++) {
    if (await bcrypt.compare(cleaned, hashedCodes[i])) {
      const remaining = [...hashedCodes.slice(0, i), ...hashedCodes.slice(i + 1)];
      return { matched: true, remaining };
    }
  }
  return { matched: false, remaining: hashedCodes };
}

/**
 * Enrolamiento: crea el secreto pero deja `totp_enabled = false` hasta que
 * el usuario verifique el primer código. Sin este paso, un dispositivo mal
 * configurado dejaría al usuario fuera de su cuenta.
 */
export async function startEnrollment(
  pool: Pool,
  userId: number,
  username: string,
): Promise<EnrollmentResult> {
  const secret = generateSecret();
  await pool.query(
    `UPDATE users SET totp_secret = $2, totp_enabled = false WHERE id = $1`,
    [userId, secret],
  );
  return buildEnrollment(username, secret);
}

/**
 * Verifica el primer código y activa 2FA. Devuelve los códigos de respaldo
 * *una sola vez*; el usuario debe copiarlos ahora o perderlos.
 */
export async function completeEnrollment(
  pool: Pool,
  userId: number,
  code: string,
): Promise<{ backupCodes: string[] }> {
  const row = await pool.query(
    `SELECT totp_secret FROM users WHERE id = $1`,
    [userId],
  );
  const secret = row.rows[0]?.totp_secret as string | null;
  if (!secret) throw new Error("no active enrollment");

  const usernameRow = await pool.query(`SELECT username FROM users WHERE id = $1`, [userId]);
  const username = usernameRow.rows[0]?.username ?? "user";
  if (!verifyCode(secret, code, username)) throw new Error("invalid code");

  const backups = await generateBackupCodes();
  await pool.query(
    `UPDATE users SET totp_enabled = true, totp_backup_codes = $2, totp_activated_at = now()
      WHERE id = $1`,
    [userId, backups.hashed],
  );
  return { backupCodes: backups.plain };
}

/** Desactivar 2FA borra el secreto y los backups; el usuario debe reenrolarse. */
export async function disableTotp(pool: Pool, userId: number): Promise<void> {
  await pool.query(
    `UPDATE users SET totp_enabled = false, totp_secret = NULL,
                       totp_backup_codes = NULL, totp_activated_at = NULL
      WHERE id = $1`,
    [userId],
  );
}

export interface VerifyLoginInput {
  userId: number;
  code: string;
}

export interface VerifyLoginResult {
  ok: boolean;
  usedBackupCode: boolean;
  remainingBackupCodes: number;
}

/**
 * Verificación en el login: TOTP normal o código de respaldo. Los backups
 * son de un solo uso; consumirlos también actualiza el arreglo en la BD.
 */
export async function verifyLoginCode(
  pool: Pool,
  input: VerifyLoginInput,
): Promise<VerifyLoginResult> {
  const row = await pool.query(
    `SELECT totp_secret, totp_backup_codes, username FROM users WHERE id = $1 AND totp_enabled = true`,
    [input.userId],
  );
  if (!row.rowCount) return { ok: false, usedBackupCode: false, remainingBackupCodes: 0 };

  const secret = row.rows[0].totp_secret as string;
  const backups = row.rows[0].totp_backup_codes as string[] | null;
  const username = row.rows[0].username as string;

  if (secret && verifyCode(secret, input.code, username)) {
    await pool.query(`UPDATE users SET totp_last_used_at = now() WHERE id = $1`, [input.userId]);
    return { ok: true, usedBackupCode: false, remainingBackupCodes: backups?.length ?? 0 };
  }

  const outcome = await consumeBackupCode(backups, input.code);
  if (outcome.matched) {
    await pool.query(
      `UPDATE users SET totp_backup_codes = $2, totp_last_used_at = now() WHERE id = $1`,
      [input.userId, outcome.remaining],
    );
    return { ok: true, usedBackupCode: true, remainingBackupCodes: outcome.remaining.length };
  }

  return { ok: false, usedBackupCode: false, remainingBackupCodes: backups?.length ?? 0 };
}

/**
 * Consulta rápida para el flujo de login: ¿este usuario tiene 2FA activo?
 */
export async function hasTotpEnabled(pool: Pool, userId: number): Promise<boolean> {
  const r = await pool.query(`SELECT totp_enabled FROM users WHERE id = $1`, [userId]);
  return r.rows[0]?.totp_enabled === true;
}
