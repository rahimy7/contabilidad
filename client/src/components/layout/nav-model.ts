/**
 * Modelo de navegación — fuente única para la barra superior, el drawer móvil
 * y la paleta de búsqueda (⌘K).
 *
 * El catálogo sigue viniendo de la base (`views` + RBAC), igual que antes: este
 * archivo no decide qué ve el usuario, sólo cómo se agrupa y se rotula. Lo que
 * aporta encima del catálogo son dos cosas que la base no tiene y que son
 * presentación pura:
 *
 *   · MODULE_GROUPS — subtítulos dentro del desplegable de cada módulo. Con 14
 *     pantallas en Ventas, una lista plana obliga a leerla entera; agrupada en
 *     "Operación diaria / Clientes y precios / Marketing" se encuentra de un
 *     vistazo.
 *   · QUICK_LINKS — las pantallas que van en la franja de accesos directos.
 *
 * Las dos degradan bien: una ruta que no esté listada aparece igual, al final,
 * bajo "Más". Agregar una pantalla al catálogo nunca la esconde.
 */

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, BarChart3, Bell, ShoppingBasket, ShoppingCart, ClipboardList,
  Receipt, DollarSign, Users, UserPlus, ShoppingBag, Package, PackagePlus,
  BookOpen, Warehouse, ArrowRightLeft, Sliders, PackageSearch, FileSpreadsheet,
  Tags, Tag, Ruler, Scale, CreditCard, Wallet, Landmark, Boxes, Building,
  PiggyBank, Network, FileText, Banknote, CalendarDays, Stethoscope, HeartPulse,
  Wrench, Map as MapIcon, MapPin, ClipboardCheck, FileCheck2, Truck, MessageCircle,
  Bot, Zap, Smartphone, Building2, Shield, ShieldCheck, Store, Coins, Settings, Undo2,
  FileClock, ChartLine, PackageCheck, Calculator, Home,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";

/** Una fila de `views`, tal como la devuelve /api/roles/me/permissions. */
export interface ViewRow {
  id: number;
  route_path: string;
  label: string;
  icon_name: string;
  section: string | null;
  sort_order: number | null;
}

