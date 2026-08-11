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
import { Users, Plus } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  b2b_wholesale: "B2B Mayorista",
  b2b_distributor: "B2B Distribuidor",
  b2c_retail: "B2C Retail",
  b2c_vip: "B2C VIP",
  b2c_frequent: "B2C Frecuente",
  inactive: "Inactivos",
  at_risk: "En riesgo",
  custom: "Personalizado",
};

const TYPE_COLOR: Record<string, string> = {
  b2b_wholesale: "bg-purple-500",
  b2b_distributor: "bg-orange-500",
  b2c_retail: "bg-blue-500",
  b2c_vip: "bg-yellow-500",
  b2c_frequent: "bg-green-500",
  inactive: "bg-gray-500",
  at_risk: "bg-red-500",
  custom: "bg-slate-500",
};

export default function MarketingSegmentsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: "", name: "", description: "",
    segmentType: "custom",
    isDynamic: true,
  });

  const { data } = useQuery({
    queryKey: ["/api/marketing/segments"],
    queryFn: () => apiRequest("GET", "/api/marketing/segments"),
  });

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/marketing/segments", form),
    onSuccess: () => {
      toast({ title: "Segmento creado" });
      setOpen(false);
      setForm({ code: "", name: "", description: "", segmentType: "custom", isDynamic: true });
      qc.invalidateQueries({ queryKey: ["/api/marketing/segments"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Users className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">Segmentos de Clientes</h1>
            <p className="text-muted-foreground">Agrupa clientes por comportamiento y perfil</p>
          </div>
        </div>
        <Button onClick={() => setOpen(true)} data-testid="button-new-segment">
          <Plus className="w-4 h-4 mr-2" /> Nuevo segmento
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data?.rows?.map((s: any) => (
          <Card key={s.id}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-base">{s.name}</CardTitle>
                  <p className="text-xs font-mono text-muted-foreground">{s.code}</p>
                </div>
                <Badge className={`${TYPE_COLOR[s.segmentType]} text-white text-xs`}>
                  {TYPE_LABELS[s.segmentType] ?? s.segmentType}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {s.description && <p className="text-sm text-muted-foreground mb-3">{s.description}</p>}
              <div className="flex justify-between items-center">
                <div className="text-3xl font-bold">{s.memberCount ?? 0}</div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">clientes</p>
                  {s.isDynamic && <Badge variant="outline" className="text-xs mt-1">Dinámico</Badge>}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {!data?.rows?.length && (
          <p className="col-span-full text-center text-muted-foreground py-8">
            No hay segmentos definidos
          </p>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo segmento</DialogTitle>
            <DialogDescription>Agrupa clientes para campañas, promociones y análisis</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Código *</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="VIP_2026" />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={form.segmentType} onValueChange={(v) => setForm({ ...form, segmentType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Clientes VIP 2026" />
            </div>
            <div>
              <Label>Descripción</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isDynamic} onChange={(e) => setForm({ ...form, isDynamic: e.target.checked })} />
              Segmento dinámico (se recalcula automáticamente)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={!form.code || !form.name || create.isPending}>
              Crear segmento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
