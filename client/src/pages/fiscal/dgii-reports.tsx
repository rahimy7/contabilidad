import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fiscalApi } from "@/lib/accounting-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Download, Plus } from "lucide-react";

type Form = "606" | "607" | "608" | "609";
const FORM_LABEL: Record<Form, string> = {
  "606": "606 — Compras",
  "607": "607 — Ventas",
  "608": "608 — Anulados",
  "609": "609 — Pagos al Exterior",
};

export default function DgiiReportsPage() {
  const now = new Date();
  const [form, setForm] = useState<Form>("607");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["/api/fiscal/reports", form, year, month],
    queryFn: () => fiscalApi.report(form, year, month),
  });

  const it1 = useQuery({
    queryKey: ["/api/fiscal/reports/it1", year, month],
    queryFn: () => fiscalApi.it1(year, month),
  });
  const ir17 = useQuery({
    queryKey: ["/api/fiscal/reports/ir17", year, month],
    queryFn: () => fiscalApi.ir17(year, month),
  });

  /**
   * Downloads the upload-ready TXT. The endpoint needs the auth header, so this
   * fetches with the token and saves the blob rather than pointing an anchor at
   * the URL (which would arrive unauthenticated).
   */
  const download = async () => {
    const token = localStorage.getItem("auth_token");
    const res = await fetch(fiscalApi.reportUrl(form, year, month), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${form}_${year}${String(month).padStart(2, "0")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Reportes DGII</h1>
        <p className="text-sm text-muted-foreground">Formatos 606, 607, 608 y declaraciones IT-1 / IR-17</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-end gap-3">
          <div className="flex gap-1">
            {(Object.keys(FORM_LABEL) as Form[]).map((f) => (
              <Button key={f} variant={f === form ? "default" : "outline"} size="sm" onClick={() => setForm(f)}>
                {f}
              </Button>
            ))}
          </div>
          <label className="text-sm">
            Año
            <Input type="number" className="w-24" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </label>
          <label className="text-sm">
            Mes
            <Input
              type="number"
              className="w-20"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            />
          </label>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Generar
          </Button>
          <Button size="sm" className="gap-1" onClick={download} disabled={!data || data.recordCount === 0}>
            <Download className="h-4 w-4" /> Descargar TXT
          </Button>
          {form === "609" && <ForeignPaymentDialog year={year} month={month} />}
        </CardHeader>
        <CardContent>
          <CardTitle className="mb-2 text-base">{FORM_LABEL[form]}</CardTitle>
          {(isLoading || isFetching) && <p className="text-muted-foreground">Generando…</p>}
          {error && <p className="text-destructive">No se pudo generar el reporte.</p>}
          {data && !isFetching && (
            <>
              <p className="mb-2 text-sm text-muted-foreground">
                {data.recordCount} registro(s) · encabezado <code className="text-xs">{data.header}</code>
              </p>
              <pre className="max-h-[420px] overflow-auto rounded-md bg-muted p-3 text-xs">
                {data.lines.length ? data.lines.join("\n") : "Sin registros en el período."}
              </pre>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">IT-1 — ITBIS del mes</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {it1.data ? (
              <>
                <Row label="ITBIS en ventas (débito fiscal)" value={it1.data.itbisCharged} />
                <Row label="ITBIS en compras (crédito fiscal)" value={it1.data.itbisPaid} />
                <Row label="Retenciones que nos hicieron" value={it1.data.itbisWithheldFromUs} />
                <div className="mt-1 border-t pt-1.5">
                  <Row label="ITBIS a pagar" value={it1.data.balanceToPay} bold />
                </div>
              </>
            ) : <p className="text-muted-foreground">Cargando…</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">IR-17 — Retenciones de ISR</CardTitle></CardHeader>
          <CardContent>
            {ir17.data ? (
              ir17.data.lines.length ? (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1">Concepto</th><th className="py-1 text-right">Base</th><th className="py-1 text-right">Retenido</th></tr></thead>
                  <tbody>
                    {ir17.data.lines.map((l) => (
                      <tr key={l.concept} className="border-b last:border-0">
                        <td className="py-1">{l.label}</td>
                        <td className="py-1 text-right tabular-nums">{fmt(l.base)}</td>
                        <td className="py-1 text-right tabular-nums">{fmt(l.retained)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="border-t-2 font-semibold"><td className="py-1">Total a pagar</td><td className="py-1 text-right tabular-nums">{fmt(ir17.data.totalBase)}</td><td className="py-1 text-right tabular-nums">{fmt(ir17.data.totalRetained)}</td></tr></tfoot>
                </table>
              ) : <p className="text-muted-foreground">Sin retenciones de ISR en el período.</p>
            ) : <p className="text-muted-foreground">Cargando…</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const fmt = (v: string | number) =>
  Number(v ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? "font-semibold" : ""}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">{fmt(value)}</span>
    </div>
  );
}

const INCOME_TYPES: { value: string; label: string }[] = [
  { value: "servicios", label: "Servicios / Honorarios" },
  { value: "intereses", label: "Intereses" },
  { value: "dividendos", label: "Dividendos" },
  { value: "regalias", label: "Regalías" },
  { value: "alquileres", label: "Alquileres" },
  { value: "asistencia_tecnica", label: "Asistencia técnica" },
  { value: "remesas", label: "Remesas" },
  { value: "otras_rentas", label: "Otras rentas" },
];

function ForeignPaymentDialog({ year, month }: { year: number; month: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [country, setCountry] = useState("");
  const [incomeType, setIncomeType] = useState("servicios");
  const [grossAmount, setGrossAmount] = useState("");
  const [isrRate, setIsrRate] = useState("0.27");
  const paymentDate = `${year}-${String(month).padStart(2, "0")}-15`;

  const create = useMutation({
    mutationFn: () =>
      fiscalApi.recordForeignPayment({ beneficiaryName, country, incomeType, paymentDate, grossAmount, isrRate }),
    onSuccess: () => {
      toast({ title: "Pago al exterior registrado" });
      qc.invalidateQueries({ queryKey: ["/api/fiscal/reports"] });
      setBeneficiaryName(""); setCountry(""); setGrossAmount("");
      setOpen(false);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline" className="gap-1"><Plus className="h-4 w-4" /> Pago al exterior</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar pago al exterior</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="block text-sm">Beneficiario<Input value={beneficiaryName} onChange={(e) => setBeneficiaryName(e.target.value)} placeholder="Razón social del beneficiario" /></label>
          <label className="block text-sm">País<Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Estados Unidos" /></label>
          <label className="block text-sm">Tipo de renta
            <select value={incomeType} onChange={(e) => setIncomeType(e.target.value)} className="mt-1 block h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm">
              {INCOME_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <label className="block flex-1 text-sm">Monto pagado (DOP)<Input value={grossAmount} onChange={(e) => setGrossAmount(e.target.value)} placeholder="0.00" /></label>
            <label className="block w-28 text-sm">Tasa ISR<Input value={isrRate} onChange={(e) => setIsrRate(e.target.value)} placeholder="0.27" /></label>
          </div>
          <p className="text-xs text-muted-foreground">Se retiene {isrRate ? `${(Number(isrRate) * 100).toFixed(0)}%` : "27%"} de ISR y se contabiliza el asiento automáticamente.</p>
        </div>
        <DialogFooter>
          <Button disabled={!beneficiaryName || !grossAmount || create.isPending} onClick={() => create.mutate()}>Registrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
