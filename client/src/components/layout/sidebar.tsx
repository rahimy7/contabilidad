import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useLocation } from "wouter";
import {
  // Íconos referenciados por `views.icon_name` (ver server/seed/views.ts).
  LayoutDashboard, BarChart3, Bell, ShoppingBasket, ShoppingCart, ClipboardList,
  Receipt, DollarSign, Users, UserPlus, ShoppingBag, Package, PackagePlus,
  BookOpen, Warehouse, ArrowRightLeft, Sliders, PackageSearch, FileSpreadsheet,
  Tags, Tag, Ruler, Scale, CreditCard, Wallet, Landmark, Boxes, Building,
  PiggyBank, Network, FileText, Banknote, CalendarDays, Stethoscope, HeartPulse,
  // `Map` se renombra: sin el alias sombrea al Map nativo de JavaScript.
  Wrench, Map as MapIcon, MapPin, ClipboardCheck, FileCheck2, Truck, MessageCircle,
  Bot, Zap, Smartphone, Building2, Shield, Store, Coins, Settings, Undo2,
  FileClock,
  // Nombres heredados: filas viejas de `views` pueden seguir usándolos.
  ChartLine, PackageCheck,
  // Cromo del propio sidebar.
  PanelLeftClose, PanelLeftOpen, X, Moon, Sun, Calculator, Home,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/use-theme";
import { WarehouseSwitcher } from "@/components/layout/warehouse-switcher";
import { CompanySwitcher } from "@/components/layout/company-switcher";

/**
 * Navegación de dos niveles: riel de módulos + panel del módulo activo.
 *
 * El acordeón anterior ponía las 10 secciones en una sola columna con scroll.
 * Con ~56 pantallas eso obliga a plegar un módulo para poder abrir otro, y a
 * buscar con la rueda del mouse lo que debería estar a un clic. Los ERP que
 * manejan este volumen —SAP, Odoo, Dynamics— convergen todos en lo mismo: los
 * módulos siempre visibles como íconos, y sólo el módulo en el que estás
 * parado despliega sus pantallas.
 *
 * La consecuencia práctica: cambiar de módulo es un clic en vez de dos, el
 * panel casi nunca necesita scroll (ningún módulo pasa de 12 pantallas), y la
 * pregunta "¿dónde estoy?" se contesta mirando qué ícono del riel está
 * encendido, sin leer nada.
 */

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

interface ActiveTrip {
  id: number;
  status: "active" | "processing" | "pending" | "completed";
  tripNumber: string;
  totalOrders: number;
  completedOrders: number;
}

/** Una fila de `views`, tal como la devuelve /api/roles/me/permissions. */
export interface ViewRow {
  id: number;
  route_path: string;
  label: string;
  icon_name: string;
  section: string | null;
  sort_order: number | null;
}

interface NavItem {
  href: string;
  icon: any;
  label: string;
  badge: number | string | null;
}

interface NavModule {
  key: string;
  label: string;
  /** Rótulo corto para el riel; el largo no cabe bajo un ícono de 64px. */
  short: string;
  icon: any;
  order: number;
  items: NavItem[];
}

/** Exportado: el header lo reusa para la paleta de búsqueda global. */
export const iconMap: Record<string, any> = {
  LayoutDashboard, BarChart3, Bell, ShoppingBasket, ShoppingCart, ClipboardList,
  Receipt, DollarSign, Users, UserPlus, ShoppingBag, Package, PackagePlus,
  BookOpen, Warehouse, ArrowRightLeft, Sliders, PackageSearch, FileSpreadsheet,
  Tags, Tag, Ruler, Scale, CreditCard, Wallet, Landmark, Boxes, Building,
  PiggyBank, Network, FileText, Banknote, CalendarDays, Stethoscope, HeartPulse,
  Wrench, Map: MapIcon, MapPin, ClipboardCheck, FileCheck2, Truck, MessageCircle,
  Bot, Zap, Smartphone, Building2, Shield, Store, Coins, Settings, Undo2,
  FileClock,
  ChartLine, PackageCheck,
};

/**
 * Metadatos de cada módulo. Una sección que llegue de la base sin estar aquí
 * igual se renderiza (con su clave como título) y se va al final: el catálogo
 * puede crecer sin tocar este archivo.
 */
const SECTION_META: Record<string, { label: string; short: string; icon: any }> = {
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

const COLLAPSED_KEY = "sidebar:collapsed";
const MODULE_KEY = "sidebar:module";

const readStored = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

export default function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [isMobile, setIsMobile] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => readStored(COLLAPSED_KEY, false));
  const [activeModule, setActiveModule] = useState<string | null>(() => readStored<string | null>(MODULE_KEY, null));

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1025);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed)), [collapsed]);
  useEffect(() => {
    if (activeModule) localStorage.setItem(MODULE_KEY, JSON.stringify(activeModule));
  }, [activeModule]);

  // En móvil el panel siempre se muestra: un riel de íconos solo no es
  // navegable con el dedo sin los rótulos.
  const panelHidden = collapsed && !isMobile;

  // ── Vistas permitidas (RBAC, servidas por la base) ────────────────────────
  const { data: dynamicViews = [], isLoading: viewsLoading } = useQuery<ViewRow[]>({
    queryKey: ["/api/roles/me/permissions"],
    queryFn: () => apiRequest("GET", "/api/roles/me/permissions"),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // ── Contadores para los badges ────────────────────────────────────────────
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

  const getBadgeForRoute = useCallback(
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

  // ── Agrupación ────────────────────────────────────────────────────────────
  // El orden lo manda `sort_order`, que viene en bandas por sección: ordenar por
  // él ordena los módulos entre sí y las pantallas dentro de cada uno.
  const modules: NavModule[] = useMemo(() => {
    const byKey = new Map<string, NavModule>();

    for (const v of dynamicViews) {
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
        };
        byKey.set(key, m);
      }
      m.order = Math.min(m.order, order);
      m.items.push({
        href: v.route_path,
        icon: iconMap[v.icon_name] || Package,
        label: v.label,
        badge: getBadgeForRoute(v.route_path),
      });
    }

    for (const m of byKey.values()) {
      m.items.sort((a, b) => a.label.localeCompare(b.label, "es"));
    }
    return [...byKey.values()].sort((a, b) => a.order - b.order);
  }, [dynamicViews, getBadgeForRoute]);

  const activeHref = location === "/" ? "/dashboard" : location;

  // El módulo que contiene la pantalla actual manda sobre lo que el usuario
  // haya dejado seleccionado: navegar a una pantalla siempre debe mostrar el
  // módulo al que pertenece, sin que nadie tenga que buscarlo.
  const moduleOfRoute = useMemo(
    () => modules.find((m) => m.items.some((i) => i.href === activeHref))?.key,
    [modules, activeHref],
  );
  useEffect(() => {
    if (moduleOfRoute) setActiveModule(moduleOfRoute);
  }, [moduleOfRoute]);

  const shownModule =
    modules.find((m) => m.key === (moduleOfRoute ?? activeModule)) ?? modules[0];

  const handleNavigate = () => {
    if (isMobile && onClose) onClose();
  };

  if (isMobile && !isOpen) return null;

  const totalViews = modules.reduce((n, m) => n + m.items.length, 0);

  return (
    <>
      {isMobile && isOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={onClose} />
      )}

      <div
        className={[
          // `dark` alcanza a los componentes shadcn de adentro (los selects de
          // empresa y almacén), que así resuelven sus tokens contra la paleta oscura.
          "dark flex h-full shrink-0 bg-[#0B1220]",
          isMobile ? "fixed left-0 top-0 z-50" : "relative",
        ].join(" ")}
      >
        {/* ── Riel de módulos ─────────────────────────────────────────────── */}
        <nav className="flex w-[68px] shrink-0 flex-col items-center border-r border-white/5 py-3">
          <div className="mb-3 flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-white">
            <img src="/image.png" alt="RVR" className="h-8 w-8 object-contain" />
          </div>

          <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto">
            {viewsLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-12 w-12 animate-pulse rounded-xl bg-white/5" />
                ))
              : modules.map((m) => (
                  <RailButton
                    key={m.key}
                    module={m}
                    isActive={shownModule?.key === m.key}
                    onSelect={() => {
                      // Si al usuario ya se le está mostrando este módulo y el
                      // panel está visible, mantener sólo la selección. Si el
                      // panel está oculto (colapsado) o el módulo no está activo,
                      // navegar al primer ítem para que el clic tenga efecto
                      // visible además de cambiar la sección.
                      setActiveModule(m.key);
                      const firstItem = m.items[0];
                      const navigateNeeded = panelHidden || shownModule?.key !== m.key;
                      if (navigateNeeded && firstItem && location !== firstItem.href) {
                        navigate(firstItem.href);
                        if (isMobile && onClose) onClose();
                      }
                    }}
                  />
                ))}
          </div>

          <button
            onClick={toggleTheme}
            className="mt-2 flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200"
            title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
          >
            {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </button>

          {!isMobile && (
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="mt-1 flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200"
              title={panelHidden ? "Mostrar panel" : "Ocultar panel"}
            >
              {panelHidden ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          )}
        </nav>

        {/* ── Panel del módulo activo ─────────────────────────────────────── */}
        {!panelHidden && (
          <div className="flex w-[228px] flex-col">
            <div className="flex h-[52px] shrink-0 items-center gap-2 px-4">
              <span className="flex-1 truncate text-[15px] font-semibold tracking-tight text-white">
                {shownModule?.label ?? "RVR Accounting"}
              </span>
              {isMobile && (
                <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 shrink-0 text-slate-400">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Contexto: empresa y almacén activos. En un ERP multiempresa es lo
                primero que hay que poder ver y cambiar. */}
            <div className="space-y-2 px-3 pb-3">
              <CompanySwitcher />
              <WarehouseSwitcher />
            </div>

            <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
              {viewsLoading ? (
                <div className="space-y-1.5">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="h-9 animate-pulse rounded-lg bg-white/5" />
                  ))}
                </div>
              ) : totalViews === 0 ? (
                <div className="flex flex-col items-center px-2 py-10 text-center">
                  <Shield className="mb-3 h-10 w-10 text-slate-700" />
                  <p className="text-sm text-slate-400">No tienes vistas asignadas</p>
                  <p className="mt-1 text-xs text-slate-600">Contacta al administrador</p>
                </div>
              ) : (
                shownModule?.items.map((item) => (
                  <PanelRow
                    key={item.href}
                    item={item}
                    isActive={activeHref === item.href}
                    onNavigate={handleNavigate}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Un módulo en el riel. El badge se acumula desde sus pantallas: con el panel
 * cerrado, es la única señal de que algo dentro pide atención.
 */
function RailButton({
  module,
  isActive,
  onSelect,
}: {
  module: NavModule;
  isActive: boolean;
  onSelect: () => void;
}) {
  const Icon = module.icon;
  const badge = module.items.reduce<number>(
    (n, i) => n + (typeof i.badge === "number" ? i.badge : 0),
    0,
  );
  const hasDot = module.items.some((i) => i.badge === "●");

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <button
          onClick={onSelect}
          className={[
            "relative flex h-[52px] w-[52px] flex-col items-center justify-center gap-0.5 rounded-xl transition-colors",
            isActive
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/25"
              : "text-slate-400 hover:bg-white/5 hover:text-white",
          ].join(" ")}
        >
          <Icon className="h-[18px] w-[18px]" />
          <span className="max-w-full truncate px-1 text-[9px] font-medium leading-none tracking-tight">
            {module.short}
          </span>
          {badge > 0 && (
            <span className="absolute right-1 top-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold tabular-nums text-white ring-2 ring-[#0B1220]">
              {badge > 99 ? "99" : badge}
            </span>
          )}
          {badge === 0 && hasDot && (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-[#0B1220]" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{module.label}</TooltipContent>
    </Tooltip>
  );
}

/** Una pantalla dentro del módulo activo. */
function PanelRow({
  item,
  isActive,
  onNavigate,
}: {
  item: NavItem;
  isActive: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={[
        "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors",
        isActive
          ? "bg-white/10 font-medium text-white"
          : "text-slate-400 hover:bg-white/5 hover:text-white",
      ].join(" ")}
    >
      <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-indigo-400" : "text-slate-500"}`} />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge != null && (
        <span
          className={[
            "flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums",
            item.badge === "●" ? "bg-emerald-500 text-white" : "bg-rose-500 text-white",
          ].join(" ")}
        >
          {item.badge === "●" ? "" : item.badge}
        </span>
      )}
    </Link>
  );
}
