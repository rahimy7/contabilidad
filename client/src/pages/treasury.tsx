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
import { DataGrid, PageHeader, StatusChip, amount, money, type Column } from "@/components/erp";

const today = () => new Date().toISOString().slice(0, 10);

interface Movement {
  id: number; txn_date: string; kind: string; memo?: string | null;
  direction: "in" | "out"; amount: string; cleared: boolean;
}

/**
 * El signo y el color dicen lo mismo dos veces a propósito: en una lista de
 * movimientos, distinguir una entrada de una salida no puede depender de que la
 * pantalla reproduzca bien el verde.
 */
const MOVEMENT_COLUMNS: Column<Movement>[] = [
  { key: "date", header: "Fecha", width: "110px", cell: (m) => String(m.txn_date).slice(0, 10) },
  {
    key: "memo", header: "Concepto",
    cell: (m) => (
      <span className="inline-flex items-center gap-1.5">
        {m.direction === "in"
          ? <ArrowDownLeft className="h-3.5 w-3.5 shrink-0 text-success" />
          : <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-destructive" />}
        {m.memo ?? m.kind}
      </span>
    ),
  },
  {
    key: "amount", header: "Monto", align: "right", width: "150px",
    cell: (m) => (
      <span className={m.direction === "in" ? "text-success" : ""}>
        {m.direction === "in" ? "+" : "−"}{amount(m.amount)}
      </span>
    ),
  },
  {
    key: "cleared", header: "Estado", width: "120px",
    cell: (m) =>
      m.cleared
        ? <StatusChip status="ok">Conciliado</StatusChip>
        : <StatusChip status="pending">Pendiente</StatusChip>,
  },
];

export default function TreasuryPage() {
  const [accountId, setAccountId] = useState<number | null>(null);
  const accounts = useQuery({ queryKey: ["/api/treasury/accounts"], queryFn: () => treasuryApi.accounts() });
  const selected = (accounts.data?.accounts ?? []).find((a) => a.id === accountId) ?? null;

  return (
    <div className="space-y-4">
      <PageHeader subtitle="Cuentas bancarias, movimientos y conciliación" />

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
        <CardTitle>Cuentas bancarias</CardTitle>
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
          <CardTitle>{account.name}</CardTitle>
          <p className="text-[12px] text-muted-foreground">Saldo en libros: <span className="font-medium tabular-nums">{money(account.balance)}</span></p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Movimiento</Button></DialogTrigger>
          <NewMovementDialog account={account} onDone={() => setOpen(false)} />
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        <DataGrid
          className="border-0"
          columns={MOVEMENT_COLUMNS}
          rows={(movements.data?.movements ?? []) as Movement[]}
          rowKey={(m) => m.id}
          isLoading={movements.isLoading}
          emptyMessage="Esta cuenta no tiene movimientos."
        />
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
        <CardTitle>Conciliación bancaria</CardTitle>
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
            <div className={`flex items-center justify-between border p-2.5 ${s.reconciled ? "border-success/40 bg-success/5" : "border-warning/40 bg-warning/10"}`}>
              <span className="text-[13px]">Diferencia: <span className="font-semibold tabular-nums">{money(s.difference)}</span></span>
              {isDraft && <Button size="sm" disabled={!s.reconciled || complete.isPending} onClick={() => complete.mutate()}>Completar conciliación</Button>}
              {!isDraft && <Badge variant="secondary">Completada</Badge>}
            </div>

            <DataGrid
              columns={[
                {
                  key: "check", header: "", width: "40px",
                  cell: (it: any) => (
                    <Checkbox
                      checked={it.cleared}
                      disabled={!isDraft || toggle.isPending}
                      onCheckedChange={() => toggle.mutate({ id: it.id, cleared: it.cleared })}
                    />
                  ),
                },
                { key: "date", header: "Fecha", width: "110px", cell: (it: any) => String(it.txn_date).slice(0, 10) },
                { key: "memo", header: "Concepto", cell: (it: any) => it.memo ?? it.kind },
                {
                  key: "amount", header: "Monto", align: "right", width: "150px",
                  cell: (it: any) => (
                    <span className={it.direction === "in" ? "text-success" : ""}>
                      {it.direction === "in" ? "+" : "−"}{amount(it.amount)}
                    </span>
                  ),
                },
              ]}
              rows={s.items as any[]}
              rowKey={(it: any) => it.id}
              emptyMessage="No hay movimientos hasta la fecha del estado."
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border p-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[17px] font-light tabular-nums">{amount(value)}</div>
    </div>
  );
}
