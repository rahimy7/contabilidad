import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { UserPlus, Plus } from "lucide-react";

const STAGES = [
  { key: "new", label: "Nuevo", color: "bg-gray-500" },
  { key: "contacted", label: "Contactado", color: "bg-blue-500" },
  { key: "qualified", label: "Calificado", color: "bg-purple-500" },
  { key: "proposal", label: "Propuesta", color: "bg-yellow-500" },
  { key: "negotiation", label: "Negociación", color: "bg-orange-500" },
  { key: "won", label: "Ganado", color: "bg-green-600" },
  { key: "lost", label: "Perdido", color: "bg-red-500" },
];

const money = (v: string | number) =>
  Number(v || 0).toLocaleString("es-DO", { minimumFractionDigits: 2 });

export default function MarketingLeadsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    firstName: "", lastName: "", company: "",
    email: "", phone: "",
    source: "whatsapp",
    interestedIn: "",
    estimatedValue: 0,
    notes: "",
  });

  const { data } = useQuery({
    queryKey: ["/api/marketing/leads"],
    queryFn: () => apiRequest("GET", "/api/marketing/leads"),
  });

  const create = useMutation({
    mutationFn: () => {
      const payload: any = {
        firstName: form.firstName, source: form.source,
      };
      if (form.lastName) payload.lastName = form.lastName;
      if (form.company) payload.company = form.company;
      if (form.email) payload.email = form.email;
      if (form.phone) payload.phone = form.phone;
      if (form.interestedIn) payload.interestedIn = form.interestedIn;
      if (form.estimatedValue) payload.estimatedValue = Number(form.estimatedValue);
      if (form.notes) payload.notes = form.notes;
      return apiRequest("POST", "/api/marketing/leads", payload);
    },
    onSuccess: () => {
      toast({ title: "Lead creado" });
      setOpen(false);
      setForm({ firstName: "", lastName: "", company: "", email: "", phone: "", source: "whatsapp", interestedIn: "", estimatedValue: 0, notes: "" });
      qc.invalidateQueries({ queryKey: ["/api/marketing/leads"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const moveStage = useMutation({
    mutationFn: ({ id, stage }: { id: number; stage: string }) =>
      apiRequest("POST", `/api/marketing/leads/${id}/stage`, { stage }),
    onSuccess: () => {
      toast({ title: "Etapa actualizada" });
      qc.invalidateQueries({ queryKey: ["/api/marketing/leads"] });
    },
  });

  const leadsByStage = STAGES.map((s) => ({
    ...s,
    leads: data?.rows?.filter((l: any) => l.stage === s.key) ?? [],
  }));

  const totalPipeline = data?.rows?.reduce((sum: number, l: any) =>
    ["won", "lost"].includes(l.stage) ? sum : sum + Number(l.estimatedValue || 0), 0) ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <UserPlus className="w-8 h-8 text-blue-500" />
          <div>
            <h1 className="text-2xl font-bold">Leads / CRM</h1>
            <p className="text-muted-foreground">Pipeline comercial · Pipeline: RD$ {money(totalPipeline)}</p>
          </div>
        </div>
        <Button onClick={() => setOpen(true)} data-testid="button-new-lead">
          <Plus className="w-4 h-4 mr-2" /> Nuevo lead
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-3">
        {leadsByStage.map((col) => (
          <div key={col.key} className="min-w-0">
            <div className={`${col.color} text-white text-xs font-semibold p-2 rounded-t text-center`}>
              {col.label} <span className="opacity-70">({col.leads.length})</span>
            </div>
            <div className="border border-t-0 rounded-b p-2 space-y-2 min-h-[400px] bg-muted/30">
              {col.leads.map((lead: any) => (
                <Card key={lead.id} className="p-2 hover:shadow cursor-pointer">
                  <p className="font-medium text-sm truncate">{lead.firstName} {lead.lastName ?? ""}</p>
                  {lead.company && <p className="text-xs text-muted-foreground truncate">{lead.company}</p>}
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-xs font-mono">RD$ {money(lead.estimatedValue)}</span>
                    <Badge variant="outline" className="text-xs">{lead.source}</Badge>
                  </div>
                  <Select
                    value={lead.stage}
                    onValueChange={(v) => moveStage.mutate({ id: lead.id, stage: v })}
                  >
                    <SelectTrigger className="h-6 text-xs mt-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STAGES.map((s) => (
                        <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Card>
              ))}
              {col.leads.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Sin leads</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo lead</DialogTitle>
            <DialogDescription>Registra un prospecto en el pipeline</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nombre *</Label>
                <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </div>
              <div>
                <Label>Apellido</Label>
                <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Empresa</Label>
              <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fuente</Label>
                <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="website">Sitio web</SelectItem>
                    <SelectItem value="social">Redes sociales</SelectItem>
                    <SelectItem value="referral">Referido</SelectItem>
                    <SelectItem value="event">Evento</SelectItem>
                    <SelectItem value="cold_call">Llamada en frío</SelectItem>
                    <SelectItem value="other">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor estimado (DOP)</Label>
                <Input type="number" value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label>Producto/servicio de interés</Label>
              <Input value={form.interestedIn} onChange={(e) => setForm({ ...form, interestedIn: e.target.value })} />
            </div>
            <div>
              <Label>Notas</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={!form.firstName || create.isPending}>
              Crear lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
