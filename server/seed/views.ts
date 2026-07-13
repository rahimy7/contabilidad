import type { Pool } from "@neondatabase/serverless";

/**
 * The sidebar catalog — every navigable page in the app.
 *
 * The sidebar is database-driven: a page appears only if a row exists in `views`
 * and the user's role is granted it. `views` is a global catalog (no company_id),
 * so this runs once, keyed on the unique `route_path`.
 *
 * This file is the single source of truth for the menu. A page that isn't listed
 * here is invisible no matter what `App.tsx` routes — that is exactly how the
 * operational pages (POS, orders, inventory…) went missing when the accounting
 * fork started on a blank database and only the accounting rows were seeded.
 *
 * `sortOrder` is a global integer, not a per-section one: each section owns a
 * band (100s, 200s, …) so a single ORDER BY sorts both the sections and the items
 * inside them. Leave gaps — inserting a page later shouldn't renumber the file.
 *
 * Deliberately NOT here: public pages (login, catálogo público, share-product),
 * sub-flows reached from another page (`/add-product`'s sibling
 * `/receive-purchase-order/:id`) and `/user-settings` (it hangs off the profile
 * menu, not the nav).
 */
export interface ViewSeed {
  routePath: string;
  label: string;
  /** A lucide-react icon name. Must also exist in the sidebar's iconMap to render. */
  iconName: string;
  permission: string;
  section: SectionKey;
  sortOrder: number;
}

export type SectionKey =
  | "principal"
  | "ventas"
  | "compras"
  | "inventario"
  | "contabilidad"
  | "fiscal"
  | "rrhh"
  | "operaciones"
  | "comunicacion"
  | "configuracion";

