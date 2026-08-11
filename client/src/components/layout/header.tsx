import { useEffect, useMemo, useState } from "react";
import {
  Plus, Bell, Menu, LogOut, User, Search, MessageCircle, Settings, ChevronDown,
  ChevronRight, Package, CalendarRange, FileText, ShoppingBag, PackagePlus, UserPlus,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import CreateOrderModal from "@/components/orders/create-order-modal";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { iconMap, type ViewRow } from "@/components/layout/sidebar";
import { Link } from "wouter";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface HeaderProps {
  onMenuClick?: () => void;
  showMenuButton?: boolean;
}

const SECTION_LABELS: Record<string, string> = {
  principal: "Principal",
  ventas: "Ventas",
  compras: "Compras",
  inventario: "Inventario",
  contabilidad: "Contabilidad",
  fiscal: "Fiscal · DGII",
  rrhh: "Nómina y RRHH",
  operaciones: "Operaciones",
  comunicacion: "Comunicación",
  configuracion: "Configuración",
};

/**
 * Lo que se crea a diario, con el permiso que cada cosa exige.
 *
 * El botón anterior sólo hacía pedidos. En un ERP la acción frecuente depende
 * del puesto: quien factura no crea órdenes de compra, y quien compra no abre
 * conteos. La lista se filtra por las vistas que el usuario ya tiene asignadas,
 * así que nadie ve un atajo que lo lleva a un 403.
 */
const QUICK_CREATE: { label: string; icon: any; route: string; requires: string }[] = [
  { label: "Factura", icon: FileText, route: "/invoicing", requires: "/invoicing" },
  { label: "Venta en caja", icon: Plus, route: "/pos", requires: "/pos" },
  { label: "Orden de compra", icon: ShoppingBag, route: "/purchase-management", requires: "/purchase-management" },
  { label: "Producto", icon: PackagePlus, route: "/add-product", requires: "/add-product" },
  { label: "Cliente", icon: UserPlus, route: "/customer-management", requires: "/customer-management" },
];

export default function Header({ onMenuClick, showMenuButton = false }: HeaderProps) {
  const [isCreateOrderModalOpen, setIsCreateOrderModalOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();

  // El mismo caché que alimenta el sidebar: tanto el título de la página como la
  // búsqueda global salen del catálogo de vistas, así que una página nueva
  // aparece en ambos sin tocar este archivo.
  const { data: views = [] } = useQuery<ViewRow[]>({
    queryKey: ["/api/roles/me/permissions"],
    queryFn: () => apiRequest("GET", "/api/roles/me/permissions"),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: notificationCounts } = useQuery({
    queryKey: ["/api/notifications/count", { userId: user?.id }],
    queryFn: () => apiRequest("GET", `/api/notifications/count?userId=${user?.id}`),
    refetchInterval: 30000,
    enabled: !!user,
  });
  const unread = typeof (notificationCounts as any)?.unread === "number" ? (notificationCounts as any).unread : 0;

  // El período contable abierto. En un ERP es contexto permanente, no un dato
  // que se va a buscar: postear en el mes equivocado es de las cosas más caras
  // de deshacer, y verlo siempre es lo que lo previene.
  const { data: period } = useQuery<{ year: number; period: number; status: string } | null>({
    queryKey: ["/api/accounting/periods/current"],
    queryFn: () => apiRequest("GET", "/api/accounting/periods/current"),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // ⌘K / Ctrl+K abre la búsqueda global
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const path = location === "/" ? "/dashboard" : location;
  const current = views.find((v) => v.route_path === path);
  const sectionLabel = current?.section ? SECTION_LABELS[current.section] ?? current.section : null;

  // Agrupadas para la paleta, respetando el orden del catálogo.
  const grouped = useMemo(() => {
    const map = new Map<string, ViewRow[]>();
    for (const v of views) {
      const key = v.section || "otros";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    }
    return [...map.entries()];
  }, [views]);

  // Sólo los atajos cuya pantalla el usuario tiene asignada.
  const quickCreate = useMemo(
    () => QUICK_CREATE.filter((q) => views.some((v) => v.route_path === q.requires)),
    [views],
  );

  const go = (routePath: string) => {
    setPaletteOpen(false);
    setLocation(routePath);
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 dark:border-slate-800 dark:bg-slate-950 md:px-5">
      {showMenuButton && (
        <Button variant="ghost" size="icon" onClick={onMenuClick} className="h-9 w-9 shrink-0 lg:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      )}

      {/* Búsqueda global — con 50+ módulos, es la forma rápida de llegar a uno */}
      <button
        onClick={() => setPaletteOpen(true)}
        className="flex h-10 flex-1 items-center gap-2.5 rounded-lg bg-slate-100 px-3 text-left text-sm text-slate-500 transition-colors hover:bg-slate-200/70 dark:bg-slate-900 dark:hover:bg-slate-800 md:max-w-md"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">Buscar en todo el sistema…</span>
        <kbd className="hidden shrink-0 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-950 sm:block">
          ⌘K
        </kbd>
      </button>

      {/* Ruta actual: sección › página */}
      <div className="hidden min-w-0 flex-1 items-center gap-1.5 text-sm lg:flex">
        {sectionLabel && (
          <>
            <span className="truncate text-slate-500">{sectionLabel}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
          </>
        )}
        <span className="truncate font-semibold text-slate-900 dark:text-slate-100">
          {current?.label ?? "Dashboard"}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {period && (
          <PeriodChip year={period.year} period={period.period} status={period.status} />
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="mr-1 h-9 gap-1.5">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Crear</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {quickCreate.map((q) => {
              const Icon = q.icon;
              return (
                <DropdownMenuItem key={q.route} onClick={() => setLocation(q.route)}>
                  <Icon className="mr-2 h-4 w-4" />
                  {q.label}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setIsCreateOrderModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Pedido
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <IconButton onClick={() => setLocation("/notifications")} badge={unread}>
          <Bell className="h-[18px] w-[18px]" />
        </IconButton>
        <IconButton onClick={() => setLocation("/conversations")}>
          <MessageCircle className="h-[18px] w-[18px]" />
        </IconButton>
        <IconButton onClick={() => setLocation("/settings")}>
          <Settings className="h-[18px] w-[18px]" />
        </IconButton>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="ml-1 flex h-10 items-center gap-2 rounded-lg px-1.5 transition-colors hover:bg-slate-100 dark:hover:bg-slate-900">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-semibold text-white">
                {user?.name?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <div className="hidden text-left leading-tight md:block">
                <p className="max-w-[140px] truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                  {user?.name || "Usuario"}
                </p>
                <p className="text-[11px] capitalize text-slate-500">{user?.role || "usuario"}</p>
              </div>
              <ChevronDown className="hidden h-4 w-4 text-slate-400 md:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => setLocation("/user-settings")}>
              <User className="mr-2 h-4 w-4" />
              Ajustes del Usuario
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-rose-600 focus:text-rose-600">
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar Sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <CommandInput placeholder="Buscar módulo, reporte o pantalla…" />
        <CommandList>
          <CommandEmpty>Nada coincide.</CommandEmpty>
          {grouped.map(([section, items]) => (
            <CommandGroup key={section} heading={SECTION_LABELS[section] ?? section}>
              {items.map((v) => {
                const Icon = iconMap[v.icon_name] || Package;
                return (
                  <CommandItem
                    key={v.route_path}
                    // cmdk filtra por `value`: sin la sección y la ruta aquí,
                    // buscar "fiscal" no encontraría "Reportes DGII".
                    value={`${v.label} ${SECTION_LABELS[v.section ?? ""] ?? ""} ${v.route_path}`}
                    onSelect={() => go(v.route_path)}
                  >
                    <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>{v.label}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">{v.route_path}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>

      <CreateOrderModal
        isOpen={isCreateOrderModalOpen}
        onClose={() => setIsCreateOrderModalOpen(false)}
      />
    </header>
  );
}

const MONTHS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

/**
 * El período contable en curso, siempre visible.
 *
 * El color no es decorativo: un período cerrado significa que nada de lo que se
 * haga hoy va a poder postearse, y eso tiene que verse antes de intentarlo, no
 * después del error.
 */
function PeriodChip({ year, period, status }: { year: number; period: number; status: string }) {
  const open = status === "open";
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <Link
          href="/accounting/trial-balance"
          className={[
            "mr-1 hidden h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium tabular-nums transition-colors md:flex",
            open
              ? "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-900"
              : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-500",
          ].join(" ")}
        >
          <CalendarRange className="h-4 w-4" />
          <span>{MONTHS[period - 1] ?? period} {year}</span>
          {!open && <span className="text-[11px] font-semibold uppercase">cerrado</span>}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {open
          ? `Período contable abierto: ${MONTHS[period - 1]} ${year}`
          : `El período ${MONTHS[period - 1]} ${year} está cerrado — no admite asientos`}
      </TooltipContent>
    </Tooltip>
  );
}

function IconButton({
  children,
  onClick,
  badge,
}: {
  children: React.ReactNode;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900"
    >
      {children}
      {badge != null && badge > 0 && (
        <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold tabular-nums text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}
