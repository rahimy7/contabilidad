import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { moduleApi } from "@/lib/accounting-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Plus, Calculator } from "lucide-react";
import { DataGrid, PageHeader, StatusChip, amount, money, type Column } from "@/components/erp";

interface Asset {
  id: number;
  name: string;
  cost: string;
  accumulated_depreciation: string;
  book_value: string;
  status: string;
}

/**
 * El valor en libros va en seminegrita porque es la cifra que se consulta: el
 * costo y la depreciación acumulada están para justificarla, no para leerse
 * primero.
 */
const COLUMNS: Column<Asset>[] = [
  { key: "name", header: "Activo", cell: (a) => a.name },
  { key: "cost", header: "Costo", align: "right", cell: (a) => amount(a.cost) },
  { key: "dep", header: "Depreciación acum.", align: "right", cell: (a) => amount(a.accumulated_depreciation) },
  { key: "book", header: "Valor en libros", align: "right", cell: (a) => <span className="font-semibold">{amount(a.book_value)}</span> },
  {
    key: "status", header: "Estado", width: "110px",
    cell: (a) =>
      a.status === "active"
        ? <StatusChip status="ok">En uso</StatusChip>
        : <StatusChip status="draft">{a.status}</StatusChip>,
  },
];

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
    <div className="space-y-4">
      <PageHeader
        subtitle="Registro de activos y su depreciación acumulada"
        actions={
          <Button variant="outline" className="gap-1" disabled={depreciate.isPending} onClick={() => depreciate.mutate()}>
            <Calculator className="h-4 w-4" /> Depreciar mes
          </Button>
        }
      />

      <Card>
        <CardHeader><CardTitle>Nuevo activo</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
            <Input placeholder="Costo" value={cost} onChange={(e) => setCost(e.target.value)} className="max-w-[140px]" />
            <Input placeholder="Vida (meses)" value={life} onChange={(e) => setLife(e.target.value)} className="max-w-[140px]" />
            <Button className="gap-1" disabled={!name || !cost || add.isPending} onClick={() => add.mutate()}><Plus className="h-4 w-4" /> Agregar</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Registro</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataGrid
            className="border-0"
            columns={COLUMNS}
            rows={(assets.data?.assets ?? []) as Asset[]}
            rowKey={(a) => a.id}
            isLoading={assets.isLoading}
            emptyMessage="Sin activos registrados."
          />
        </CardContent>
      </Card>

    </div>
  );
}