export const APP_VIEWS: ViewSeed[] = [
  // ── Principal ──────────────────────────────────────────────────────────────
  { routePath: "/dashboard", label: "Dashboard", iconName: "LayoutDashboard", permission: "view_dashboard", section: "principal", sortOrder: 100 },
  { routePath: "/reports", label: "Reportes", iconName: "BarChart3", permission: "view_reports", section: "principal", sortOrder: 110 },
  { routePath: "/notifications", label: "Notificaciones", iconName: "Bell", permission: "view_notifications", section: "principal", sortOrder: 120 },

  // ── Ventas ─────────────────────────────────────────────────────────────────
  { routePath: "/pos", label: "Punto de Venta", iconName: "ShoppingBasket", permission: "manage_orders", section: "ventas", sortOrder: 200 },
  { routePath: "/orders", label: "Pedidos", iconName: "ShoppingCart", permission: "manage_orders", section: "ventas", sortOrder: 210 },
  { routePath: "/order-management", label: "Gestión de Pedidos", iconName: "ClipboardList", permission: "manage_orders", section: "ventas", sortOrder: 220 },
  { routePath: "/sales-history", label: "Historial de Ventas", iconName: "Receipt", permission: "manage_orders", section: "ventas", sortOrder: 230 },
  { routePath: "/cash-register", label: "Caja", iconName: "DollarSign", permission: "manage_cash_register", section: "ventas", sortOrder: 240 },
  { routePath: "/customers", label: "Clientes", iconName: "Users", permission: "manage_customers", section: "ventas", sortOrder: 250 },
  { routePath: "/customer-management", label: "Gestión de Clientes", iconName: "UserPlus", permission: "manage_customers", section: "ventas", sortOrder: 260 },

  // ── Compras ────────────────────────────────────────────────────────────────
  { routePath: "/purchase-management", label: "Órdenes de Compra", iconName: "ShoppingBag", permission: "manage_products", section: "compras", sortOrder: 300 },

  // ── Inventario ─────────────────────────────────────────────────────────────
  { routePath: "/product-management", label: "Productos", iconName: "Package", permission: "manage_products", section: "inventario", sortOrder: 400 },
  { routePath: "/add-product", label: "Nuevo Producto", iconName: "PackagePlus", permission: "manage_products", section: "inventario", sortOrder: 410 },
  { routePath: "/catalog", label: "Catálogo", iconName: "BookOpen", permission: "manage_products", section: "inventario", sortOrder: 420 },
  { routePath: "/warehouses", label: "Almacenes", iconName: "Warehouse", permission: "manage_products", section: "inventario", sortOrder: 430 },
  { routePath: "/warehouse-transfers", label: "Transferencias", iconName: "ArrowRightLeft", permission: "manage_products", section: "inventario", sortOrder: 440 },
  { routePath: "/inventory-adjustment", label: "Ajustes de Inventario", iconName: "Sliders", permission: "manage_inventory_adjustments", section: "inventario", sortOrder: 450 },
  { routePath: "/inventory-traceability", label: "Trazabilidad", iconName: "PackageSearch", permission: "manage_products", section: "inventario", sortOrder: 460 },
  { routePath: "/warehouse-reports", label: "Reportes de Almacén", iconName: "FileSpreadsheet", permission: "view_reports", section: "inventario", sortOrder: 470 },
  { routePath: "/admin/categories-brands", label: "Categorías", iconName: "Tags", permission: "manage_products", section: "inventario", sortOrder: 480 },
  { routePath: "/admin/brands", label: "Marcas", iconName: "Tag", permission: "manage_products", section: "inventario", sortOrder: 490 },
  { routePath: "/admin/measurement-units", label: "Unidades de Medida", iconName: "Ruler", permission: "manage_products", section: "inventario", sortOrder: 495 },

  // ── Contabilidad ───────────────────────────────────────────────────────────
  { routePath: "/accounting/accounts", label: "Plan de Cuentas", iconName: "ClipboardList", permission: "manage_accounting", section: "contabilidad", sortOrder: 500 },
  { routePath: "/accounting/trial-balance", label: "Balance de Comprobación", iconName: "Scale", permission: "view_financial_reports", section: "contabilidad", sortOrder: 510 },
  { routePath: "/accounting/financial-statements", label: "Estados Financieros", iconName: "BarChart3", permission: "view_financial_reports", section: "contabilidad", sortOrder: 520 },
  { routePath: "/receivables", label: "Cuentas por Cobrar", iconName: "CreditCard", permission: "manage_accounting", section: "contabilidad", sortOrder: 530 },
  { routePath: "/payables", label: "Cuentas por Pagar", iconName: "Wallet", permission: "manage_accounting", section: "contabilidad", sortOrder: 540 },
  { routePath: "/treasury", label: "Tesorería", iconName: "Landmark", permission: "manage_accounting", section: "contabilidad", sortOrder: 550 },
  { routePath: "/inventory-costing", label: "Costeo de Inventario", iconName: "Boxes", permission: "manage_accounting", section: "contabilidad", sortOrder: 560 },
  { routePath: "/fixed-assets", label: "Activos Fijos", iconName: "Building", permission: "manage_accounting", section: "contabilidad", sortOrder: 570 },
  { routePath: "/budget", label: "Presupuesto", iconName: "PiggyBank", permission: "manage_accounting", section: "contabilidad", sortOrder: 580 },
  { routePath: "/consolidation", label: "Consolidación", iconName: "Network", permission: "view_financial_reports", section: "contabilidad", sortOrder: 590 },

  // ── Fiscal (DGII) ──────────────────────────────────────────────────────────
  { routePath: "/fiscal/documents", label: "Comprobantes (NCF)", iconName: "Receipt", permission: "manage_invoicing", section: "fiscal", sortOrder: 600 },
  { routePath: "/fiscal/reports", label: "Reportes DGII", iconName: "FileText", permission: "view_fiscal_reports", section: "fiscal", sortOrder: 610 },

  // ── Recursos Humanos ───────────────────────────────────────────────────────
  { routePath: "/payroll", label: "Nómina", iconName: "Banknote", permission: "manage_accounting", section: "rrhh", sortOrder: 700 },
  { routePath: "/employees", label: "Empleados", iconName: "Users", permission: "manage_users", section: "rrhh", sortOrder: 710 },

  // ── Operaciones ────────────────────────────────────────────────────────────
  { routePath: "/appointments", label: "Citas", iconName: "CalendarDays", permission: "manage_appointments", section: "operaciones", sortOrder: 800 },
  { routePath: "/appointment-services", label: "Servicios", iconName: "Stethoscope", permission: "manage_appointments", section: "operaciones", sortOrder: 810 },
  { routePath: "/doctor-dashboard", label: "Panel Médico", iconName: "HeartPulse", permission: "manage_appointments", section: "operaciones", sortOrder: 820 },
  { routePath: "/technician-dashboard", label: "Panel Técnico", iconName: "Wrench", permission: "technician_work", section: "operaciones", sortOrder: 830 },
  { routePath: "/trips", label: "Viajes", iconName: "Map", permission: "manage_orders", section: "operaciones", sortOrder: 840 },
  { routePath: "/delivery-dashboard", label: "Panel de Reparto", iconName: "Truck", permission: "view_dashboard_delivery", section: "operaciones", sortOrder: 850 },

  // ── Comunicación (WhatsApp) ────────────────────────────────────────────────
  { routePath: "/conversations", label: "Conversaciones", iconName: "MessageCircle", permission: "view_conversations", section: "comunicacion", sortOrder: 900 },
  { routePath: "/auto-responses", label: "Respuestas Automáticas", iconName: "Bot", permission: "manage_settings", section: "comunicacion", sortOrder: 910 },
  { routePath: "/assignment-rules", label: "Reglas de Asignación", iconName: "Zap", permission: "manage_assignments", section: "comunicacion", sortOrder: 920 },
  { routePath: "/whatsapp-settings", label: "Configuración WhatsApp", iconName: "Smartphone", permission: "manage_settings", section: "comunicacion", sortOrder: 930 },

  // ── Configuración ──────────────────────────────────────────────────────────
  { routePath: "/companies", label: "Empresas", iconName: "Building2", permission: "manage_settings", section: "configuracion", sortOrder: 1000 },
  { routePath: "/team", label: "Usuarios y Roles", iconName: "Shield", permission: "manage_users", section: "configuracion", sortOrder: 1010 },
  { routePath: "/store-settings", label: "Configuración de Tienda", iconName: "Store", permission: "manage_settings", section: "configuracion", sortOrder: 1020 },
  { routePath: "/exchange-rates", label: "Tasas de Cambio", iconName: "Coins", permission: "manage_settings", section: "configuracion", sortOrder: 1030 },
  { routePath: "/billing", label: "Facturación SaaS", iconName: "CreditCard", permission: "manage_settings", section: "configuracion", sortOrder: 1040 },
  { routePath: "/settings", label: "Configuración", iconName: "Settings", permission: "manage_settings", section: "configuracion", sortOrder: 1050 },
];

