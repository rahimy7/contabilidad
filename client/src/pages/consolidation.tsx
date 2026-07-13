import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { consolidationApi } from "@/lib/accounting-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Network, Plus, Layers } from "lucide-react";

const money = (v: string | number) =>
  Number(v ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ConsolidationPage() {
  const [groupId, setGroupId] = useState<number | null>(null);
  const [runId, setRunId] = useState<number | null>(null);
  const groups = useQuery({ queryKey: ["/api/consolidation/groups"], queryFn: () => consolidationApi.groups() });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Network className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">Consolidación de Grupos</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <GroupsCard groups={groups.data?.groups ?? []} selectedId={groupId} onSelect={(id) => { setGroupId(id); setRunId(null); }} />
        {groupId ? (
          <div className="space-y-4">
            <MembersCard groupId={groupId} />
            <RunsCard groupId={groupId} onOpenRun={setRunId} />
            {runId && <ConsolidatedStatement runId={runId} />}
          </div>
        ) : (
          <Card><CardContent className="py-16 text-center text-muted-foreground">Selecciona o crea un grupo para consolidar.</CardContent></Card>
        )}
      </div>
    </div>
  );
}

function GroupsCard({ groups, selectedId, onSelect }: { groups: any[]; selectedId: number | null; onSelect: (id: number) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => consolidationApi.createGroup({ name }),
    onSuccess: (r) => { toast({ title: "Grupo creado" }); setName(""); qc.invalidateQueries({ queryKey: ["/api/consolidation/groups"] }); onSelect(r.group.id); },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <Card className="h-fit">
      <CardHeader><CardTitle className="text-base">Grupos</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {groups.map((g) => (
          <button key={g.id} onClick={() => onSelect(g.id)}
            className={`w-full rounded-md border p-2.5 text-left text-sm transition-colors ${selectedId === g.id ? "border-primary bg-muted" : "hover:bg-muted/50"}`}>
            <div className="font-medium">{g.name}</div>
            <div className="text-xs text-muted-foreground">Moneda {g.base_currency}</div>
          </button>
        ))}
        {groups.length === 0 && <p className="py-3 text-center text-xs text-muted-foreground">Aún no participas en ningún grupo.</p>}
        <div className="flex gap-2 pt-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nuevo grupo" className="h-8" />
          <Button size="sm" disabled={!name || create.isPending} onClick={() => create.mutate()}><Plus className="h-4 w-4" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MembersCard({ groupId }: { groupId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const members = useQuery({ queryKey: ["/api/consolidation/members", groupId], queryFn: () => consolidationApi.members(groupId) });
  const companies = useQuery({ queryKey: ["/api/companies"], queryFn: () => consolidationApi.companies() });
  const [companyId, setCompanyId] = useState("");
  const [pct, setPct] = useState("1.0");
  const [method, setMethod] = useState("full");

  const add = useMutation({
    mutationFn: () => consolidationApi.addMember(groupId, { companyId: Number(companyId), ownershipPct: pct, consolMethod: method }),
    onSuccess: () => { toast({ title: "Empresa agregada" }); setCompanyId(""); qc.invalidateQueries({ queryKey: ["/api/consolidation/members", groupId] }); qc.invalidateQueries({ queryKey: ["/api/consolidation/groups"] }); },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Empresas del grupo</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1.5">Empresa</th><th className="py-1.5">RNC</th><th className="py-1.5 text-right">Propiedad</th><th className="py-1.5">Método</th></tr></thead>
          <tbody>
            {(members.data?.members ?? []).map((m) => (
              <tr key={m.company_id} className="border-b last:border-0">
                <td className="py-1.5">{m.legal_name}</td>
                <td className="py-1.5 tabular-nums">{m.rnc}</td>
                <td className="py-1.5 text-right tabular-nums">{(Number(m.ownership_pct) * 100).toFixed(2)}%</td>
                <td className="py-1.5">{m.consol_method}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(members.data?.members ?? []).length === 0 && <p className="py-2 text-center text-muted-foreground">Sin empresas en el grupo.</p>}

        <div className="flex flex-wrap items-end gap-2 border-t pt-3">
          <label className="text-sm">Empresa
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="mt-1 block h-9 w-56 rounded-md border border-input bg-transparent px-2 text-sm">
              <option value="">Selecciona…</option>
              {(companies.data?.companies ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
            </select>
          </label>
          <label className="text-sm">% propiedad<Input value={pct} onChange={(e) => setPct(e.target.value)} className="w-24" /></label>
          <label className="text-sm">Método
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="mt-1 block h-9 w-36 rounded-md border border-input bg-transparent px-2 text-sm">
              <option value="full">Integración</option>
              <option value="proportional">Proporcional</option>
              <option value="equity">Participación</option>
            </select>
          </label>
          <Button size="sm" disabled={!companyId || add.isPending} onClick={() => add.mutate()}>Agregar</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RunsCard({ groupId, onOpenRun }: { groupId: number; onOpenRun: (id: number) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const runs = useQuery({ queryKey: ["/api/consolidation/runs", groupId], queryFn: () => consolidationApi.runs(groupId) });

  const consolidate = useMutation({
    mutationFn: () => consolidationApi.consolidate(groupId, { fiscalYear: year }),
    onSuccess: (r) => { toast({ title: `Consolidado`, description: `${r.memberCount} empresa(s)` }); qc.invalidateQueries({ queryKey: ["/api/consolidation/runs", groupId] }); onOpenRun(r.runId); },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Corridas de consolidación</CardTitle>
        <div className="flex items-end gap-2">
          <label className="text-sm">Año<Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-8 w-24" /></label>
          <Button size="sm" className="gap-1" disabled={consolidate.isPending} onClick={() => consolidate.mutate()}><Layers className="h-4 w-4" /> Consolidar</Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {(runs.data?.runs ?? []).map((r) => (
          <button key={r.id} onClick={() => onOpenRun(r.id)} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50">
            {r.fiscal_year}{r.period_no ? `-${String(r.period_no).padStart(2, "0")}` : ""} · {r.member_count} emp.
          </button>
        ))}
        {(runs.data?.runs ?? []).length === 0 && <p className="py-2 text-center text-sm text-muted-foreground">Sin corridas todavía.</p>}
      </CardContent>
    </Card>
  );
}

function ConsolidatedStatement({ runId }: { runId: number }) {
  const run = useQuery({ queryKey: ["/api/consolidation/run", runId], queryFn: () => consolidationApi.run(runId) });
  const d = run.data;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Balance de comprobación consolidado</CardTitle>
        {d && <Badge variant={d.balanced ? "secondary" : "destructive"}>{d.balanced ? "Cuadrado" : "Descuadrado"}</Badge>}
      </CardHeader>
      <CardContent>
        {d ? (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1.5">Cuenta</th><th className="py-1.5 text-right">Débito</th><th className="py-1.5 text-right">Crédito</th></tr></thead>
            <tbody>
              {d.lines.map((l: any) => (
                <tr key={l.account_code} className="border-b last:border-0">
                  <td className="py-1.5"><span className="tabular-nums text-muted-foreground">{l.account_code}</span> {l.account_name}</td>
                  <td className="py-1.5 text-right tabular-nums">{Number(l.debit) ? money(l.debit) : ""}</td>
                  <td className="py-1.5 text-right tabular-nums">{Number(l.credit) ? money(l.credit) : ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t-2 font-semibold"><td className="py-1.5">Totales</td><td className="py-1.5 text-right tabular-nums">{money(d.totalDebit)}</td><td className="py-1.5 text-right tabular-nums">{money(d.totalCredit)}</td></tr></tfoot>
          </table>
        ) : <p className="text-muted-foreground">Cargando…</p>}

        {d && d.eliminations.length > 0 && (
          <div className="mt-5 border-t pt-4">
            <p className="mb-2 text-sm font-medium">Eliminaciones intercompañía</p>
            <p className="mb-2 text-xs text-muted-foreground">
              Lo que el grupo hizo consigo mismo se cancela: la venta interna, su costo, el margen aún no realizado
              en inventario, y la deuda entre filiales.
            </p>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1">Cuenta</th><th className="py-1">Concepto</th><th className="py-1 text-right">Débito</th><th className="py-1 text-right">Crédito</th></tr></thead>
              <tbody>
                {d.eliminations.map((l: any, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-1"><span className="tabular-nums text-muted-foreground">{l.account_code}</span> {l.account_name}</td>
                    <td className="py-1 text-xs text-muted-foreground">{l.note}</td>
                    <td className="py-1 text-right tabular-nums">{Number(l.debit) ? money(l.debit) : ""}</td>
                    <td className="py-1 text-right tabular-nums">{Number(l.credit) ? money(l.credit) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
