import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { FileSpreadsheet, Download, BarChart3 } from "lucide-react";

/** Reportes descargables en Excel. */
export default function ReportsExportPage() {
  const { toast } = useToast();
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const [range, setRange] = useState({ from: firstOfMonth, to: today });
  const [companyId, setCompanyId] = useState("1");
  const [agingKind, setAgingKind] = useState<"ar" | "ap">("ar");

  const download = async (url: string, filename: string) => {
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      toast({ title: "Descarga completa" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <FileSpreadsheet className="w-8 h-8 text-green-600" />
        <div>
          <h1 className="text-2xl font-bold">Reportes Excel</h1>
          <p className="text-muted-foreground">Descarga reportes en formato .xlsx</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Parámetros comunes</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Desde</Label>
              <Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
            </div>
            <div>
              <Label>Hasta</Label>
              <Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
            </div>
            <div>
              <Label>Company ID</Label>
              <Input type="number" value={companyId} onChange={(e) => setCompanyId(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <ReportCard
          title="Estado de Resultados (P&L)"
          description="Ingresos, gastos y resultado del período"
          icon={<BarChart3 className="w-5 h-5" />}
          onDownload={() => download(
            `/api/reports/pnl.xlsx?companyId=${companyId}&from=${range.from}&to=${range.to}`,
            `pnl-${range.from}-${range.to}.xlsx`,
          )}
        />

        <ReportCard
          title="Aging Cuentas por Cobrar/Pagar"
          description="Envejecimiento de saldos por bucket"
          icon={<BarChart3 className="w-5 h-5" />}
          extraControls={
            <Select value={agingKind} onValueChange={(v) => setAgingKind(v as any)}>
              <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ar">Cuentas por Cobrar</SelectItem>
                <SelectItem value="ap">Cuentas por Pagar</SelectItem>
              </SelectContent>
            </Select>
          }
          onDownload={() => download(
            `/api/reports/aging.xlsx?companyId=${companyId}&kind=${agingKind}&asOf=${range.to}`,
            `aging-${agingKind}-${range.to}.xlsx`,
          )}
        />

        <ReportCard
          title="Ventas por Vendedor"
          description="Ranking de vendedores por revenue"
          icon={<BarChart3 className="w-5 h-5" />}
          onDownload={() => download(
            `/api/reports/sales-by-rep.xlsx?from=${range.from}&to=${range.to}`,
            `ventas-por-vendedor-${range.from}-${range.to}.xlsx`,
          )}
        />

        <ReportCard
          title="Top Clientes"
          description="Top 100 clientes por revenue del período"
          icon={<BarChart3 className="w-5 h-5" />}
          onDownload={() => download(
            `/api/reports/top-customers.xlsx?from=${range.from}&to=${range.to}`,
            `top-clientes-${range.from}-${range.to}.xlsx`,
          )}
        />

        <ReportCard
          title="Top Productos"
          description="Top 100 productos por revenue del período"
          icon={<BarChart3 className="w-5 h-5" />}
          onDownload={() => download(
            `/api/reports/top-products.xlsx?from=${range.from}&to=${range.to}`,
            `top-productos-${range.from}-${range.to}.xlsx`,
          )}
        />
      </div>
    </div>
  );
}

function ReportCard({ title, description, icon, onDownload, extraControls }: any) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-2">
          {icon}
          <div className="flex-1">
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="text-xs">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {extraControls}
        <Button className="w-full mt-2" onClick={onDownload}>
          <Download className="w-4 h-4 mr-2" /> Descargar .xlsx
        </Button>
      </CardContent>
    </Card>
  );
}
