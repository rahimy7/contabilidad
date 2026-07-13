import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { treasuryApi } from "@/lib/accounting-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Landmark, ArrowDownLeft, ArrowUpRight } from "lucide-react";

const money = (v: string | number) =>
  Number(v ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);

export default function TreasuryPage() {
  const [accountId, setAccountId] = useState<number | null>(null);
  const accounts = useQuery({ queryKey: ["/api/treasury/accounts"], queryFn: () => treasuryApi.accounts() });
  const selected = (accounts.data?.accounts ?? []).find((a) => a.id === accountId) ?? null;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Landmark className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">Tesorería</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <AccountsCard
          accounts={accounts.data?.accounts ?? []}
          selectedId={accountId}
          onSelect={setAccountId}
        />
        {selected ? (
          <div className="space-y-4">
            <MovementsCard account={selected} />
            <ReconciliationCard account={selected} />
          </div>
        ) : (
          <Card><CardContent className="py-16 text-center text-muted-foreground">
            Selecciona una cuenta bancaria para ver sus movimientos y conciliación.
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}

function AccountsCard({ accounts, selectedId, onSelect }: { accounts: any[]; selectedId: number | null; onSelect: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="h-fit">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Cuentas bancarias</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" variant="outline" className="gap-1"><Plus className="h-4 w-4" /> Nueva</Button></DialogTrigger>
          <NewAccountDialog onDone={() => setOpen(false)} />
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-1">
        {accounts.map((a) => (
          <button
            key={a.id}
            onClick={() => onSelect(a.id)}
            className={`w-full rounded-md border p-3 text-left transition-colors ${selectedId === a.id ? "border-primary bg-muted" : "hover:bg-muted/50"}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{a.name}</span>
              <span className="tabular-nums text-sm">{money(a.balance)}</span>
            </div>
            <div className="text-xs text-muted-foreground">{a.bank_name ?? a.code} · {a.currency}</div>
          </button>
        ))}
        {accounts.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Sin cuentas registradas.</p>}
      </CardContent>
    </Card>
  );
}

function NewAccountDialog({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  const create = useMutation({
    mutationFn: () => treasuryApi.openAccount({ code, name, bankName, accountNumber }),
    onSuccess: () => {
      toast({ title: "Cuenta creada" });
      qc.invalidateQueries({ queryKey: ["/api/treasury/accounts"] });
      onDone();
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Nueva cuenta bancaria</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <label className="block text-sm">Código<Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="BCO-001" /></label>
        <label className="block text-sm">Nombre<Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cuenta Corriente Principal" /></label>
        <label className="block text-sm">Banco<Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Banco de Reservas" /></label>
        <label className="block text-sm">No. de cuenta<Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} /></label>
      </div>
      <DialogFooter>
        <Button disabled={!code || !name || create.isPending} onClick={() => create.mutate()}>Crear</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function MovementsCard({ account }: { account: any }) {
  const [open, setOpen] = useState(false);
  const movements = useQuery({
    queryKey: ["/api/treasury/accounts", account.id, "movements"],
    queryFn: () => treasuryApi.movements(account.id),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{account.name}</CardTitle>
          <p className="text-sm text-muted-foreground">Saldo en libros: <span className="font-medium tabular-nums">{money(account.balance)}</span></p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Movimiento</Button></DialogTrigger>
          <NewMovementDialog account={account} onDone={() => setOpen(false)} />
        </Dialog>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1.5">Fecha</th><th className="py-1.5">Concepto</th><th className="py-1.5 text-right">Monto</th><th className="py-1.5">Estado</th></tr></thead>
          <tbody>
            {(movements.data?.movements ?? []).map((m) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="py-1.5">{String(m.txn_date).slice(0, 10)}</td>
                <td className="py-1.5">
                  <span className="inline-flex items-center gap-1">
                    {m.direction === "in" ? <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" /> : <ArrowUpRight className="h-3.5 w-3.5 text-rose-600" />}
                    {m.memo ?? m.kind}
                  </span>
                </td>
                <td className={`py-1.5 text-right tabular-nums ${m.direction === "in" ? "text-emerald-600" : ""}`}>
                  {m.direction === "in" ? "+" : "−"}{money(m.amount)}
                </td>
                <td className="py-1.5"><Badge variant={m.cleared ? "secondary" : "outline"}>{m.cleared ? "conciliado" : "pendiente"}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        {(movements.data?.movements ?? []).length === 0 && <p className="py-4 text-center text-muted-foreground">Sin movimientos.</p>}
      </CardContent>
    </Card>
  );
}

function NewMovementDialog({ account, onDone }: { account: any; onDone: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [amount, setAmount] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [kind, setKind] = useState("payment");
  const [memo, setMemo] = useState("");
  const [txnDate, setTxnDate] = useState(today());

  const create = useMutation({
    mutationFn: () =>
      treasuryApi.recordMovement({
        bankAccountId: account.id, txnDate, direction, amount,
        kind, counterpartyAccountRef: counterparty, memo,
      }),
    onSuccess: () => {
      toast({ title: "Movimiento registrado" });
      qc.invalidateQueries({ queryKey: ["/api/treasury/accounts"] });
      onDone();
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Nuevo movimiento — {account.name}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={direction === "in" ? "default" : "outline"} className="flex-1" onClick={() => { setDirection("in"); setKind("deposit"); }}>Entrada</Button>
          <Button type="button" size="sm" variant={direction === "out" ? "default" : "outline"} className="flex-1" onClick={() => { setDirection("out"); setKind("payment"); }}>Salida</Button>
        </div>
        <label className="block text-sm">Fecha<Input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} /></label>
        <label className="block text-sm">Monto<Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></label>
        <label className="block text-sm">Cuenta de contrapartida (código)<Input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder={direction === "in" ? "4.1.01.001" : "5.2.02.001"} /></label>
        <label className="block text-sm">Concepto<Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Descripción" /></label>
      </div>
      <DialogFooter>
        <Button disabled={!amount || !counterparty || create.isPending} onClick={() => create.mutate()}>Registrar</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ReconciliationCard({ account }: { account: any }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [reconId, setReconId] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [stmtDate, setStmtDate] = useState(today());
  const [stmtBalance, setStmtBalance] = useState("");

  const recons = useQuery({
    queryKey: ["/api/treasury/reconciliations", account.id],
    queryFn: () => treasuryApi.reconciliations(account.id),
  });
  const summary = useQuery({
    queryKey: ["/api/treasury/reconciliations", reconId, "summary"],
    queryFn: () => treasuryApi.reconciliation(reconId!),
    enabled: reconId != null,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/treasury/reconciliations"] });
    qc.invalidateQueries({ queryKey: ["/api/treasury/accounts"] });
    if (reconId != null) summary.refetch();
  };

  const start = useMutation({
    mutationFn: () => treasuryApi.startReconciliation({ bankAccountId: account.id, statementDate: stmtDate, statementBalance: stmtBalance }),
    onSuccess: (r) => { setReconId(r.id); setStarting(false); setStmtBalance(""); invalidate(); },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });
  const toggle = useMutation({
    mutationFn: ({ id, cleared }: { id: number; cleared: boolean }) =>
      cleared ? treasuryApi.unclear(reconId!, [id]) : treasuryApi.clear(reconId!, [id]),
    onSuccess: invalidate,
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });
  const complete = useMutation({
    mutationFn: () => treasuryApi.complete(reconId!),
    onSuccess: () => { toast({ title: "Conciliación completada" }); invalidate(); },
    onError: (e: any) => toast({ variant: "destructive", title: "No se puede completar", description: e.message }),
  });

  const s = summary.data;
  const isDraft = s?.status === "draft";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Conciliación bancaria</CardTitle>
        {!starting && <Button size="sm" variant="outline" className="gap-1" onClick={() => setStarting(true)}><Plus className="h-4 w-4" /> Nueva conciliación</Button>}
      </CardHeader>
      <CardContent className="space-y-4">
        {starting && (
          <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
            <label className="text-sm">Fecha del estado<Input type="date" value={stmtDate} onChange={(e) => setStmtDate(e.target.value)} className="w-40" /></label>
            <label className="text-sm">Saldo del estado<Input value={stmtBalance} onChange={(e) => setStmtBalance(e.target.value)} placeholder="0.00" className="w-40" /></label>
            <Button size="sm" disabled={!stmtBalance || start.isPending} onClick={() => start.mutate()}>Iniciar</Button>
            <Button size="sm" variant="ghost" onClick={() => setStarting(false)}>Cancelar</Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(recons.data?.reconciliations ?? []).map((r) => (
            <button key={r.id} onClick={() => setReconId(r.id)}
              className={`rounded-md border px-3 py-1.5 text-sm ${reconId === r.id ? "border-primary bg-muted" : "hover:bg-muted/50"}`}>
              {String(r.statement_date).slice(0, 10)} · {money(r.statement_balance)}
              {r.status === "completed" && <Badge variant="secondary" className="ml-2">✓</Badge>}
            </button>
          ))}
        </div>

        {s && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Saldo del estado" value={s.statementBalance} />
              <Metric label="Conciliado" value={s.clearedBalance} />
              <Metric label="Depósitos en tránsito" value={s.depositsInTransit} />
              <Metric label="Cheques pendientes" value={s.outstandingChecks} />
            </div>
            <div className={`flex items-center justify-between rounded-md border p-3 ${s.reconciled ? "border-emerald-500/50 bg-emerald-500/5" : "border-amber-500/50 bg-amber-500/5"}`}>
              <span className="text-sm">Diferencia: <span className="font-semibold tabular-nums">{money(s.difference)}</span></span>
              {isDraft && <Button size="sm" disabled={!s.reconciled || complete.isPending} onClick={() => complete.mutate()}>Completar conciliación</Button>}
              {!isDraft && <Badge variant="secondary">Completada</Badge>}
            </div>

            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1.5 w-8" /><th className="py-1.5">Fecha</th><th className="py-1.5">Concepto</th><th className="py-1.5 text-right">Monto</th></tr></thead>
              <tbody>
                {s.items.map((it: any) => (
                  <tr key={it.id} className="border-b last:border-0">
                    <td className="py-1.5">
                      <Checkbox checked={it.cleared} disabled={!isDraft || toggle.isPending} onCheckedChange={() => toggle.mutate({ id: it.id, cleared: it.cleared })} />
                    </td>
                    <td className="py-1.5">{String(it.txn_date).slice(0, 10)}</td>
                    <td className="py-1.5">{it.memo ?? it.kind}</td>
                    <td className={`py-1.5 text-right tabular-nums ${it.direction === "in" ? "text-emerald-600" : ""}`}>
                      {it.direction === "in" ? "+" : "−"}{money(it.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {s.items.length === 0 && <p className="py-4 text-center text-muted-foreground">No hay movimientos hasta la fecha del estado.</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums">{money(value)}</div>
    </div>
  );
}
