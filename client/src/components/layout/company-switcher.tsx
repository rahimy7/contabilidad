/**
 * CompanySwitcher — selects the active company (empresa) for the accounting and
 * fiscal modules.
 *
 * A user who belongs to one company sees its name as a static badge; a user with
 * several gets a dropdown. Changing it invalidates cached queries so every
 * company-scoped view reloads for the newly selected tenant.
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

export function CompanySwitcher() {
  const { companies, activeCompanyId, setActiveCompanyId, isLoading } = useCompany();
  const [, navigate] = useLocation();

  if (isLoading) return null;

  if (companies.length === 0) {
    return (
      <button
        onClick={() => navigate("/companies")}
        className="flex w-full items-center gap-2 rounded-md border border-dashed px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted/50"
      >
        <Plus className="h-4 w-4" /> Crear empresa
      </button>
    );
  }

  if (companies.length === 1) {
    return (
      <div className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="truncate">{companies[0].trade_name || companies[0].legal_name}</span>
      </div>
    );
  }

  return (
    <Select
      value={activeCompanyId ? String(activeCompanyId) : undefined}
      onValueChange={(v) => setActiveCompanyId(Number(v))}
    >
      <SelectTrigger className="w-full">
        <div className="flex items-center gap-2 truncate">
          <Building2 className="h-4 w-4 text-muted-foreground" />
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
