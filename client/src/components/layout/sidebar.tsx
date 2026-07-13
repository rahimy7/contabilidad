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
  Wrench, Map as MapIcon, Truck, MessageCircle, Bot, Zap, Smartphone, Building2,
  Shield, Store, Coins, Settings,
  // Nombres heredados: filas viejas de `views` pueden seguir usándolos.
  ChartLine, PackageCheck,
  // Cromo del propio sidebar.
  ChevronRight, PanelLeftClose, PanelLeftOpen, X, Moon, Sun, Calculator,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/use-theme";
import { WarehouseSwitcher } from "@/components/layout/warehouse-switcher";
import { CompanySwitcher } from "@/components/layout/company-switcher";

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

interface NavGroup {
  key: string;
  label: string;
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
  Wrench, Map: MapIcon, Truck, MessageCircle, Bot, Zap, Smartphone, Building2,
  Shield, Store, Coins, Settings, ChartLine, PackageCheck,
};

/**
 * Cada sección de `views` es un grupo plegable del menú, con su propio ícono.
 * Una sección que llegue de la base sin estar aquí igual se renderiza (con su
 * clave como título y un ícono genérico) y se va al final: el catálogo puede
 * crecer sin tocar este archivo.
 */
const SECTION_META: Record<string, { label: string; icon: any }> = {
  principal: { label: "Principal", icon: LayoutDashboard },
  ventas: { label: "Ventas", icon: ShoppingCart },
  compras: { label: "Compras", icon: ShoppingBag },
  inventario: { label: "Inventario", icon: Boxes },
  contabilidad: { label: "Contabilidad", icon: Calculator },
  fiscal: { label: "Fiscal · DGII", icon: Receipt },
  rrhh: { label: "Nómina y RRHH", icon: Users },
  operaciones: { label: "Operaciones", icon: Wrench },
  comunicacion: { label: "Comunicación", icon: MessageCircle },
  configuracion: { label: "Configuración", icon: Settings },
};

/** La sección `principal` se muestra como enlaces sueltos arriba, sin plegar. */
const FLAT_SECTION = "principal";

const COLLAPSED_KEY = "sidebar:collapsed";
const OPEN_GROUPS_KEY = "sidebar:open-groups";

const readStored = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

