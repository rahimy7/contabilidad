/**
 * CompanySwitcher — la empresa activa de los módulos contable y fiscal.
 *
 * Quien pertenece a una sola empresa ve el nombre; quien tiene varias, un
 * desplegable. Cambiarla invalida las consultas en caché para que toda vista
 * con alcance de empresa recargue contra el tenant nuevo.
 *
 * `variant="bar"` es la forma que toma en la franja de módulos: sin borde y en
 * grande, porque ahí el nombre de la empresa es el título del espacio de
 * trabajo, no un campo más de un formulario.
 */

import { useLocation } from "wouter";
import { useCompany } from "@/contexts/CompanyContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, Plus } from "lucide-react";

interface CompanySwitcherProps {
  variant?: "panel" | "bar";
}

export function CompanySwitcher({ variant = "panel" }: CompanySwitcherProps) {
  const { companies, activeCompanyId, setActiveCompanyId, isLoading } = useCompany();
  const [, navigate] = useLocation();
  const bar = variant === "bar";

  if (isLoading) return null;

  if (companies.length === 0) {
    return (
      <button
        onClick={() => navigate("/companies")}
        className="flex w-full items-center gap-2 rounded-sm border border-dashed border-border-strong px-2 py-1.5 text-[13px] text-muted-foreground hover:bg-muted"
      >
        <Plus className="h-4 w-4" /> Crear empresa
      </button>
    );
  }

  if (companies.length === 1) {
    const name = companies[0].trade_name || companies[0].legal_name;
    return bar ? (
      <span className="block truncate text-[16px] font-semibold tracking-tight" title={name}>
        {name}
      </span>
    ) : (
      <div className="flex items-center gap-2 rounded-sm border border-border px-2 py-1.5 text-[13px]">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="truncate">{name}</span>
      </div>
    );
  }

  return (
    <Select
      value={activeCompanyId ? String(activeCompanyId) : undefined}
      onValueChange={(v) => setActiveCompanyId(Number(v))}
    >
      <SelectTrigger
        className={
          bar
            ? "h-8 w-full border-0 bg-transparent px-0 text-[16px] font-semibold tracking-tight hover:text-primary focus:ring-0"
            : "w-full"
        }
      >
        <div className="flex items-center gap-2 truncate">
          {!bar && <Building2 className="h-4 w-4 text-muted-foreground" />}
          <SelectValue placeholder="Selecciona empresa" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {companies.map((c) => (
          <SelectItem key={c.id} value={String(c.id)}>
            {c.trade_name || c.legal_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
