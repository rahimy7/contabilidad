import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Ban, CheckCircle2, PauseCircle, PlayCircle, Send, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { DataGrid, StatusChip, amount, money, type Column, type Status } from "@/components/erp";
import {
  CREDIT_APPLICATION_STATUS, CREDIT_LINE_STATUS, GUARANTEE_TYPES, type GuaranteeType,
} from "@shared/customer-fiscal";
import { customersApi, type CreditApplication, type CreditEvent, type CustomerDetail } from "@/lib/customers-api";
import { CreditChip, Field, apiErrorOf, fmtDate, fmtDateTime } from "./fields";

const APP_CHIP: Record<string, Status> = { pending: "pending", approved: "ok", rejected: "overdue", cancelled: "void" };

const EVENT_LABEL: Record<string, string> = {
  requested: "Solicitud registrada",
  approval_step: "Aprobación parcial",
  approved: "Línea aprobada",
  rejected: "Solicitud rechazada",
  cancelled: "Solicitud cancelada",
  suspended: "Línea suspendida",
  blocked: "Línea bloqueada",
  reactivated: "Línea reactivada",
};

const statusLabel = (s: string | null) => (s ? CREDIT_LINE_STATUS[s as keyof typeof CREDIT_LINE_STATUS] ?? s : "—");