export default function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [isMobile, setIsMobile] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => readStored(COLLAPSED_KEY, false));
  const [openGroups, setOpenGroups] = useState<string[]>(() => readStored<string[]>(OPEN_GROUPS_KEY, ["contabilidad"]));

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1025);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed)), [collapsed]);
  useEffect(() => localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(openGroups)), [openGroups]);

  // En móvil el riel de íconos no aplica: el menú es un panel completo.
  const isRail = collapsed && !isMobile;

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
  // él ordena los grupos entre sí y los ítems dentro de cada uno.
  const groups: NavGroup[] = useMemo(() => {
    const byKey = new Map<string, NavGroup>();

    for (const v of dynamicViews) {
      const key = v.section || "otros";
      const order = v.sort_order ?? Number.MAX_SAFE_INTEGER;
      let g = byKey.get(key);
      if (!g) {
        const meta = SECTION_META[key];
        g = {
          key,
          label: meta?.label ?? key.charAt(0).toUpperCase() + key.slice(1),
          icon: meta?.icon ?? Package,
          order,
          items: [],
        };
        byKey.set(key, g);
      }
      g.order = Math.min(g.order, order);
      g.items.push({
        href: v.route_path,
        icon: iconMap[v.icon_name] || Package,
        label: v.label,
        badge: getBadgeForRoute(v.route_path),
      });
    }

    return [...byKey.values()].sort((a, b) => a.order - b.order);
  }, [dynamicViews, getBadgeForRoute]);

  const flatItems = groups.find((g) => g.key === FLAT_SECTION)?.items ?? [];
  const treeGroups = groups.filter((g) => g.key !== FLAT_SECTION);

  const activeHref = location === "/" ? "/dashboard" : location;

  // El grupo que contiene la página actual se abre solo: nadie debería tener que
  // buscar dónde quedó lo que está viendo.
  const activeGroupKey = useMemo(
    () => treeGroups.find((g) => g.items.some((i) => i.href === activeHref))?.key,
    [treeGroups, activeHref],
  );
  useEffect(() => {
    if (activeGroupKey && !openGroups.includes(activeGroupKey)) {
      setOpenGroups((prev) => [...prev, activeGroupKey]);
    }
  }, [activeGroupKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const handleNavigate = () => {
    if (isMobile && onClose) onClose();
  };

  if (isMobile && !isOpen) return null;

  const totalViews = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <>
      {isMobile && isOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={[
          // `dark` alcanza a los componentes shadcn de adentro (los selects de
          // empresa y almacén), que así resuelven sus tokens contra la paleta oscura.
          "dark flex h-full flex-col bg-[#0B1220] text-slate-300",
          "transition-[width] duration-200 ease-out",
          isRail ? "w-[72px]" : "w-[264px]",
          isMobile ? "fixed left-0 top-0 z-50 w-[280px]" : "relative",
        ].join(" ")}
      >
        {/* Marca */}
        <div className="flex h-16 shrink-0 items-center gap-2.5 px-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
            <img src="/image.png" alt="" className="h-6 w-6 object-contain" />
          </div>
          {!isRail && (
            <span className="flex-1 truncate text-[17px] font-bold tracking-tight text-white">
              Metabella <span className="font-semibold text-indigo-400">ERP</span>
            </span>
          )}
          {isMobile ? (
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 shrink-0 text-slate-400">
              <X className="h-4 w-4" />
            </Button>
          ) : (
            !isRail && (
              <button
                onClick={() => setCollapsed(true)}
                className="shrink-0 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"
                title="Contraer menú"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            )
          )}
        </div>

        {isRail && !isMobile && (
          <button
            onClick={() => setCollapsed(false)}
            className="mx-auto mb-2 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"
            title="Expandir menú"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}

        {/* Contexto: empresa activa y almacén. En un ERP multiempresa es lo
            primero que hay que poder ver y cambiar. */}
        {!isRail && (
          <div className="space-y-2 px-3 pb-3">
            <CompanySwitcher />
            <WarehouseSwitcher />
          </div>
        )}

        {/* Navegación */}
        <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 pb-3">
          {viewsLoading ? (
            <div className="space-y-1.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-white/5" />
              ))}
            </div>
          ) : totalViews === 0 ? (
            <div className="flex flex-col items-center px-4 py-10 text-center">
              <Shield className="mb-3 h-10 w-10 text-slate-700" />
              <p className="text-sm text-slate-400">No tienes vistas asignadas</p>
              <p className="mt-1 text-xs text-slate-600">Contacta al administrador</p>
            </div>
          ) : (
            <>
              {/* Enlaces sueltos (Dashboard, Reportes, Notificaciones) */}
              {flatItems.map((item) => (
                <NavRow
                  key={item.href}
                  icon={item.icon}
                  label={item.label}
                  badge={item.badge}
                  href={item.href}
                  isActive={activeHref === item.href}
                  isRail={isRail}
                  onNavigate={handleNavigate}
                />
              ))}

              {/* Grupos plegables */}
              {treeGroups.map((group) => {
                const isOpen = openGroups.includes(group.key);
                const holdsActive = group.items.some((i) => i.href === activeHref);
                const groupBadge = group.items.reduce<number>(
                  (n, i) => n + (typeof i.badge === "number" ? i.badge : 0),
                  0,
                );

                // Contraído: el grupo se vuelve un ícono con tooltip que despliega
                // sus hijos al pasar el mouse — plegar dentro de un riel de 72px
                // no tendría dónde mostrarlos.
                if (isRail) {
                  return (
                    <RailGroup
                      key={group.key}
                      group={group}
                      activeHref={activeHref}
                      holdsActive={holdsActive}
                      onNavigate={handleNavigate}
                    />
                  );
                }

                const GroupIcon = group.icon;
                return (
                  <div key={group.key}>
                    <button
                      onClick={() => toggleGroup(group.key)}
                      className={[
                        "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[14px] transition-colors",
                        holdsActive && !isOpen
                          ? "bg-white/5 font-medium text-white"
                          : "text-slate-400 hover:bg-white/5 hover:text-white",
                      ].join(" ")}
                    >
                      <GroupIcon className="h-[18px] w-[18px] shrink-0" />
                      <span className="flex-1 truncate text-left">{group.label}</span>
                      {groupBadge > 0 && !isOpen && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold tabular-nums text-white">
                          {groupBadge}
                        </span>
                      )}
                      <ChevronRight
                        className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
                      />
                    </button>

                    {isOpen && (
                      // La guía vertical ata visualmente los hijos a su grupo.
                      <div className="ml-[22px] mt-0.5 space-y-0.5 border-l border-slate-800 pl-3">
                        {group.items.map((item) => (
                          <ChildRow
                            key={item.href}
                            item={item}
                            isActive={activeHref === item.href}
                            onNavigate={handleNavigate}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </nav>

        {/* Pie: tema */}
        <div className="shrink-0 p-3">
          <button
            onClick={toggleTheme}
            className={[
              "flex h-11 w-full items-center rounded-xl bg-white/5 text-[14px] text-slate-300 transition-colors hover:bg-white/10 hover:text-white",
              isRail ? "justify-center px-0" : "gap-3 px-3",
            ].join(" ")}
            title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
          >
            {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            {!isRail && <span>{theme === "dark" ? "Modo claro" : "Modo oscuro"}</span>}
          </button>
        </div>
      </aside>
    </>
  );
}

/** Enlace de primer nivel (con ícono), y también cada ítem del riel contraído. */
function NavRow({
  icon: Icon,
  label,
  badge,
  href,
  isActive,
  isRail,
  onNavigate,
}: {
  icon: any;
  label: string;
  badge: number | string | null;
  href: string;
  isActive: boolean;
  isRail: boolean;
  onNavigate: () => void;
}) {
  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      className={[
        "relative flex h-10 items-center rounded-lg text-[14px] transition-colors",
        isRail ? "w-full justify-center px-0" : "gap-3 px-3",
        isActive
          ? "bg-indigo-600 font-medium text-white shadow-lg shadow-indigo-600/20"
          : "text-slate-400 hover:bg-white/5 hover:text-white",
      ].join(" ")}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!isRail && <span className="flex-1 truncate">{label}</span>}
      {badge != null &&
        (isRail ? (
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-[#0B1220]" />
        ) : (
          <span
            className={[
              "flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums",
              badge === "●" ? "bg-emerald-500 text-white" : "bg-rose-500 text-white",
            ].join(" ")}
          >
            {badge}
          </span>
        ))}
    </Link>
  );

  if (!isRail) return link;

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

/** Hoja dentro de un grupo abierto: sin ícono, la sangría ya dice de quién cuelga. */
function ChildRow({
  item,
  isActive,
  onNavigate,
}: {
  item: NavItem;
  isActive: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={[
        "flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] transition-colors",
        isActive
          ? "bg-indigo-600 font-medium text-white shadow-lg shadow-indigo-600/20"
          : "text-slate-400 hover:bg-white/5 hover:text-white",
      ].join(" ")}
    >
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge != null && (
        <span
          className={[
            "flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums",
            item.badge === "●" ? "bg-emerald-500 text-white" : "bg-rose-500 text-white",
          ].join(" ")}
        >
          {item.badge}
        </span>
      )}
    </Link>
  );
}

/** Grupo en el riel contraído: ícono con tooltip que lista sus hijos. */
function RailGroup({
  group,
  activeHref,
  holdsActive,
  onNavigate,
}: {
  group: NavGroup;
  activeHref: string;
  holdsActive: boolean;
  onNavigate: () => void;
}) {
  const GroupIcon = group.icon;
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <button
          className={[
            "flex h-10 w-full items-center justify-center rounded-lg transition-colors",
            holdsActive ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white",
          ].join(" ")}
        >
          <GroupIcon className="h-[18px] w-[18px]" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="p-1.5">
        <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {group.label}
        </p>
        <div className="min-w-[180px] space-y-0.5">
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={[
                "block rounded px-2 py-1.5 text-[13px] transition-colors",
                activeHref === item.href
                  ? "bg-indigo-600 font-medium text-white"
                  : "hover:bg-accent",
              ].join(" ")}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
