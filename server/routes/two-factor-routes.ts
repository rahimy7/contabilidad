import express, { type Response } from "express";
import jwt from "jsonwebtoken";
import { authenticateToken, type AuthenticatedRequest } from "../authMiddleware";
import { masterPool } from "../multi-tenant-db";
import {
  startEnrollment,
  completeEnrollment,
  disableTotp,
  verifyLoginCode,
  hasTotpEnabled,
} from "../services/two-factor";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

// El challenge es un JWT corto que sólo prueba "usuario ya validó su
// contraseña"; el token de sesión completo se emite tras verificar el 2do
// factor. TTL corto para reducir la ventana de un reto robado.
const CHALLENGE_TTL_SECONDS = 5 * 60;

interface ChallengeClaims {
  purpose: "totp-challenge";
  userId: number;
  username: string;
  role: string;
  storeId: number;
  warehouseId?: number | null;
  warehouseName?: string | null;
}

export function issueTotpChallenge(claims: Omit<ChallengeClaims, "purpose">): string {
  const payload: ChallengeClaims = { purpose: "totp-challenge", ...claims };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: CHALLENGE_TTL_SECONDS });
}

// ── Enrolamiento ────────────────────────────────────────────────────────────

router.post("/auth/2fa/enroll", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const enrollment = await startEnrollment(masterPool, user.id, user.username);
    // No devolvemos el secret en claro salvo por conveniencia para clientes que
    // no procesen QR; el otpauth_url también lo contiene.
    res.json({
      otpauthUrl: enrollment.otpauthUrl,
      qrDataUrl: enrollment.qrDataUrl,
      secret: enrollment.secret,
    });
  } catch (err) {
    console.error("[2fa] enroll failed:", err);
    res.status(500).json({ error: "Failed to start 2FA enrollment" });
  }
});

router.post("/auth/2fa/enroll/verify", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const code = String((req.body as { code?: string })?.code ?? "").trim();
    if (!code) return res.status(400).json({ error: "code is required" });
    const { backupCodes } = await completeEnrollment(masterPool, user.id, code);
    res.json({
      enabled: true,
      backupCodes,
      warning: "Guárdalos ahora. No los volveremos a mostrar.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "invalid";
    if (message === "invalid code") return res.status(400).json({ error: "invalid code" });
    if (message === "no active enrollment") return res.status(400).json({ error: "no active enrollment" });
    console.error("[2fa] enroll verify failed:", err);
    res.status(500).json({ error: "Failed to complete 2FA enrollment" });
  }
});

router.post("/auth/2fa/disable", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    // Pedir el código actual para evitar que alguien con la sesión abierta
    // desactive 2FA sin conocer el segundo factor.
    const code = String((req.body as { code?: string })?.code ?? "").trim();
    if (!code) return res.status(400).json({ error: "code is required" });
    const result = await verifyLoginCode(masterPool, { userId: user.id, code });
    if (!result.ok) return res.status(400).json({ error: "invalid code" });
    await disableTotp(masterPool, user.id);
    res.json({ enabled: false });
  } catch (err) {
    console.error("[2fa] disable failed:", err);
    res.status(500).json({ error: "Failed to disable 2FA" });
  }
});

router.get("/auth/2fa/status", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const enabled = await hasTotpEnabled(masterPool, user.id);
    res.json({ enabled });
  } catch (err) {
    console.error("[2fa] status failed:", err);
    res.status(500).json({ error: "Failed to read 2FA status" });
  }
});

// ── Verificación de login con reto (challenge) ─────────────────────────────

router.post("/auth/2fa/verify", async (req, res) => {
  try {
    const { challengeToken, code } = req.body ?? {};
    if (!challengeToken || !code) {
      return res.status(400).json({ error: "challengeToken and code are required" });
    }

    let claims: ChallengeClaims;
    try {
      const decoded = jwt.verify(challengeToken, JWT_SECRET);
      if (typeof decoded !== "object" || decoded === null) throw new Error("bad token");
      claims = decoded as ChallengeClaims;
      if (claims.purpose !== "totp-challenge") throw new Error("wrong purpose");
    } catch {
      return res.status(401).json({ error: "invalid or expired challenge" });
    }

    const result = await verifyLoginCode(masterPool, { userId: claims.userId, code: String(code) });
    if (!result.ok) return res.status(401).json({ error: "invalid code" });

    // Token de sesión completo con el mismo shape que el login sin 2FA.
    const token = jwt.sign(
      {
        userId: claims.userId,
        username: claims.username,
        role: claims.role,
        storeId: claims.storeId,
        warehouseId: claims.warehouseId ?? null,
        warehouseName: claims.warehouseName ?? null,
      },
      JWT_SECRET,
      { expiresIn: "24h" },
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.json({
      token,
      usedBackupCode: result.usedBackupCode,
      remainingBackupCodes: result.remainingBackupCodes,
    });
  } catch (err) {
    console.error("[2fa] verify failed:", err);
    res.status(500).json({ error: "Failed to verify 2FA" });
  }
});

export default router;
