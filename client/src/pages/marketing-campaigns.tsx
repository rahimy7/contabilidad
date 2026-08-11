import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Zap, Plus, TrendingUp } from "lucide-react";

const STATUS_COLOR: Record<string, string> = {
  planning: "bg-gray-500",
  active: "bg-green-500",
  paused: "bg-yellow-500",
  completed: "bg-blue-500",
  cancelled: "bg-red-500",
};

const money = (v: string | number) =>
  Number(v || 0).toLocaleString("es-DO", { minimumFractionDigits: 2 });

export default function MarketingCampaignsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [roiId, setRoiId] = useState<number | null>(null);
  const [form, setForm] = useState({
    code: "", name: "", description: "",
    channel: "whatsapp",
    objective: "conversion",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    budgetAmount: 0,
  });

  const { data } = useQuery({
    queryKey: ["/api/marketing/campaigns"],
    queryFn: () => apiRequest("GET", "/api/marketing/campaigns"),
  });

  const { data: roi } = useQuery({
    queryKey: ["/api/marketing/campaigns/roi", roiId],
    queryFn: () => apiRequest("GET", `/api/marketing/campaigns/${roiId}/roi`),
    enabled: roiId != null,
  });

  const create = useMutation({
    mutationFn: () => {
      const payload: any = {
        code: form.code, name: form.name, description: form.description,
        channel: form.channel, objective: form.objective,
        startDate: form.startDate,
      };
      if (form.endDate) payload.endDate = form.endDate;
      if (form.budgetAmount) payload.budgetAmount = Number(form.budgetAmount);
      return apiRequest("POST", "/api/marketing/campaigns", payload);
    },
    onSuccess: () => {
      toast({ title: "Campaña creada" });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["/api/marketing/campaigns"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Zap className="w-8 h-8 text-yellow-500" />
          <div>
            <h1 className="text-2xl font-bold">Campañas de Marketing</h1>
            <p className="text-muted-foreground">WhatsApp, email, SMS, redes con seguimiento de ROI</p>
          </div>
        </div>
        <Button onClick={() => setOpen(true)} data-testid="button-new-campaign">
          <Plus className="w-4 h-4 mr-2" /> Nueva campaña
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Campañas</CardTitle>
          <CardDescription>Presupuesto, gasto real, conversiones y ROI</CardDescription>
        </CardHeader>
        <CardContent>
          {data?.rows?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Objetivo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Presupuesto</TableHead>
                  <TableHead className="text-right">Gastado</TableHead>
                  <TableHead className="text-right">Conversiones</TableHead>
                  <TableHead className="text-right">Ingresos</TableHead>
                  <TableHead>ROI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.code}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.channel}</TableCell>
                    <TableCell>{c.objective}</TableCell>
                    <TableCell>
                      <Badge className={`${STATUS_COLOR[c.status]} text-white`}>{c.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{money(c.budgetAmount)}</TableCell>
                    <TableCell className="text-right font-mono">{money(c.spentAmount)}</TableCell>
                    <TableCell className="text-right">{c.conversionCount}</TableCell>
                    <TableCell className="text-right font-mono">{money(c.revenueGenerated)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => setRoiId(c.id)}>
                        <TrendingUp className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">No hay campañas definidas</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva campaña</DialogTitle>
            <DialogDescription>Define objetivo, canal y presupuesto</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Código *</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="BF-2026" />
              </div>
              <div>
                <Label>Canal</Label>
                <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="social">Redes sociales</SelectItem>
                    <SelectItem value="offline">Offline</SelectItem>
                    <SelectItem value="multi">Multi-canal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Black Friday 2026" />
            </div>
            <div>
              <Label>Descripción</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Objetivo</Label>
                <Select value={form.objective} onValueChange={(v) => setForm({ ...form, objective: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="conversion">Conversión</SelectItem>
                    <SelectItem value="retention">Retención</SelectItem>
                    <SelectItem value="awareness">Conocimiento</SelectItem>
                    <SelectItem value="reactivation">Reactivación</SelectItem>
                    <SelectItem value="loyalty">Fidelización</SelectItem>
                    <SelectItem value="launch">Lanzamiento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Presupuesto (DOP)</Label>
                <Input type="number" value={form.budgetAmount} onChange={(e) => setForm({ ...form, budgetAmount: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Inicio *</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div>
                <Label>Fin</Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={!form.code || !form.name || create.isPending}>
              Crear campaña
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={roiId != null} onOpenChange={(o) => !o && setRoiId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Análisis ROI</DialogTitle>
          </DialogHeader>
          {roi && (
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-xs text-muted-foreground">Presupuesto</p><p className="text-xl font-mono">RD$ {money(roi.budget)}</p></div>
              <div><p className="text-xs text-muted-foreground">Gastado</p><p className="text-xl font-mono">RD$ {money(roi.spent)}</p></div>
              <div><p className="text-xs text-muted-foreground">Ingresos generados</p><p className="text-xl font-mono">RD$ {money(roi.revenue)}</p></div>
              <div><p className="text-xs text-muted-foreground">Conversiones</p><p className="text-xl font-bold">{roi.conversions}</p></div>
              <div className="col-span-2 pt-3 border-t">
                <p className="text-xs text-muted-foreground">ROI</p>
                <p className={`text-3xl font-bold ${roi.roiPercent > 0 ? "text-green-600" : "text-red-600"}`}>
                  {roi.roiPercent != null ? `${roi.roiPercent}%` : "—"}
                </p>
                <p className="text-sm text-muted-foreground">Ganancia: RD$ {money(roi.profit)}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
