import { type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthUser } from '@shared/auth';

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false, 
      message: 'Token inválido o expirado' // ✅ Mensaje consistente
    });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');

    if (typeof decoded !== 'object' || decoded === null) {
      return res.status(403).json({ error: 'Token inválido' });
    }

    const user = decoded as any;
    
    // ✅ Solo verificar storeId para usuarios que no son super_admin
    if (user.role !== 'super_admin' && user.level !== 'global') {
      if (!user.storeId) {
        return res.status(403).json({ error: 'Token incompleto - falta storeId' });
      }
    }

    req.user = decoded as AuthUser;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido o expirado' });
  }
};

/**
 * Middleware para verificar que el usuario es super admin
 */
export const requireSuperAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const user = req.user;
  
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  
  next();
};

/**
 * Middleware para verificar que el usuario es admin (super_admin o system_admin)
 */
export const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const user = req.user;
  
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!['super_admin', 'system_admin', 'store_admin', 'admin'].includes(user.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  next();
};

/**
 * Middleware para verificar acceso a tienda específica
 */
export const requireStoreAccess = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const user = req.user;
  const storeId = parseInt(req.params.storeId || req.body.storeId);
  
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Super admin puede acceder a cualquier tienda
  if (user.role === 'super_admin') {
    return next();
  }
  
  // Usuarios de tienda solo pueden acceder a su tienda
  if (user.storeId === storeId) {
    return next();
  }
  
  return res.status(403).json({ error: 'Access denied to this store' });
};

