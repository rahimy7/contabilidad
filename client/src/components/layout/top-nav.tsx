import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import {
  Bell, CalendarRange, ChevronDown, ChevronRight, CircleHelp, FileSpreadsheet,
  FileText, LogOut, Menu, MessageCircle, Plus, PackagePlus, Search,
  Settings, ShoppingBag, User, UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import CreateOrderModal from "@/components/orders/create-order-modal";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { CompanySwitcher } from "@/components/layout/company-switcher";
import { WarehouseSwitcher } from "@/components/layout/warehouse-switcher";
import {
  CHROME_SECTIONS, moduleBadgeCount, quickLinksFor, useNavModules, useRouteBadges,
  type NavItem, type NavModule,
} from "@/components/layout/nav-model";
import { hiddenModuleKeys, sameKeys, type NavItemBox } from "@/components/layout/nav-overflow";

/**
 * Barra superior en tres franjas, al estilo Dynamics 365 Business Central.
 *
 *   1 · identidad   — quién soy, en qué entorno, y las acciones globales.
 *   2 · módulos     — la empresa activa y un desplegable por módulo.
 *   3 · contexto    — las pantallas del módulo actual, el período y el almacén.
 *
 * Reemplaza al par riel+panel lateral, que ocupaba 296px de ancho de forma
 * permanente. En una rejilla de facturación o un plan de cuentas eso eran tres
 * columnas que no se veían. El costo es de 122px de alto contra los 64px del
 * header anterior, y la franja 3 desaparece cuando el módulo no tiene accesos.
 *
 * Los módulos salen del mismo catálogo RBAC de siempre: esto no decide permisos.
 */

const QUICK_CREATE: { label: string; icon: any; route: string; requires: string }[] = [
  { label: "Factura", icon: FileText, route: "/invoicing", requires: "/invoicing" },
  { label: "Venta en caja", icon: Plus, route: "/pos", requires: "/pos" },
  { label: "Orden de compra", icon: ShoppingBag, route: "/purchase-management", requires: "/purchase-management" },
  { label: "Producto", icon: PackagePlus, route: "/add-product", requires: "/add-product" },
  { label: "Cliente", icon: UserPlus, route: "/customers/new", requires: "/customers" },
];

interface TopNavProps {
  onOpenMobileNav?: () => void;
}

export default function TopNav({ onOpenMobileNav }: TopNavProps) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const { modules, views, isLoading } = useNavModules();
  const { unreadNotifications } = useRouteBadges();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const path = location === "/" ? "/dashboard" : location;
  const currentView = views.find((v) => v.route_path === path);

  const menuModules = useMemo(
    () => modules.filter((m) => !CHROME_SECTIONS.includes(m.key)),
    [modules],
  );
  const settingsModule = modules.find((m) => m.key === "configuracion");
  const mainModule = modules.find((m) => m.key === "principal");

  /** El módulo dueño de la pantalla actual manda sobre cualquier otra cosa. */
  const activeModule = useMemo(
    () => modules.find((m) => m.items.some((i) => i.href === path)),
    [modules, path],
  );
  const quickLinks = quickLinksFor(activeModule);

  // ⌘K abre la búsqueda global.
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

  // Cerrar los desplegables al navegar, al hacer clic fuera y con Escape.
  useEffect(() => setOpenMenu(null), [location]);
  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpenMenu(null);
    document.addEventListener("click", close);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onEsc);
    };
  }, [openMenu]);

  const quickCreate = useMemo(
    () => QUICK_CREATE.filter((q) => views.some((v) => v.route_path === q.requires)),
    [views],
  );

  const reportItems = useMemo(
    () => (mainModule?.items ?? []).filter((i) =>
      ["/reports", "/reports-export", "/executive-dashboard", "/dashboard"].includes(i.href)),
    [mainModule],
  );

  const go = useCallback((route: string) => {
    setPaletteOpen(false);
    setOpenMenu(null);
    setLocation(route);
  }, [setLocation]);

  const barRef = useRef<HTMLElement | null>(null);
  const hiddenModules = useBarOverflow(barRef as React.RefObject<HTMLElement>, menuModules.length);
  const overflowModules = menuModules.filter((m) => hiddenModules.has(m.key));

  return (
    <header className="sticky top-0 z-30 shrink-0">
      {/* ── 1 · Identidad ──────────────────────────────────────────────── */}
      <div className="flex h-[38px] items-center gap-2 bg-chrome px-2 text-chrome-foreground md:px-3">
        <button
          onClick={onOpenMobileNav}
          className="flex h-8 w-8 items-center justify-center rounded-sm hover:bg-chrome-hover lg:hidden"
          aria-label="Abrir menú"
        >
          <Menu className="h-[18px] w-[18px]" />
        </button>

        <Link href="/dashboard" className="flex items-center gap-2 rounded-sm px-1 py-1 hover:bg-chrome-hover">
          <img src="/image.png" alt="" className="h-[18px] w-[18px] shrink-0 object-contain" />
          <span className="text-[13px] font-semibold tracking-tight">RVR · Sistema Contable</span>
        </Link>

        <span className="ml-auto hidden items-center gap-1.5 text-[11px] text-chrome-muted sm:flex">
          Entorno: {isLocalHost() ? "Desarrollo" : "Producción"}
        </span>

        <div className="ml-auto flex items-center gap-0.5 sm:ml-3">
          <ChromeButton label="Buscar (⌘K)" onClick={() => setPaletteOpen(true)}>
            <Search className="h-[15px] w-[15px]" />
          </ChromeButton>
          <ChromeButton label="Notificaciones" onClick={() => go("/notifications")} badge={unreadNotifications}>
            <Bell className="h-[15px] w-[15px]" />
          </ChromeButton>
          <ChromeButton label="Conversaciones" onClick={() => go("/conversations")}>
            <MessageCircle className="h-[15px] w-[15px]" />
          </ChromeButton>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-sm text-chrome-foreground hover:bg-chrome-hover"
                aria-label="Configuración"
              >
                <Settings className="h-[15px] w-[15px]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Configuración
              </DropdownMenuLabel>
              {settingsModule?.items.map((i) => (
                <DropdownMenuItem key={i.href} onClick={() => go(i.href)}>
                  <i.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  {i.label}
                </DropdownMenuItem>
              ))}
              {!settingsModule && (
                <DropdownMenuItem disabled>Sin acceso a configuración</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <ChromeButton label="Ayuda" onClick={() => go("/help")}>
            <CircleHelp className="h-[15px] w-[15px]" />
          </ChromeButton>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="ml-1 flex h-8 items-center gap-1.5 rounded-sm pl-1 pr-1.5 hover:bg-chrome-hover">
                <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  {user?.name?.charAt(0)?.toUpperCase() || "U"}
                </span>
                <ChevronDown className="hidden h-3.5 w-3.5 text-chrome-muted sm:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="py-2">
                <p className="truncate text-[13px] font-semibold">{user?.name || "Usuario"}</p>
                <p className="text-[11px] font-normal capitalize text-muted-foreground">
                  {user?.role || "usuario"}
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => go("/user-settings")}>
                <User className="mr-2 h-4 w-4" />
                Ajustes del usuario
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── 2 · Módulos ────────────────────────────────────────────────── */}
      <div className="hidden h-[46px] items-center border-b border-border bg-background px-3 lg:flex">
        <div className="mr-2 max-w-[260px] shrink-0 border-r border-border pr-3">
          <CompanySwitcher variant="bar" />
        </div>

        <nav ref={barRef} className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="mx-1 h-4 w-20 animate-pulse rounded-sm bg-muted" />
              ))
            : menuModules.map((m) => (
                <ModuleMenu
                  key={m.key}
                  module={m}
                  isActive={activeModule?.key === m.key}
                  isOpen={openMenu === m.key}
                  anyOpen={openMenu !== null}
                  isHidden={hiddenModules.has(m.key)}
                  onOpen={() => setOpenMenu(m.key)}
                  onClose={() => setOpenMenu(null)}
                  onNavigate={go}
                />
              ))}
        </nav>

        <div className="ml-2 flex shrink-0 items-center gap-1 border-l border-border pl-2">
          {overflowModules.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-8 items-center gap-1 rounded-sm px-2.5 text-[13px] hover:bg-muted">
                  Más
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {overflowModules.map((m) => (
                  <DropdownMenuItem key={m.key} onClick={() => go(m.items[0]?.href ?? "/dashboard")}>
                    <m.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    {m.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {reportItems.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-8 items-center gap-1 rounded-sm px-2.5 text-[13px] hover:bg-muted">
                  Todos los reportes
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {reportItems.map((i) => (
                  <DropdownMenuItem key={i.href} onClick={() => go(i.href)}>
                    <i.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    {i.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => go("/reports-export")}>
                  <FileSpreadsheet className="mr-2 h-4 w-4 text-muted-foreground" />
                  Exportar a Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8 gap-1.5">
                <Plus className="h-4 w-4" />
                Crear
                <ChevronDown className="h-3 w-3 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {quickCreate.map((q) => (
                <DropdownMenuItem key={q.route} onClick={() => go(q.route)}>
                  <q.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  {q.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setCreateOrderOpen(true)}>
                <Plus className="mr-2 h-4 w-4 text-muted-foreground" />
                Pedido
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── 3 · Contexto del módulo ────────────────────────────────────── */}
      <div className="flex h-[38px] items-center gap-1 border-b border-border bg-background px-3">
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-thin">
          {/* En móvil no hay franja 2, así que aquí va la ruta actual. */}
          <span className="flex shrink-0 items-center gap-1 pr-2 text-[12px] text-muted-foreground lg:hidden">
            {activeModule && (
              <>
                <span className="truncate">{activeModule.label}</span>
                <ChevronRight className="h-3 w-3" />
              </>
            )}
            <span className="truncate font-semibold text-foreground">
              {currentView?.label ?? "Dashboard"}
            </span>
          </span>

          <div className="hidden items-center gap-0.5 lg:flex">
            {quickLinks.map((item) => (
              <ContextLink key={item.href} item={item} isActive={path === item.href} />
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 pl-2">
          <PeriodChip />
          <div className="hidden w-[180px] md:block">
            <WarehouseSwitcher variant="bar" />
          </div>
        </div>
      </div>

      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <CommandInput placeholder="Buscar módulo, reporte o pantalla…" />
        <CommandList>
          <CommandEmpty>Nada coincide.</CommandEmpty>
          {modules.map((m) => (
            <CommandGroup key={m.key} heading={m.label}>
              {m.items.map((i) => (
                <CommandItem
                  key={i.href}
                  // cmdk filtra por `value`: sin el módulo y la ruta aquí,
                  // buscar "fiscal" no encontraría "Reportes DGII".
                  value={`${i.label} ${m.label} ${i.href}`}
                  onSelect={() => go(i.href)}
                >
                  <i.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{i.label}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">{i.href}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>

      <CreateOrderModal isOpen={createOrderOpen} onClose={() => setCreateOrderOpen(false)} />
    </header>
  );
}

/**
 * Qué módulos no caben en la franja de módulos.
 *
 * Se mide la caja real de cada uno contra el ancho del contenedor; la decisión
 * vive en `hiddenModuleKeys`, que es pura y está cubierta por pruebas. Los
 * módulos siempre se montan: el que desborda queda invisible pero conserva su
 * sitio, así que esconderlo no cambia la medida y no hay oscilación.
 */
function useBarOverflow(barRef: React.RefObject<HTMLElement>, count: number) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    const measure = () => {
      const boxes: NavItemBox[] = Array.from(bar.children)
        .map((c) => c as HTMLElement)
        .filter((c) => !!c.dataset.navKey)
        .map((c) => ({ key: c.dataset.navKey!, left: c.offsetLeft, width: c.offsetWidth }));

      const next = hiddenModuleKeys(boxes, bar.clientWidth);
      setHidden((prev) => (sameKeys(prev, next) ? prev : next));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    // La barra puede estar oculta al montar (ventana angosta): observar también
    // al padre hace que se vuelva a medir en cuanto aparece.
    if (bar.parentElement) ro.observe(bar.parentElement);
    return () => ro.disconnect();
  }, [barRef, count]);

  return hidden;
}

/**
 * Un módulo de la franja 2.
 *
 * Abre con clic. Una vez que hay un desplegable abierto, pasar el mouse por
 * encima de otro cambia a ese: es el gesto de una barra de menús de escritorio,
 * y evita el clic-cerrar-clic-abrir cuando se está comparando entre módulos.
 */
function ModuleMenu({
  module, isActive, isOpen, anyOpen, isHidden, onOpen, onClose, onNavigate,
}: {
  module: NavModule;
  isActive: boolean;
  isOpen: boolean;
  anyOpen: boolean;
  /** No cabe en la barra: sigue montado, pero se ofrece desde "Más". */
  isHidden: boolean;
  onOpen: () => void;
  onClose: () => void;
  onNavigate: (route: string) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{ left: number; right: number; bottom: number } | null>(null);
  const badge = moduleBadgeCount(module);

  const measure = () => {
    const btn = btnRef.current;
    if (!btn) return null;
    const rect = btn.getBoundingClientRect();
    const bar = btn.closest("nav")?.getBoundingClientRect();
    return { left: rect.left, right: rect.right, bottom: bar?.bottom ?? rect.bottom };
  };

  const open = () => {
    setAnchor(measure());
    onOpen();
  };

  // La barra de módulos recorta lo que se sale de ella, y el desplegable es más
  // alto que sus 46px: dentro del flujo quedaría cortado a una franja invisible.
  // Por eso va en un portal, anclado a la posición real del botón.
  useEffect(() => {
    if (!isOpen) return;
    const reposition = () => setAnchor(measure());
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [isOpen]);

  const alignRight = !!anchor && anchor.left > window.innerWidth * 0.55;

  return (
    <div
      data-nav-key={module.key}
      className={`relative shrink-0 ${isHidden ? "invisible pointer-events-none" : ""}`}
      aria-hidden={isHidden || undefined}
      onMouseEnter={() => anyOpen && !isOpen && open()}
    >
      <button
        ref={btnRef}
        onClick={(e) => {
          e.stopPropagation();
          isOpen ? onClose() : open();
        }}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className={[
          "flex h-8 items-center gap-1.5 whitespace-nowrap rounded-sm px-2.5 text-[13px] transition-colors",
          isOpen || isActive
            ? "bg-accent text-accent-foreground"
            : "text-foreground hover:bg-muted",
        ].join(" ")}
      >
        {module.label}
        {badge > 0 && (
          <span className="flex h-[15px] min-w-[15px] items-center justify-center rounded-sm bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {badge > 99 ? "99" : badge}
          </span>
        )}
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>

      {isOpen && anchor && createPortal(
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: anchor.bottom,
            ...(alignRight
              ? { right: Math.max(8, window.innerWidth - anchor.right) }
              : { left: Math.max(8, anchor.left) }),
          }}
          className="z-50 flex max-w-[min(660px,calc(100vw-2rem))] flex-wrap gap-x-7 gap-y-4 border border-border-strong bg-popover p-4 shadow-flyout animate-flyout-in"
        >
          {module.groups.map((g, gi) => (
            <div key={g.label ?? gi} className="min-w-[190px]">
              {g.label && <p className="erp-label mb-1.5 px-2">{g.label}</p>}
              <ul>
                {g.items.map((i) => (
                  <li key={i.href}>
                    <button
                      onClick={() => onNavigate(i.href)}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-[13px] hover:bg-muted hover:text-accent-foreground"
                    >
                      <i.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{i.label}</span>
                      <ItemBadge badge={i.badge} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Un acceso directo de la franja 3. */
function ContextLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  return (
    <Link
      href={item.href}
      className={[
        "flex h-[26px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-2 text-[13px] transition-colors",
        isActive
          ? "bg-accent font-semibold text-accent-foreground"
          : "text-primary hover:bg-muted",
      ].join(" ")}
    >
      {item.label}
      <ItemBadge badge={item.badge} />
    </Link>
  );
}

function ItemBadge({ badge }: { badge: number | string | null }) {
  if (badge == null) return null;
  if (badge === "●") return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />;
  return (
    <span className="flex h-[15px] min-w-[15px] shrink-0 items-center justify-center rounded-sm bg-destructive px-1 text-[10px] font-semibold tabular-nums text-destructive-foreground">
      {typeof badge === "number" && badge > 99 ? "99" : badge}
    </span>
  );
}

function ChromeButton({
  children, label, onClick, badge,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          aria-label={label}
          className="relative flex h-8 w-8 items-center justify-center rounded-sm text-chrome-foreground transition-colors hover:bg-chrome-hover"
        >
          {children}
          {badge != null && badge > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-[14px] min-w-[14px] items-center justify-center rounded-sm bg-destructive px-0.5 text-[9px] font-semibold tabular-nums text-destructive-foreground">
              {badge > 99 ? "99" : badge}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/**
 * El período contable en curso.
 *
 * El color no es decorativo: un período cerrado significa que nada de lo que se
 * capture hoy va a poder postearse, y eso tiene que verse antes de intentarlo.
 */
function PeriodChip() {
  const { user } = useAuth();
  const { data: period } = useQuery<{ year: number; period: number; status: string } | null>({
    queryKey: ["/api/accounting/periods/current"],
    queryFn: () => apiRequest("GET", "/api/accounting/periods/current"),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (!period) return null;
  const open = period.status === "open";

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Link
          href="/accounting/trial-balance"
          className={[
            "hidden h-[26px] items-center gap-1.5 rounded-sm border px-2 text-[12px] font-medium tabular-nums transition-colors sm:flex",
            open
              ? "border-border text-muted-foreground hover:bg-muted"
              : "border-warning bg-warning/10 text-warning",
          ].join(" ")}
        >
          <CalendarRange className="h-3.5 w-3.5" />
          {MONTHS[period.period - 1] ?? period.period} {period.year}
          {!open && <span className="text-[10px] font-semibold uppercase">cerrado</span>}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {open
          ? `Período contable abierto: ${MONTHS[period.period - 1]} ${period.year}`
          : `El período ${MONTHS[period.period - 1]} ${period.year} está cerrado — no admite asientos`}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Qué entorno se está usando.
 *
 * Se decide por el host y no por la variable de build: lo que importa mostrar
 * no es cómo se compiló el bundle sino contra qué base se está trabajando, que
 * es exactamente la confusión que hace que alguien facture en pruebas.
 */
function isLocalHost() {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h.startsWith("192.168.") || h.endsWith(".local");
}