export interface NavItem {
  href: string;
  icon: any;
  label: string;
  badge: number | string | null;
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

export interface NavModule {
  key: string;
  label: string;
  /** Rótulo corto para el riel móvil. */
  short: string;
  icon: any;
  order: number;
  items: NavItem[];
  groups: NavGroup[];
}

export const iconMap: Record<string, any> = {
  LayoutDashboard, BarChart3, Bell, ShoppingBasket, ShoppingCart, ClipboardList,
  Receipt, DollarSign, Users, UserPlus, ShoppingBag, Package, PackagePlus,
  BookOpen, Warehouse, ArrowRightLeft, Sliders, PackageSearch, FileSpreadsheet,
  Tags, Tag, Ruler, Scale, CreditCard, Wallet, Landmark, Boxes, Building,
  PiggyBank, Network, FileText, Banknote, CalendarDays, Stethoscope, HeartPulse,
  Wrench, Map: MapIcon, MapPin, ClipboardCheck, FileCheck2, Truck, MessageCircle,
  Bot, Zap, Smartphone, Building2, Shield, ShieldCheck, Store, Coins, Settings, Undo2,
  FileClock, ChartLine, PackageCheck,
};

export const SECTION_META: Record<string, { label: string; short: string; icon: any }> = {
  principal: { label: "Principal", short: "Inicio", icon: Home },
  ventas: { label: "Ventas", short: "Ventas", icon: ShoppingCart },
  compras: { label: "Compras", short: "Compras", icon: ShoppingBag },
  inventario: { label: "Inventario", short: "Inventario", icon: Boxes },
  contabilidad: { label: "Contabilidad", short: "Contab.", icon: Calculator },
  fiscal: { label: "Fiscal · DGII", short: "Fiscal", icon: Receipt },
  rrhh: { label: "Nómina y RRHH", short: "RRHH", icon: Users },
  operaciones: { label: "Operaciones", short: "Oper.", icon: Wrench },
  comunicacion: { label: "Comunicación", short: "Chat", icon: MessageCircle },
  configuracion: { label: "Configuración", short: "Ajustes", icon: Settings },
};

/**
 * Módulos que NO son un desplegable de la barra:
 *  · principal — se llega por el nombre de la empresa y por "Todos los reportes".
 *  · configuracion — vive detrás del engranaje, como en Business Central.
 */
export const CHROME_SECTIONS = ["principal", "configuracion"];

/** Orden de los desplegables. Sigue el flujo del negocio, no el alfabeto. */
export const MODULE_ORDER = [
  "ventas", "compras", "inventario", "contabilidad",
  "fiscal", "rrhh", "operaciones", "comunicacion",
];

export const MODULE_GROUPS: Record<string, { label: string; routes: string[] }[]> = {
  ventas: [
    { label: "Operación diaria", routes: ["/pos", "/cash-register", "/invoicing", "/orders", "/order-management", "/sales-returns"] },
    { label: "Clientes y precios", routes: ["/customers", "/customer-management", "/price-lists", "/promotions"] },
    { label: "Marketing y análisis", routes: ["/marketing/leads", "/marketing/campaigns", "/marketing/segments", "/sales-history"] },
  ],
  compras: [
    { label: "Compras", routes: ["/purchase-management", "/landed-costs", "/purchase-returns"] },
  ],
  inventario: [
    { label: "Artículos", routes: ["/product-management", "/add-product", "/catalog", "/admin/categories-brands", "/admin/brands", "/admin/measurement-units"] },
    { label: "Almacén", routes: ["/warehouses", "/warehouse-locations", "/warehouse-transfers", "/inventory-adjustment", "/inventory-count", "/manufacturing"] },
    { label: "Control", routes: ["/inventory-traceability", "/warehouse-reports", "/replenishment"] },
  ],
  contabilidad: [
    { label: "Libro mayor", routes: ["/accounting/accounts", "/accounting/trial-balance", "/accounting/financial-statements", "/budget", "/consolidation"] },
    { label: "Cartera y tesorería", routes: ["/receivables", "/payables", "/treasury", "/cash-flow", "/bank-reconciliation"] },
    { label: "Activos y costos", routes: ["/fixed-assets", "/inventory-costing", "/fx-revaluation"] },
  ],
  fiscal: [
    { label: "DGII", routes: ["/fiscal/documents", "/fiscal/reports", "/fiscal/ecf"] },
  ],
  rrhh: [
    { label: "Nómina", routes: ["/payroll", "/hr/employees", "/hr/tss", "/commissions"] },
  ],
  operaciones: [
    { label: "Servicio", routes: ["/appointments", "/appointment-services", "/doctor-dashboard", "/technician-dashboard"] },
    { label: "Reparto", routes: ["/trips", "/delivery-dashboard", "/picking"] },
  ],
  comunicacion: [
    { label: "Mensajería", routes: ["/conversations", "/auto-responses", "/assignment-rules", "/whatsapp-settings"] },
  ],
  configuracion: [
    { label: "Empresa", routes: ["/companies", "/store-settings", "/exchange-rates", "/settings"] },
    { label: "Personas y accesos", routes: ["/team", "/employees", "/security-2fa", "/api-keys"] },
    { label: "Plataforma", routes: ["/billing", "/audit-log"] },
  ],
};

/**
 * Franja de accesos directos: lo que se abre todos los días dentro del módulo.
 * Si ninguna de estas rutas está permitida, se cae a las primeras del módulo.
 */
export const QUICK_LINKS: Record<string, string[]> = {
  principal: ["/dashboard", "/executive-dashboard", "/reports", "/approvals", "/alerts"],
  ventas: ["/invoicing", "/pos", "/orders", "/customers", "/receivables", "/fiscal/documents"],
  compras: ["/purchase-management", "/payables", "/landed-costs"],
  inventario: ["/product-management", "/warehouses", "/inventory-adjustment", "/inventory-count", "/warehouse-transfers"],
  contabilidad: ["/accounting/accounts", "/accounting/trial-balance", "/accounting/financial-statements", "/receivables", "/payables", "/treasury"],
  fiscal: ["/fiscal/documents", "/fiscal/reports", "/fiscal/ecf"],
  rrhh: ["/payroll", "/hr/employees", "/hr/tss", "/commissions"],
  operaciones: ["/appointments", "/trips", "/delivery-dashboard"],
  comunicacion: ["/conversations", "/auto-responses", "/whatsapp-settings"],
  configuracion: ["/companies", "/team", "/settings", "/exchange-rates"],
};

/** El catálogo de vistas permitidas. Una sola entrada de caché para toda la app. */
export function useNavViews() {
  const { user } = useAuth();
  return useQuery<ViewRow[]>({
    queryKey: ["/api/roles/me/permissions"],
    queryFn: () => apiRequest("GET", "/api/roles/me/permissions"),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

interface ActiveTrip {
  id: number;
  status: "active" | "processing" | "pending" | "completed";
}

/** Contadores que se pintan sobre las rutas que los tienen. */
export function useRouteBadges() {
  const { user } = useAuth();

  const { data: orders = [] } = useQuery({ queryKey: ["/api/orders"], enabled: !!user });
  const { data: conversations = [] } = useQuery({ queryKey: ["/api/conversations"], enabled: !!user });
  const { data: notificationCounts } = useQuery({
    queryKey: ["/api/notifications/count", { userId: user?.id }],
    queryFn: () => apiRequest("GET", `/api/notifications/count?userId=${user?.id}`),
    refetchInterval: 30000,
    enabled: !!user,
  });
  const { data: activeTrip } = useQuery<ActiveTrip | null>({
    queryKey: ["/api/trips/my-active"],
    enabled: !!user && user?.role === "delivery",
    refetchInterval: 30000,
  });
  const { data: tripStats } = useQuery({
    queryKey: ["/api/trips", { status: "pending" }],
    enabled: !!user && (user?.role === "admin" || user?.role === "sales_rep"),
    refetchInterval: 30000,
  });

  const pendingOrders = Array.isArray(orders) ? orders.filter((o: any) => o.status === "pending").length : 0;
  const activeConversations = Array.isArray(conversations) ? conversations.filter((c: any) => c.unreadCount > 0).length : 0;
  const unreadNotifications = typeof (notificationCounts as any)?.unread === "number" ? (notificationCounts as any).unread : 0;
  const pendingTrips = Array.isArray(tripStats) ? tripStats.filter((t: any) => t.status === "pending").length : 0;
  const hasActiveTrip = activeTrip?.status === "active" || activeTrip?.status === "processing";

  const badgeForRoute = useCallback(
    (routePath: string): number | string | null => {
      switch (routePath) {
        case "/conversations": return activeConversations || null;
        case "/notifications": return unreadNotifications || null;
        case "/orders": return pendingOrders || null;
        case "/trips": return pendingTrips || null;
        case "/delivery-dashboard": return hasActiveTrip ? "●" : null;
        default: return null;
      }
    },
    [activeConversations, unreadNotifications, pendingOrders, pendingTrips, hasActiveTrip],
  );

  return { badgeForRoute, unreadNotifications, activeConversations };
}

/** Suma de los contadores numéricos de un módulo. */
export function moduleBadgeCount(m: NavModule): number {
  return m.items.reduce<number>((n, i) => n + (typeof i.badge === "number" ? i.badge : 0), 0);
}

/**
 * El catálogo convertido en módulos con sus grupos.
 *
 * Nada se filtra aquí: si una sección llega de la base sin metadatos, se
 * renderiza con su clave como rótulo y se va al final. El catálogo puede crecer
 * sin tocar este archivo.
 */
export function useNavModules() {
  const { data: views = [], isLoading } = useNavViews();
  const { badgeForRoute } = useRouteBadges();

  const modules = useMemo<NavModule[]>(() => {
    const byKey = new Map<string, NavModule>();

    for (const v of views) {
      const key = v.section || "otros";
      const order = v.sort_order ?? Number.MAX_SAFE_INTEGER;
      let m = byKey.get(key);
      if (!m) {
        const meta = SECTION_META[key];
        const fallback = key.charAt(0).toUpperCase() + key.slice(1);
        m = {
          key,
          label: meta?.label ?? fallback,
          short: meta?.short ?? fallback.slice(0, 8),
          icon: meta?.icon ?? Package,
          order,
          items: [],
          groups: [],
        };
        byKey.set(key, m);
      }
      m.order = Math.min(m.order, order);
      m.items.push({
        href: v.route_path,
        icon: iconMap[v.icon_name] || Package,
        label: v.label,
        badge: badgeForRoute(v.route_path),
      });
    }

    for (const m of byKey.values()) {
      m.items.sort((a, b) => a.label.localeCompare(b.label, "es"));
      m.groups = buildGroups(m);
    }

    return [...byKey.values()].sort((a, b) => {
      const ai = MODULE_ORDER.indexOf(a.key);
      const bi = MODULE_ORDER.indexOf(b.key);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.order - b.order;
    });
  }, [views, badgeForRoute]);

  return { modules, views, isLoading };
}

function buildGroups(m: NavModule): NavGroup[] {
  const spec = MODULE_GROUPS[m.key];
  if (!spec) return [{ label: null, items: m.items }];

  const used = new Set<string>();
  const groups: NavGroup[] = [];

  for (const g of spec) {
    // El orden dentro del grupo es el de MODULE_GROUPS, no el alfabético: en
    // "Operación diaria" importa que POS y Facturación vayan primero.
    const items = g.routes
      .map((r) => m.items.find((i) => i.href === r))
      .filter((i): i is NavItem => !!i);
    items.forEach((i) => used.add(i.href));
    if (items.length) groups.push({ label: g.label, items });
  }

  const rest = m.items.filter((i) => !used.has(i.href));
  if (rest.length) groups.push({ label: groups.length ? "Más" : null, items: rest });

  return groups;
}

/** Las pantallas de la franja de accesos directos del módulo activo. */
export function quickLinksFor(m: NavModule | undefined): NavItem[] {
  if (!m) return [];
  const preferred = (QUICK_LINKS[m.key] ?? [])
    .map((r) => m.items.find((i) => i.href === r))
    .filter((i): i is NavItem => !!i);
  return preferred.length ? preferred : m.items.slice(0, 6);
}
