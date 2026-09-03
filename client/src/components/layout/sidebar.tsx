import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronDown, Moon, Shield, Sun, X } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { CompanySwitcher } from "@/components/layout/company-switcher";
import { WarehouseSwitcher } from "@/components/layout/warehouse-switcher";
import { moduleBadgeCount, useNavModules, type NavItem } from "@/components/layout/nav-model";

/**
 * Navegación móvil.
 *
 * En escritorio manda la barra horizontal (`top-nav.tsx`); bajo 1024px no hay
 * ancho para ella y la misma estructura se despliega aquí como acordeón. Es un
 * cajón, no una columna permanente: se abre, se elige y se cierra.
 *
 * El módulo de la pantalla actual arranca abierto — al entrar, lo primero que
 * se busca es lo que está al lado de donde uno ya está.
 */
interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MobileNav({ isOpen, onClose }: MobileNavProps) {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { modules, isLoading } = useNavModules();

  const path = location === "/" ? "/dashboard" : location;
  const activeKey = modules.find((m) => m.items.some((i) => i.href === path))?.key;
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (activeKey) setExpanded(activeKey);
  }, [activeKey]);

  // El cajón abierto no debe dejar que la página de atrás siga desplazándose.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <nav className="absolute left-0 top-0 flex h-full w-[290px] max-w-[85vw] flex-col border-r border-border bg-background">
        <div className="flex h-[38px] shrink-0 items-center gap-2 bg-chrome px-3 text-chrome-foreground">
          <img src="/image.png" alt="" className="h-[18px] w-[18px] object-contain" />
          <span className="flex-1 truncate text-[13px] font-semibold">RVR · Sistema Contable</span>
          <button onClick={onClose} aria-label="Cerrar menú" className="flex h-7 w-7 items-center justify-center rounded-sm hover:bg-chrome-hover">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="shrink-0 space-y-2 border-b border-border px-3 py-3">
          <CompanySwitcher />
          <WarehouseSwitcher />
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-2 py-2">
          {isLoading ? (
            <div className="space-y-1.5 px-1">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded-sm bg-muted" />
              ))}
            </div>
          ) : modules.length === 0 ? (
            <div className="flex flex-col items-center px-2 py-10 text-center">
              <Shield className="mb-3 h-9 w-9 text-muted-foreground/40" />
              <p className="text-[13px] text-muted-foreground">No tienes vistas asignadas</p>
              <p className="mt-1 text-[12px] text-muted-foreground/70">Contacta al administrador</p>
            </div>
          ) : (
            modules.map((m) => {
              const isExpanded = expanded === m.key;
              const badge = moduleBadgeCount(m);
              return (
                <div key={m.key}>
                  <button
                    onClick={() => setExpanded(isExpanded ? null : m.key)}
                    aria-expanded={isExpanded}
                    className="flex h-10 w-full items-center gap-2.5 rounded-sm px-2 text-left text-[13px] font-medium hover:bg-muted"
                  >
                    <m.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{m.label}</span>
                    {badge > 0 && (
                      <span className="flex h-[16px] min-w-[16px] items-center justify-center rounded-sm bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                        {badge > 99 ? "99" : badge}
                      </span>
                    )}
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </button>

                  {isExpanded && (
                    <ul className="mb-1 ml-[9px] border-l border-border pl-2">
                      {m.items.map((item) => (
                        <li key={item.href}>
                          <Row item={item} isActive={path === item.href} onNavigate={onClose} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })
          )}
        </div>

        <button
          onClick={toggleTheme}
          className="flex h-11 shrink-0 items-center gap-2.5 border-t border-border px-4 text-[13px] text-muted-foreground hover:bg-muted"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {theme === "dark" ? "Modo claro" : "Modo oscuro"}
        </button>
      </nav>
    </div>
  );
}

function Row({ item, isActive, onNavigate }: { item: NavItem; isActive: boolean; onNavigate: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={[
        "flex h-9 items-center gap-2.5 rounded-sm px-2 text-[13px] transition-colors",
        isActive ? "bg-accent font-semibold text-accent-foreground" : "text-foreground hover:bg-muted",
      ].join(" ")}
    >
      <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge != null && item.badge !== "●" && (
        <span className="flex h-[16px] min-w-[16px] items-center justify-center rounded-sm bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
          {item.badge}
        </span>
      )}
      {item.badge === "●" && <span className="h-2 w-2 rounded-full bg-success" />}
    </Link>
  );
}
