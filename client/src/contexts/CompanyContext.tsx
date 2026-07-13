/**
 * CompanyContext — the active company for the multi-company accounting/fiscal
 * API.
 *
 * A user may belong to several companies (`user_companies`). The active one is
 * persisted in localStorage under `active_company_id`, which `apiRequest` reads
 * to set the `X-Company-Id` header. The server verifies membership on every
 * request, so this is a convenience, not a security boundary.
 *
 *   const { companies, activeCompanyId, setActiveCompanyId, activeCompany } = useCompany();
 */

import { createContext, useContext, useEffect, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./AuthContext";
import { apiRequest } from "@/lib/queryClient";

export interface Company {
  id: number;
  legal_name: string;
  trade_name: string | null;
  rnc: string;
  functional_currency: string;
  is_default: boolean;
}

interface CompanyContextType {
  companies: Company[];
  activeCompanyId: number | null;
  setActiveCompanyId: (id: number) => void;
  activeCompany: Company | null;
  isLoading: boolean;
  /** No membership yet — the UI should route to company creation. */
  hasNoCompany: boolean;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

const STORAGE_KEY = "active_company_id";

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/companies"],
    queryFn: () => apiRequest<{ companies: Company[] }>("GET", "/api/companies"),
    enabled: isAuthenticated,
  });

  const companies = data?.companies ?? [];

  const stored = () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? Number(raw) || null : null;
  };

  // Reconcile the stored selection with what the user can actually access: if it
  // is missing or points at a company they've lost, fall to the default.
  useEffect(() => {
    if (isLoading || companies.length === 0) return;
    const current = stored();
    const valid = current && companies.some((c) => c.id === current);
    if (!valid) {
      const fallback = companies.find((c) => c.is_default) ?? companies[0];
      localStorage.setItem(STORAGE_KEY, String(fallback.id));
    }
  }, [isLoading, companies]);

  useEffect(() => {
    if (!isAuthenticated) localStorage.removeItem(STORAGE_KEY);
  }, [isAuthenticated]);

  const activeCompanyId =
    stored() && companies.some((c) => c.id === stored())
      ? stored()
      : (companies.find((c) => c.is_default) ?? companies[0])?.id ?? null;

  const setActiveCompanyId = (id: number) => {
    localStorage.setItem(STORAGE_KEY, String(id));
    // Everything scoped to a company is now stale for the new one.
    qc.invalidateQueries();
  };

  const activeCompany = companies.find((c) => c.id === activeCompanyId) ?? null;

  return (
    <CompanyContext.Provider
      value={{
        companies,
        activeCompanyId,
        setActiveCompanyId,
        activeCompany,
        isLoading,
        hasNoCompany: !isLoading && isAuthenticated && companies.length === 0,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany(): CompanyContextType {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany must be used inside CompanyProvider");
  return ctx;
}
