import { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Barra de filtros sobre una rejilla.
 *
 * Existe para que la búsqueda y los filtros tengan la misma altura y el mismo
 * orden en todas las pantallas: hoy cada lista los coloca donde le tocó.
 */
interface FilterBarProps {
  search?: string;
  onSearchChange?: (v: string) => void;
  placeholder?: string;
  /** Selects y demás controles de filtro. */
  children?: ReactNode;
  /** Acciones al extremo derecho (exportar, columnas…). */
  actions?: ReactNode;
}

export function FilterBar({
  search, onSearchChange, placeholder = "Buscar…", children, actions,
}: FilterBarProps) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      {onSearchChange && (
        <div className="relative w-full sm:w-[260px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={placeholder}
            className="pl-8 pr-7"
          />
          {search && (
            <button
              onClick={() => onSearchChange("")}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
      {children}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}