export function CreditPanel({
  detail, userId, userRole, onChanged,
}: {
  detail: CustomerDetail;
  userId: number;
  userRole: string;
  onChanged: () => void;
}) {
  const { customer, credit, applications, events } = detail;
  const pending = applications.find((a) => a.status === "pending") ?? null;
  const [requestOpen, setRequestOpen] = useState(false);
  const [resolve, setResolve] = useState<{ app: CreditApplication; action: "approve" | "reject" } | null>(null);
  const [statusChange, setStatusChange] = useState<"active" | "suspended" | "blocked" | null>(null);

  const limit = Number(credit.limit);
  const used = Number(credit.used);
  const usedPct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const canApprove = pending && Number(pending.requestedBy) !== Number(userId);

  const appColumns: Column<CreditApplication>[] = [
    { key: "date", header: "Fecha", width: "120px", className: "whitespace-nowrap", cell: (a) => fmtDate(a.createdAt) },
    { key: "requested", header: "Solicitado", align: "right", className: "whitespace-nowrap", cell: (a) => `${amount(a.requestedLimit)} · ${a.requestedDays} d` },
    { key: "approved", header: "Aprobado", align: "right", className: "whitespace-nowrap", cell: (a) => (a.approvedLimit ? `${amount(a.approvedLimit)} · ${a.approvedDays} d` : "—") },
    { key: "guarantee", header: "Garantía", cell: (a) => GUARANTEE_TYPES[a.guaranteeType] ?? a.guaranteeType },
    { key: "status", header: "Estado", width: "110px", cell: (a) => <StatusChip status={APP_CHIP[a.status]}>{CREDIT_APPLICATION_STATUS[a.status]}</StatusChip> },
    { key: "by", header: "Solicitó / resolvió", cell: (a) => <span className="text-[12px]">{a.requestedByName ?? "—"}{a.resolvedByName ? ` → ${a.resolvedByName}` : ""}</span> },
    { key: "comment", header: "Justificación / resolución", cell: (a) => <span className="line-clamp-2 text-[12px]">{a.resolutionComment ?? a.justification}</span> },
  ];

  const eventColumns: Column<CreditEvent>[] = [
    { key: "date", header: "Fecha", width: "170px", className: "whitespace-nowrap", cell: (e) => fmtDateTime(e.createdAt) },
    { key: "event", header: "Evento", cell: (e) => EVENT_LABEL[e.event] ?? e.event },
    {
      key: "status", header: "Estado",
      cell: (e) => (e.fromStatus !== e.toStatus && e.toStatus ? `${statusLabel(e.fromStatus)} → ${statusLabel(e.toStatus)}` : "—"),
    },
    {
      key: "limit", header: "Límite", align: "right", className: "whitespace-nowrap",
      cell: (e) => (e.limitAfter !== null && e.limitBefore !== e.limitAfter ? `${amount(e.limitBefore)} → ${amount(e.limitAfter)}` : e.limitAfter ? amount(e.limitAfter) : "—"),
    },
    { key: "days", header: "Plazo", align: "right", className: "whitespace-nowrap", cell: (e) => (e.daysAfter !== null ? `${e.daysBefore ?? 0} → ${e.daysAfter} d` : "—") },
    { key: "reason", header: "Motivo", cell: (e) => <span className="line-clamp-2 text-[12px]">{e.reason ?? "—"}</span> },
    { key: "actor", header: "Usuario", cell: (e) => e.actorName ?? "—" },
  ];

  return (
    <div className="space-y-4">
      {/* Línea vigente */}
      <section className="border border-border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-subtle px-4 py-2">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold">Línea de crédito</h3>
            <CreditChip status={credit.status} pending={!!pending} />
          </div>
          <div className="flex flex-wrap gap-2">
            {customer.isActive && credit.status !== "blocked" && !pending && (
              <Button size="sm" onClick={() => setRequestOpen(true)}>
                <Send className="mr-1.5 h-3.5 w-3.5" />
                {credit.status === "none" ? "Solicitar crédito" : "Solicitar cambio de límite"}
              </Button>
            )}
            {credit.status === "active" && (
              <Button size="sm" variant="outline" onClick={() => setStatusChange("suspended")}>
                <PauseCircle className="mr-1.5 h-3.5 w-3.5" /> Suspender
              </Button>
            )}
            {(credit.status === "active" || credit.status === "suspended") && (
              <Button size="sm" variant="outline" className="text-destructive" onClick={() => setStatusChange("blocked")}>
                <Ban className="mr-1.5 h-3.5 w-3.5" /> Bloquear
              </Button>
            )}
            {(credit.status === "suspended" || credit.status === "blocked") && (
              <Button size="sm" variant="outline" onClick={() => setStatusChange("active")}>
                <PlayCircle className="mr-1.5 h-3.5 w-3.5" /> Reactivar
              </Button>
            )}
          </div>
        </header>
        <div className="grid gap-x-8 gap-y-3 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Límite aprobado" value={limit > 0 ? money(credit.limit) : "Sin límite aprobado"} />
          <Metric label="Plazo" value={credit.days > 0 ? `${credit.days} días` : "—"} hint={credit.gracePeriodDays > 0 ? `${credit.gracePeriodDays} días de gracia` : undefined} />
          <Metric label="Utilizado" value={money(credit.used)} hint={`${credit.openItems} partida(s) abierta(s)`} />
          <Metric
            label="Disponible"
            value={credit.status === "active" ? money(credit.available) : "No disponible"}
            tone={credit.status === "active" && Number(credit.available) > 0 ? "good" : "muted"}
          />
          <Metric label="Vencido" value={money(credit.overdue)} tone={Number(credit.overdue) > 0 ? "bad" : undefined}
            hint={credit.maxDaysOverdue ? `hasta ${credit.maxDaysOverdue} días de atraso` : undefined} />
          <Metric label="Próximo vencimiento" value={fmtDate(credit.nextDue) ?? "—"} />
          <Metric label="Aprobado por" value={customer.creditApprovedByName ?? "—"} hint={fmtDate(customer.creditApprovedAt) ?? undefined} />
          <Metric
            label="Revisión de la línea"
            value={fmtDate(customer.creditReviewDate) ?? "—"}
            tone={customer.creditReviewDate && customer.creditReviewDate < new Date().toISOString().slice(0, 10) ? "bad" : undefined}
            hint={customer.creditReviewDate && customer.creditReviewDate < new Date().toISOString().slice(0, 10) ? "Revisión vencida" : undefined}
          />
          {limit > 0 && (
            <div className="sm:col-span-2 lg:col-span-4">
              <div className="mb-1 flex justify-between text-[11.5px] text-muted-foreground">
                <span>Uso de la línea</span>
                <span className="tabular-nums">{usedPct}%</span>
              </div>
              <div className="h-1.5 w-full bg-muted">
                <div
                  className={`h-1.5 ${usedPct >= 90 ? "bg-destructive" : usedPct >= 70 ? "bg-warning" : "bg-success"}`}
                  style={{ width: `${usedPct}%` }}
                />
              </div>
            </div>
          )}
          {customer.creditStatusReason && credit.status !== "none" && (
            <p className="text-[12px] text-muted-foreground sm:col-span-2 lg:col-span-4">
              Último cambio de estado ({fmtDateTime(customer.creditStatusChangedAt)}): {customer.creditStatusReason}
            </p>
          )}
        </div>
      </section>

      {/* Solicitud en evaluación */}
      {pending && (
        <section className="border border-warning/40 bg-warning/5">
          <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0 space-y-1 text-[13px]">
              <p className="font-semibold">
                Solicitud en evaluación: {money(pending.requestedLimit)} a {pending.requestedDays} días
              </p>
              <p className="text-muted-foreground">
                Solicitada por {pending.requestedByName ?? "—"} el {fmtDateTime(pending.createdAt)}
                {pending.approverRole ? ` · aprueba rol ${pending.approverRole}` : ""}
                {pending.requiredApprovals && pending.requiredApprovals > 1 ? ` · ${pending.receivedApprovals} de ${pending.requiredApprovals} firmas` : ""}
              </p>
              <p>{pending.justification}</p>
              <p className="text-[12px] text-muted-foreground">
                Garantía: {GUARANTEE_TYPES[pending.guaranteeType]}
                {pending.guaranteeAmount ? ` por ${money(pending.guaranteeAmount)}` : ""}
                {pending.guaranteeNotes ? ` — ${pending.guaranteeNotes}` : ""}
                {pending.reviewDate ? ` · revisión ${fmtDate(pending.reviewDate)}` : ""}
              </p>
              {pending.referencesNotes && <p className="text-[12px] text-muted-foreground">Referencias: {pending.referencesNotes}</p>}
              {!canApprove && (
                <p className="text-[12px] text-warning">Usted registró esta solicitud: debe aprobarla otro usuario autorizado.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!canApprove} onClick={() => setResolve({ app: pending, action: "approve" })}>
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Aprobar
              </Button>
              <Button size="sm" variant="outline" disabled={!canApprove} onClick={() => setResolve({ app: pending, action: "reject" })}>
                <XCircle className="mr-1.5 h-3.5 w-3.5" /> Rechazar
              </Button>
              <CancelApplicationButton app={pending} onDone={onChanged} />
            </div>
          </div>
        </section>
      )}

      <div>
        <h3 className="mb-1.5 text-[13px] font-semibold">Solicitudes de crédito</h3>
        <DataGrid columns={appColumns} rows={applications} rowKey={(a) => a.id} emptyMessage="Sin solicitudes registradas." />
      </div>

      <div>
        <h3 className="mb-1.5 text-[13px] font-semibold">Bitácora de la línea</h3>
        <DataGrid columns={eventColumns} rows={events} rowKey={(e) => e.id} emptyMessage="Sin movimientos en la línea." />
      </div>

      <RequestCreditDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        customerId={customer.id}
        currentLimit={limit}
        currentDays={credit.days}
        onDone={onChanged}
      />
      {resolve && (
        <ResolveDialog
          app={resolve.app}
          action={resolve.action}
          onClose={() => setResolve(null)}
          onDone={onChanged}
        />
      )}
      {statusChange && (
        <StatusDialog
          customerId={customer.id}
          target={statusChange}
          isAdmin={["admin", "super_admin"].includes(userRole)}
          fromBlocked={credit.status === "blocked"}
          onClose={() => setStatusChange(null)}
          onDone={onChanged}
        />
      )}
    </div>
  );
}

function Metric({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" | "muted" }) {
  const color = tone === "bad" ? "text-destructive" : tone === "good" ? "text-success" : tone === "muted" ? "text-muted-foreground" : "";
  return (
    <div className="min-w-0">
      <p className="text-[11.5px] text-muted-foreground">{label}</p>
      <p className={`truncate text-[15px] font-medium tabular-nums ${color}`}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function CancelApplicationButton({ app, onDone }: { app: CreditApplication; onDone: () => void }) {
  const { toast } = useToast();
  const m = useMutation({
    mutationFn: () => customersApi.cancelCredit(app.id, "Cancelada por el usuario"),
    onSuccess: () => {
      toast({ title: "Solicitud cancelada" });
      onDone();
    },
    onError: (e) => toast({ title: "No se pudo cancelar", description: apiErrorOf(e).message, variant: "destructive" }),
  });
  return (
    <Button size="sm" variant="ghost" onClick={() => m.mutate()} disabled={m.isPending}>
      Cancelar solicitud
    </Button>
  );
}

const TERM_OPTIONS = [0, 15, 30, 45, 60, 90, 120];

function RequestCreditDialog({
  open, onOpenChange, customerId, currentLimit, currentDays, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerId: number;
  currentLimit: number;
  currentDays: number;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [limit, setLimit] = useState("");
  const [days, setDays] = useState(String(currentDays || 30));
  const [guaranteeType, setGuaranteeType] = useState<GuaranteeType>("ninguna");
  const [guaranteeAmount, setGuaranteeAmount] = useState("");
  const [guaranteeNotes, setGuaranteeNotes] = useState("");
  const [references, setReferences] = useState("");
  const [justification, setJustification] = useState("");
  const [reviewDate, setReviewDate] = useState("");

  const m = useMutation({
    mutationFn: () =>
      customersApi.requestCredit(customerId, {
        requestedLimit: Number(limit),
        requestedDays: Number(days),
        justification,
        guaranteeType,
        guaranteeAmount: guaranteeAmount ? Number(guaranteeAmount) : null,
        guaranteeNotes: guaranteeNotes || null,
        referencesNotes: references || null,
        reviewDate: reviewDate || null,
      }),
    onSuccess: () => {
      toast({ title: "Solicitud enviada a aprobación" });
      onOpenChange(false);
      setLimit("");
      setJustification("");
      setGuaranteeNotes("");
      setGuaranteeAmount("");
      setReferences("");
      onDone();
    },
    onError: (e) => toast({ title: "No se pudo registrar la solicitud", description: apiErrorOf(e).message, variant: "destructive" }),
  });

  const valid = Number(limit) > 0 && justification.trim().length >= 10;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{currentLimit > 0 ? "Solicitud de cambio de límite" : "Solicitud de línea de crédito"}</DialogTitle>
          <DialogDescription>
            La solicitud pasa al motor de aprobaciones. {currentLimit > 0 ? `La línea vigente (${money(currentLimit)} a ${currentDays} días) sigue rigiendo mientras se evalúa.` : "Hasta que se apruebe, el cliente sólo compra de contado."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Límite solicitado (RD$)" editing required>
            <Input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="decimal" placeholder="100000.00" autoFocus />
          </Field>
          <Field label="Plazo de pago" editing required>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TERM_OPTIONS.map((d) => (
                  <SelectItem key={d} value={String(d)}>{d === 0 ? "Contra entrega" : `${d} días`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Garantía" editing>
            <Select value={guaranteeType} onValueChange={(v) => setGuaranteeType(v as GuaranteeType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(GUARANTEE_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Monto de la garantía (RD$)" editing>
            <Input value={guaranteeAmount} onChange={(e) => setGuaranteeAmount(e.target.value)} inputMode="decimal" disabled={guaranteeType === "ninguna"} />
          </Field>
          {guaranteeType !== "ninguna" && (
            <Field label="Detalle de la garantía" editing span={2}>
              <Input value={guaranteeNotes} onChange={(e) => setGuaranteeNotes(e.target.value)} placeholder="Pagaré notarial No. 123, fiador…" />
            </Field>
          )}
          <Field label="Referencias comerciales y bancarias" editing span={2}>
            <Textarea value={references} onChange={(e) => setReferences(e.target.value)} rows={2} placeholder="Banco, cuenta desde, proveedores que le venden a crédito…" />
          </Field>
          <Field label="Justificación" editing required span={2}>
            <Textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={3} placeholder="Historial de compras, volumen esperado, capacidad de pago…" />
          </Field>
          <Field label="Fecha de revisión de la línea" editing>
            <Input type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={!valid || m.isPending}>Enviar a aprobación</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResolveDialog({
  app, action, onClose, onDone,
}: {
  app: CreditApplication;
  action: "approve" | "reject";
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [limit, setLimit] = useState(String(Number(app.requestedLimit)));
  const [days, setDays] = useState(String(app.requestedDays));
  const [comment, setComment] = useState("");
  const approving = action === "approve";

  const m = useMutation({
    mutationFn: () =>
      customersApi.resolveCredit(app.id, approving
        ? { action, approvedLimit: Number(limit), approvedDays: Number(days), comment: comment || undefined }
        : { action, comment }),
    onSuccess: (r) => {
      toast({
        title: r.status === "approved" ? "Línea aprobada" : r.status === "rejected" ? "Solicitud rechazada" : "Aprobación registrada",
        description: r.status === "pending" ? `Faltan firmas: ${r.receivedApprovals} de ${r.requiredApprovals}.` : undefined,
      });
      onClose();
      onDone();
    },
    onError: (e) => toast({ title: "No se pudo resolver", description: apiErrorOf(e).message, variant: "destructive" }),
  });

  const overRequested = Number(limit) > Number(app.requestedLimit);
  const valid = approving ? Number(limit) > 0 && !overRequested : comment.trim().length >= 5;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{approving ? "Aprobar línea de crédito" : "Rechazar solicitud"}</DialogTitle>
          <DialogDescription>
            Solicitado: {money(app.requestedLimit)} a {app.requestedDays} días por {app.requestedByName ?? "—"}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {approving && (
            <>
              <Field label="Límite aprobado (RD$)" editing error={overRequested ? "No puede superar lo solicitado." : null}>
                <Input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="decimal" />
              </Field>
              <Field label="Plazo aprobado" editing>
                <Select value={days} onValueChange={setDays}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from(new Set([...TERM_OPTIONS, app.requestedDays])).sort((a, b) => a - b).map((d) => (
                      <SelectItem key={d} value={String(d)}>{d === 0 ? "Contra entrega" : `${d} días`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </>
          )}
          <Field label={approving ? "Comentario" : "Motivo del rechazo"} editing required={!approving} span={2}>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant={approving ? "default" : "destructive"} onClick={() => m.mutate()} disabled={!valid || m.isPending}>
            {approving ? "Aprobar" : "Rechazar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_COPY = {
  suspended: { title: "Suspender la línea", verb: "Suspender", help: "Las ventas a crédito quedan detenidas hasta reactivarla; un supervisor puede autorizar una venta puntual." },
  blocked: { title: "Bloquear la línea", verb: "Bloquear", help: "No se le podrá vender a crédito ni con autorización. Sólo un administrador puede reactivarla." },
  active: { title: "Reactivar la línea", verb: "Reactivar", help: "El cliente vuelve a comprar a crédito dentro del límite aprobado." },
};

function StatusDialog({
  customerId, target, isAdmin, fromBlocked, onClose, onDone,
}: {
  customerId: number;
  target: "active" | "suspended" | "blocked";
  isAdmin: boolean;
  fromBlocked: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const copy = STATUS_COPY[target];
  const m = useMutation({
    mutationFn: () => customersApi.changeCreditStatus(customerId, { status: target, reason }),
    onSuccess: () => {
      toast({ title: `${copy.verb}: listo` });
      onClose();
      onDone();
    },
    onError: (e) => toast({ title: "No se pudo cambiar el estado", description: apiErrorOf(e).message, variant: "destructive" }),
  });
  const needsAdmin = target === "active" && fromBlocked && !isAdmin;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.help}</DialogDescription>
        </DialogHeader>
        <Field label="Motivo" editing required error={needsAdmin ? "Sólo un administrador puede reactivar una línea bloqueada." : null}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus
            placeholder={target === "active" ? "Saldó los vencidos, nueva garantía…" : "Mora de 60 días, cheque devuelto…"} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            variant={target === "blocked" ? "destructive" : "default"}
            onClick={() => m.mutate()}
            disabled={reason.trim().length < 5 || needsAdmin || m.isPending}
          >
            {copy.verb}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
