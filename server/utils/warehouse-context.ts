/**
 * Utilidades para resolución del contexto de almacén por request.
 *
 * Patrón estándar en todas las rutas operativas:
 *   const warehouseId = resolveWarehouseId(req);
 *   // warehouseId puede ser null si el usuario tiene view_all_warehouses y no filtra
 */

import type { AuthUser } from '@shared/auth';

/**
 * Roles que siempre ven todos los almacenes aunque no tengan el permiso en RBAC.
 */
const ALWAYS_GLOBAL_ROLES = ['super_admin', 'admin'];

/**
 * Determina si el usuario autenticado puede ver todos los almacenes (vista corporativa).
 * Actualmente se basa en el rol; en el futuro puede consultar el permiso RBAC dinámico.
 */
export function canViewAllWarehouses(user: AuthUser): boolean {
  return ALWAYS_GLOBAL_ROLES.includes(user.role);
}

/**
 * Resuelve el warehouseId efectivo para la request.
 *
 * - Si el usuario NO puede ver todos los almacenes → devuelve su warehouseId (requerido).
 * - Si el usuario PUEDE ver todos los almacenes:
 *   - Si pasó `?warehouseId=N` en query → devuelve N (filtrado por sucursal).
 *   - Si no pasó → devuelve null (= corporativo, sin filtro por almacén).
 *
 * @throws Error si el usuario operativo no tiene warehouseId asignado.
 */
export function resolveWarehouseId(req: any): number | null {
  const user: AuthUser = req.user;

  if (canViewAllWarehouses(user)) {
    const qw = req.query?.warehouseId;
    if (qw) {
      const parsed = parseInt(String(qw), 10);
      return isNaN(parsed) ? null : parsed;
    }
    return null; // corporativo
  }

  // Usuario operativo: DEBE tener warehouseId
  if (!user.warehouseId) {
    throw new Error('Usuario sin almacén asignado. Contacte al administrador.');
  }
  return user.warehouseId;
}

/**
 * Construye la cláusula WHERE para filtrar por almacén.
 * Retorna { warehouseId } si aplica, o {} si es corporativo.
 */
export function buildWarehouseFilter(req: any): { warehouseId?: number } {
  const wid = resolveWarehouseId(req);
  return wid ? { warehouseId: wid } : {};
}
