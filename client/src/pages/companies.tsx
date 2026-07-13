import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Building2, Plus, Check } from "lucide-react";

/**
 * Company management: the list of companies the user belongs to, which one is
 * active, and a form to create a new one. Creating a company seeds its entire
 * accounting configuration server-side, so it is usable the moment it appears.
 */
export default function CompaniesPage() {
  const { companies, activeCompanyId, setActiveCompanyId, isLoading } = useCompany();
  const [open, setOpen] = useState(false);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Empresas</h1>
          <p className="text-sm text-muted-foreground">Contribuyentes que administras</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Nueva empresa
            </Button>
          </DialogTrigger>
          <CreateCompanyDialog onDone={() => setOpen(false)} />
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mis empresas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-muted-foreground">Cargando…</p>}
          {!isLoading && companies.length === 0 && (
            <p className="py-6 text-center text-muted-foreground">
              Aún no tienes empresas. Crea la primera para empezar a facturar.
            </p>
          )}
          {companies.map((c) => {
            const active = c.id === activeCompanyId;
            return (
              <div
                key={c.id}
                className={`flex items-center justify-between rounded-md border p-3 ${
                  active ? "border-primary bg-primary/5" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="font-medium">{c.trade_name || c.legal_name}</div>
                    <div className="text-xs text-muted-foreground">
                      RNC {c.rnc} · {c.functional_currency}
                    </div>
                  </div>
                </div>
                {active ? (
                  <Badge className="gap-1">
                    <Check className="h-3.5 w-3.5" /> Activa
                  </Badge>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setActiveCompanyId(c.id)}>
                    Activar
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function CreateCompanyDialog({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { setActiveCompanyId } = useCompany();

  const [legalName, setLegalName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [rnc, setRnc] = useState("");

  const create = useMutation({
    mutationFn: () =>
      apiRequest<{ company: { id: number; rnc: string } }>("POST", "/api/companies", {
        legalName,
        tradeName: tradeName || undefined,
        rnc,
      }),
    onSuccess: (res) => {
      toast({ title: "Empresa creada", description: `RNC ${res.company.rnc}` });
      qc.invalidateQueries({ queryKey: ["/api/companies"] });
      setActiveCompanyId(res.company.id);
      onDone();
    },
    onError: (e: any) =>
      toast({ variant: "destructive", title: "No se pudo crear", description: e.message }),
  });

  const rncValid = /^\d{9}$|^\d{11}$/.test(rnc);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Nueva empresa</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <label className="block text-sm">
          Razón social
          <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Contribuyente SRL" />
        </label>
        <label className="block text-sm">
          Nombre comercial
          <Input value={tradeName} onChange={(e) => setTradeName(e.target.value)} placeholder="opcional" />
        </label>
        <label className="block text-sm">
          RNC / Cédula
          <Input value={rnc} onChange={(e) => setRnc(e.target.value.replace(/\D/g, ""))} placeholder="9 u 11 dígitos" />
          {rnc && !rncValid && <span className="text-xs text-destructive">Debe tener 9 u 11 dígitos.</span>}
        </label>
      </div>
      <DialogFooter>
        <Button onClick={() => create.mutate()} disabled={!legalName || !rncValid || create.isPending}>
          {create.isPending ? "Creando…" : "Crear y activar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
