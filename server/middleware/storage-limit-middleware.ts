/**
 * storage-limit-middleware.ts
 * Middleware para validar y enforcer límites de almacenamiento
 */

import { getStorageUsageWithLimits } from "../storage-calculator";
import type { Request, Response, NextFunction } from "express";

interface AuthenticatedRequest extends Request {
  user?: {
    storeId?: number;
    id?: number;
    role?: string;
  };
}

/**
 * Middleware para verificar si una tienda ha alcanzado su límite de almacenamiento
 * Bloquea operaciones que aumentarían el almacenamiento (crear, actualizar datos grandes)
 */
export async function checkStorageLimitMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    // Solo aplicar a tiendas regulares, no a super admin
    if (req.user?.role === "super_admin") {
      return next();
    }

    const storeId = req.user?.storeId;
    if (!storeId) {
      return res.status(401).json({ error: "Store ID not found in request" });
    }

    // Obtener el uso actual de almacenamiento
    const storageUsage = await getStorageUsageWithLimits(storeId);

    // Si el plan es ilimitado, permitir la operación
    if (storageUsage.isUnlimited) {
      req.storageUsage = storageUsage;
      return next();
    }

    // Si el almacenamiento está sobre el límite, bloquear operación
    if (storageUsage.isOverLimit) {
      return res.status(413).json({
        error: "Storage quota exceeded",
        message: `Your store has exceeded its storage limit (${storageUsage.currentStorageGB.toFixed(2)}GB / ${storageUsage.maxStorageGB?.toFixed(2)}GB)`,
        details: {
          currentStorageGB: storageUsage.currentStorageGB,
          maxStorageGB: storageUsage.maxStorageGB,
          percentageUsed: storageUsage.percentageUsed,
        },
        code: "STORAGE_QUOTA_EXCEEDED",
      });
    }

    // Si está cerca del límite (90%), enviar una advertencia
    if (storageUsage.isNearLimit) {
      console.warn(
        `⚠️ Store ${storeId} is near storage limit: ${storageUsage.percentageUsed.toFixed(2)}%`
      );
    }

    // Adjuntar información de almacenamiento a la request
    req.storageUsage = storageUsage;
    next();
  } catch (error) {
    console.error("[Storage Limit Middleware] Error:", error);
    // Si hay error, permitir la operación pero loguear
    next();
  }
}

/**
 * Middleware específico para operaciones que requieren escritura de datos grandes
 * (crear productos, subir imágenes, crear órdenes grandes, etc.)
 */
export async function checkStorageLimitForDataWriteMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (req.user?.role === "super_admin") {
      return next();
    }

    const storeId = req.user?.storeId;
    if (!storeId) {
      return res.status(401).json({ error: "Store ID not found in request" });
    }

    const storageUsage = await getStorageUsageWithLimits(storeId);

    // Bloquear si está sobre el límite
    if (storageUsage.isOverLimit) {
      return res.status(413).json({
        error: "Storage quota exceeded",
        message: "Your store cannot perform this operation due to storage quota limits",
        code: "STORAGE_QUOTA_EXCEEDED",
      });
    }

    // Advertencia si está al 85% de capacidad
    if (storageUsage.percentageUsed >= 85 && !storageUsage.isUnlimited) {
      console.warn(
        `⚠️ Store ${storeId} is at ${storageUsage.percentageUsed.toFixed(2)}% storage capacity`
      );
    }

    req.storageUsage = storageUsage;
    next();
  } catch (error) {
    console.error("[Storage Limit Data Write Middleware] Error:", error);
    next();
  }
}

/**
 * Utility function para verificar si una tienda puede realizar una operación
 * Retorna objeto con permiso y detalles
 */
export async function canPerformStorageOperation(
  storeId: number
): Promise<{
  allowed: boolean;
  reason?: string;
  storageUsage?: any;
}> {
  try {
    const storageUsage = await getStorageUsageWithLimits(storeId);

    if (storageUsage.isUnlimited) {
      return { allowed: true, storageUsage };
    }

    if (storageUsage.isOverLimit) {
      return {
        allowed: false,
        reason: `Storage quota exceeded (${storageUsage.currentStorageGB.toFixed(2)}GB / ${storageUsage.maxStorageGB?.toFixed(2)}GB)`,
        storageUsage,
      };
    }

    return { allowed: true, storageUsage };
  } catch (error) {
    console.error("Error checking storage operation permission:", error);
    // En caso de error, permitir la operación
    return { allowed: true };
  }
}

/**
 * Extend Express Request type to include storageUsage
 */
declare global {
  namespace Express {
    interface Request {
      storageUsage?: {
        storeId: number;
        currentStorageGB: number;
        maxStorageGB: number | null;
        isUnlimited: boolean;
        percentageUsed: number;
        isNearLimit: boolean;
        isOverLimit: boolean;
      };
    }
  }
}
