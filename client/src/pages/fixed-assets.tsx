import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { moduleApi } from "@/lib/accounting-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Calculator } from "lucide-react";

const money = (v: string | number) =>
  Number(v ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FixedAssetsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const assets = useQuery({ queryKey: ["/api/modules/fixed-assets"], queryFn: () => moduleApi.fixedAssets() });
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [life, setLife] = useState("36");
  const now = new Date();

  const add = useMutation({
    mutationFn: () =>
      moduleApi.createAsset({ code: `FA${Date.now()}`, name, acquisitionDate: now.toISOString().slice(0, 10), cost, usefulLifeMonths: Number(life) }),
    onSuccess: () => { toast({ title: "Activo registrado" }); setName(""); setCost(""); qc.invalidateQueries({ queryKey: ["/api/modules/fixed-assets"] }); },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const depreciate = useMutation({
    mutationFn: () => moduleApi.depreciate({ year: now.getFullYear(), period: now.getMonth() + 1, date: now.toISOString().slice(0, 10) }),
    onSuccess: (r: any) => { toast({ title: `Depreciación`, description: `${r.charged} activos, ${money(r.total)}` }); qc.invalidateQueries({ queryKey: ["/api/modules/fixed-assets"] }); },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Activos Fijos</h1>
        <Button variant="outline" size="sm" className="gap-1" disabled={depreciate.isPending} onClick={() => depreciate.mutate()}>
          <Calculator className="h-4 w-4" /> Depreciar mes
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Nuevo activo</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
            <Input placeholder="Costo" value={cost} onChange={(e) => setCost(e.target.value)} className="max-w-[140px]" />
            <Input placeholder="Vida (meses)" value={life} onChange={(e) => setLife(e.target.value)} className="max-w-[140px]" />
            <Button size="sm" className="gap-1" disabled={!name || !cost || add.isPending} onClick={() => add.mutate()}><Plus className="h-4 w-4" /> Agregar</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Registro</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1.5">Activo</th><th className="py-1.5 text-right">Costo</th><th className="py-1.5 text-right">Depreciación acum.</th><th className="py-1.5 text-right">Valor en libros</th><th className="py-1.5">Estado</th></tr></thead>
            <tbody>
              {(assets.data?.assets ?? []).map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="py-1.5">{a.name}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(a.cost)}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(a.accumulated_depreciation)}</td>
                  <td className="py-1.5 text-right font-medium tabular-nums">{money(a.book_value)}</td>
                  <td className="py-1.5"><Badge variant={a.status === "active" ? "secondary" : "outline"}>{a.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          {(assets.data?.assets ?? []).length === 0 && <p className="py-4 text-center text-muted-foreground">Sin activos registrados.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
