import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(1, "Usuario requerido"),
  password: z.string().min(1, "Contraseña requerida"),
});

export type LoginRequest = z.infer<typeof loginSchema>;

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  role: string;
  status: string;
  phone?: string;
  email?: string;
  department?: string;
  storeId: number;
  storeName?: string;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}

/**
 * Tipos de autenticación para el sistema multi-tenant
 */

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  session?: any;
  sessionID?: string;
  files?: any;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      session?: any;
      sessionID?: string;
      files?: any;
    }
  }
}

// Definición de permisos por rol
export const rolePermissions = {
  admin: [
    'view_dashboard',
    'manage_users',
    'manage_orders',
    'manage_customers',
    'manage_products',
    'view_reports',
    'manage_settings',
    'view_conversations',
    'send_messages',
    'view_notifications',
    'manage_assignments',
    'manage_appointments',
    'manage_inventory_adjustments'
  ],
  technician: [
    'view_dashboard',
    'technician_work',
    'view_assigned_orders',
    'view_orders',
    'update_order_status',
    'view_customers',
    'view_conversations',
    'send_messages',
    'view_notifications',
    'update_profile'
  ],
  seller: [
    'view_dashboard',
    'manage_orders',
    'view_orders',
    'view_customers',
    'manage_customers',
    'add_customers',
    'view_products',
    'view_conversations',
    'send_messages',
    'view_notifications',
    'create_quotes'
  ],
  delivery: [
    'view_dashboard_delivery',
    'view_assigned_orders',
    'view_orders',
    'update_delivery_status',
    'view_customers',
    'view_conversations',
    'send_messages',
    'view_notifications',
    'update_location'
  ]
};

export function hasPermission(userRole: string, permission: string): boolean {
  const permissions = rolePermissions[userRole as keyof typeof rolePermissions];
  // console.log(permission, permissions)
  return permissions?.includes(permission) || false;
}

export function getRoleDisplayName(role: string): string {
  const roleNames = {
    admin: 'Administrador',
    technician: 'Técnico',
    seller: 'Vendedor',
    delivery: 'Repartidor',
    support: 'Soporte',
    customer_service: 'Atención al Cliente'
  };
  return roleNames[role as keyof typeof roleNames] || role;
}

export function getStatusDisplayName(status: string): string {
  const statusNames = {
    active: 'Activo',
    busy: 'Ocupado',
    break: 'En Descanso',
    offline: 'Desconectado'
  };
  return statusNames[status as keyof typeof statusNames] || status;
}