/** Kept as a named export for the accounting-only subset (used by docs/tests). */
export const ACCOUNTING_VIEWS = APP_VIEWS.filter(
  (v) => v.section === "contabilidad" || v.section === "fiscal",
);

/**
 * Upserts the catalog.
 *
 * `DO UPDATE` rather than `DO NOTHING`: the label, icon, section and order are
 * presentation, owned by this file, and a row seeded by an older build must be
 * corrected in place — the 14 accounting rows already in the database predate
 * sections and would otherwise keep sorting by their insertion id forever.
 * `permission_required` is also owned here; an admin who re-points a view at a
 * different permission would be overwritten, which is the intended trade: the
 * catalog is code, the *grants* (role_permissions) are data.
 *
 * Returns how many rows were newly inserted, so a second run reports 0.
 */
export async function seedViews(pool: Pool): Promise<{ inserted: number; total: number }> {
  let inserted = 0;
  for (const v of APP_VIEWS) {
    const r = await pool.query<{ is_new: boolean }>(
      `INSERT INTO views (route_path, label, icon_name, permission_required, section, sort_order, is_system)
       VALUES ($1,$2,$3,$4,$5,$6,true)
       ON CONFLICT (route_path) DO UPDATE
         SET label = EXCLUDED.label,
             icon_name = EXCLUDED.icon_name,
             permission_required = EXCLUDED.permission_required,
             section = EXCLUDED.section,
             sort_order = EXCLUDED.sort_order,
             updated_at = now()
       RETURNING (xmax = 0) AS is_new`,
      [v.routePath, v.label, v.iconName, v.permission, v.section, v.sortOrder],
    );
    if (r.rows[0]?.is_new) inserted++;
  }
  return { inserted, total: APP_VIEWS.length };
}
