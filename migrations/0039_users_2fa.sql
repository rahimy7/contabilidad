-- Doble factor de autenticación (TOTP RFC 6238).
--
-- El sistema autentica con contraseña simple; la nómina, los comprobantes
-- fiscales y los ajustes de inventario viven detrás de esa única barrera.
-- Esta migración agrega el estado por usuario:
--
--   * `totp_secret`    — clave base32 compartida; nula mientras 2FA no está
--                        activo. Rotarla es equivalente a desactivar.
--   * `totp_enabled`   — sólo se marca en true después de que el usuario
--                        verificó el primer código; sin esto un
--                        enrolamiento a medias bloquearía el login.
--   * `totp_backup_codes` — códigos de un solo uso hasheados con bcrypt para
--                          entrar cuando el usuario perdió el dispositivo.
--   * `totp_activated_at` / `totp_last_used_at` — auditoría mínima.
--
-- La contraseña se sigue almacenando como antes; el TOTP es un segundo
-- factor, no un reemplazo.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS totp_secret text,
    ADD COLUMN IF NOT EXISTS totp_enabled boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS totp_backup_codes text[],
    ADD COLUMN IF NOT EXISTS totp_activated_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS totp_last_used_at timestamp with time zone;
--> statement-breakpoint

-- Coherencia mínima: no puede haber `enabled = true` sin un secreto.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_totp_enabled_needs_secret_ck;
--> statement-breakpoint
ALTER TABLE users
    ADD CONSTRAINT users_totp_enabled_needs_secret_ck
    CHECK (totp_enabled = false OR totp_secret IS NOT NULL);
