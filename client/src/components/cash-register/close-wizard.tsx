import { useState, useEffect, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Landmark, Users, User, Banknote, CreditCard, ArrowRightLeft, Clock,
  ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, FileText,
  Loader2, DollarSign,
} from "lucide-react";

const DISCREPANCY_THRESHOLD = 100;

const fmt = (value: string | number | null | undefined) => {
  const num = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  if (isNaN(num)) return "RD$ 0.00";
  return new Intl.NumberFormat("es-DO", {
    style: "currency", currency: "DOP", currencyDisplay: "symbol",
  }).format(num);
};

const diffColor = (diff: number) =>
  diff > 0 ? "text-green-600" : diff < 0 ? "text-red-600" : "text-gray-600";

interface CloseWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeUsers: any[];
  stats: any;                                  // currentData.stats
  onCashierChange: (cashierId: string) => void; // called when user changes cashier mid-wizard
  isLoadingStats: boolean;
  onSubmit: (payload: any) => void;
  isPending: boolean;
}

type Step =
  | "mode"
  | "cashier"
  | "opening"
  | "cash"
  | "card"
  | "transfer"
  | "credit"
  | "note"
  | "review";

export function CloseWizard({
  open, onOpenChange, storeUsers, stats,
  onCashierChange, isLoadingStats, onSubmit, isPending,
}: CloseWizardProps) {
  const [step, setStep] = useState<Step>("mode");
  const [scope, setScope] = useState<"general" | "user">("general");
  const [cashierId, setCashierId] = useState<string>("");
  const [openingAmount, setOpeningAmount] = useState<number>(0);
  const [cashReported, setCashReported] = useState<number>(0);
  const [cardReported, setCardReported] = useState<number>(0);
  const [transferReported, setTransferReported] = useState<number>(0);
  const [creditReported, setCreditReported] = useState<number>(0);
  const [discrepancyNote, setDiscrepancyNote] = useState<string>("");
  const [closingNotes, setClosingNotes] = useState<string>("");

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setStep("mode");
      setScope("general");
      setCashierId("");
      setOpeningAmount(0);
      setCashReported(0);
      setCardReported(0);
      setTransferReported(0);
      setCreditReported(0);
      setDiscrepancyNote("");
      setClosingNotes("");
    }
  }, [open]);

  // Notify parent on cashier selection so stats refetch
  useEffect(() => {
    onCashierChange(scope === "user" ? cashierId : "");
  }, [scope, cashierId, onCashierChange]);

  const cashSalesNet     = parseFloat(stats?.cashTotal     ?? "0");
  const cashExpected     = openingAmount + cashSalesNet;
  const cardExpected     = parseFloat(stats?.cardTotal     ?? "0");
  const transferExpected = parseFloat(stats?.transferTotal ?? "0");
  const creditExpected   = parseFloat(stats?.creditTotal   ?? "0");
  const totalExpected    = cashExpected + cardExpected + transferExpected + creditExpected;
  const totalReported    = cashReported + cardReported + transferReported + creditReported;
  const totalDiff        = totalReported - totalExpected;
  const needsNote        = Math.abs(totalDiff) > DISCREPANCY_THRESHOLD;

  const cashWithdrawalsTotal = parseFloat(stats?.cashWithdrawalsTotal ?? "0");
  const cashWithdrawalsCount = stats?.cashWithdrawalsCount ?? 0;

  const selectedCashier = useMemo(
    () => storeUsers.find((u: any) => String(u.id) === cashierId),
    [storeUsers, cashierId]
  );

  // Step navigation order
  const stepOrder: Step[] = useMemo(() => {
    const base: Step[] = ["mode"];
    if (scope === "user") base.push("cashier");
    base.push("opening", "cash", "card", "transfer", "credit");
    if (needsNote) base.push("note");
    base.push("review");
    return base;
  }, [scope, needsNote]);

  const currentIndex = stepOrder.indexOf(step);
  const totalSteps = stepOrder.length;

  const goNext = () => {
    const next = stepOrder[currentIndex + 1];
    if (next) setStep(next);
  };
  const goBack = () => {
    const prev = stepOrder[currentIndex - 1];
    if (prev) setStep(prev);
  };

  // Per-step "can advance" rule
  const canAdvance = (() => {
    switch (step) {
      case "mode":     return true;
      case "cashier":  return !!cashierId;
      case "opening":  return openingAmount >= 0;
      case "cash":     return cashReported >= 0;
      case "card":     return cardReported >= 0;
      case "transfer": return transferReported >= 0;
      case "credit":   return creditReported >= 0;
      case "note":     return discrepancyNote.trim().length > 0;
      case "review":   return !needsNote || discrepancyNote.trim().length > 0;
    }
  })();

  const handleSubmit = () => {
    onSubmit({
      openingAmount,
      cashReported,
      cardReported,
      transferReported,
      creditReported,
      discrepancyNote: discrepancyNote || undefined,
      closingNotes: closingNotes || undefined,
      sessionType: scope === "user" ? "shift" : "day",
      targetCashierId: scope === "user" && cashierId ? parseInt(cashierId) : undefined,
    });
  };

  // ─── UI helpers ───────────────────────────────────────────────────────────
  const stepTitle: Record<Step, string> = {
    mode:     "Tipo de cierre",
    cashier:  "Selecciona el cajero",
    opening:  "Fondo inicial",
    cash:     "Efectivo contado",
    card:     "Pagos con tarjeta",
    transfer: "Transferencias",
    credit:   "Crédito",
    note:     "Nota de discrepancia",
    review:   "Revisión final",
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-blue-600" />
            Cierre de Caja Asistido
          </DialogTitle>
          {/* Step indicator */}
          <div className="flex items-center gap-1 mt-3">
            {stepOrder.map((s, i) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-all ${
                  i < currentIndex   ? "bg-blue-500" :
                  i === currentIndex ? "bg-blue-400" :
                                       "bg-gray-200"
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Paso {currentIndex + 1} de {totalSteps} — {stepTitle[step]}
          </p>
        </DialogHeader>

        <div className="py-2 min-h-[220px]">
          {/* ── Step: Mode ────────────────────────────────────────────── */}
          {step === "mode" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">¿Qué tipo de cierre vas a registrar?</p>
              <button
                type="button"
                onClick={() => setScope("general")}
                className={`w-full flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                  scope === "general"
                    ? "border-blue-500 bg-blue-50 ring-1 ring-blue-300"
                    : "border-gray-200 hover:border-blue-300"
                }`}
              >
                <Users className={`h-6 w-6 ${scope === "general" ? "text-blue-600" : "text-gray-400"}`} />
                <div>
                  <p className="font-semibold text-sm">Caja General (Día)</p>
                  <p className="text-xs text-gray-500">Cierre del día completo, todas las ventas.</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setScope("user")}
                className={`w-full flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                  scope === "user"
                    ? "border-purple-500 bg-purple-50 ring-1 ring-purple-300"
                    : "border-gray-200 hover:border-purple-300"
                }`}
              >
                <User className={`h-6 w-6 ${scope === "user" ? "text-purple-600" : "text-gray-400"}`} />
                <div>
                  <p className="font-semibold text-sm">Turno por Cajero</p>
                  <p className="text-xs text-gray-500">Cierre del turno de un cajero específico.</p>
                </div>
              </button>
            </div>
          )}

          {/* ── Step: Cashier ────────────────────────────────────────── */}
          {step === "cashier" && (
            <div className="space-y-3">
              <Label className="text-sm">Cajero a cerrar</Label>
              <Select value={cashierId} onValueChange={setCashierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un cajero..." />
                </SelectTrigger>
                <SelectContent>
                  {storeUsers.map((u: any) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.name}{u.username ? ` (${u.username})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCashier && (
                <div className="p-3 rounded-lg bg-purple-50 border border-purple-200">
                  <p className="text-sm font-medium text-purple-900">{selectedCashier.name}</p>
                  <p className="text-xs text-purple-600">
                    Se cargarán únicamente las ventas asignadas a este cajero.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Step: Opening Amount ─────────────────────────────────── */}
          {step === "opening" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                ¿Con cuánto efectivo se inició la caja?
              </p>
              <div className="p-4 rounded-xl border-2 border-blue-200 bg-blue-50">
                <Label className="text-xs text-blue-700">Fondo inicial (RD$)</Label>
                <Input
                  type="number" step="0.01" min="0" autoFocus
                  className="mt-1 text-2xl font-bold text-center bg-white border-blue-300"
                  placeholder="0.00"
                  value={openingAmount || ""}
                  onChange={(e) => setOpeningAmount(parseFloat(e.target.value) || 0)}
                />
                <p className="text-xs text-blue-600 mt-2">
                  Este monto se sumará al efectivo esperado en gaveta.
                </p>
              </div>
            </div>
          )}

          {/* ── Step: Cash ───────────────────────────────────────────── */}
          {step === "cash" && (
            <PaymentStep
              icon={<Banknote className="h-6 w-6 text-emerald-600" />}
              title="Efectivo contado"
              description="Cuenta el efectivo físico en gaveta."
              expected={cashExpected}
              reported={cashReported}
              onChange={setCashReported}
              detail={
                <div className="text-xs space-y-1 text-gray-600 mt-2">
                  <div className="flex justify-between"><span>Fondo inicial:</span><span>{fmt(openingAmount)}</span></div>
                  <div className="flex justify-between"><span>Ventas en efectivo:</span><span>+{fmt(cashSalesNet + cashWithdrawalsTotal)}</span></div>
                  {cashWithdrawalsCount > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Retiros ({cashWithdrawalsCount}):</span>
                      <span>−{fmt(cashWithdrawalsTotal)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold text-emerald-700 border-t pt-1">
                    <span>Esperado en gaveta:</span><span>{fmt(cashExpected)}</span>
                  </div>
                </div>
              }
            />
          )}

          {/* ── Step: Card ───────────────────────────────────────────── */}
          {step === "card" && (
            <PaymentStep
              icon={<CreditCard className="h-6 w-6 text-blue-600" />}
              title="Pagos con tarjeta"
              description="Total cobrado por terminal de tarjeta."
              expected={cardExpected}
              reported={cardReported}
              onChange={setCardReported}
            />
          )}

          {/* ── Step: Transfer ───────────────────────────────────────── */}
          {step === "transfer" && (
            <PaymentStep
              icon={<ArrowRightLeft className="h-6 w-6 text-cyan-600" />}
              title="Transferencias"
              description="Total recibido por transferencia bancaria."
              expected={transferExpected}
              reported={transferReported}
              onChange={setTransferReported}
            />
          )}

          {/* ── Step: Credit ─────────────────────────────────────────── */}
          {step === "credit" && (
            <PaymentStep
              icon={<Clock className="h-6 w-6 text-amber-600" />}
              title="Crédito"
              description="Ventas a crédito (cuenta por cobrar)."
              expected={creditExpected}
              reported={creditReported}
              onChange={setCreditReported}
            />
          )}

          {/* ── Step: Note ───────────────────────────────────────────── */}
          {step === "note" && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-amber-900">
                    Diferencia de {fmt(totalDiff)} ({totalDiff > 0 ? "sobrante" : "faltante"})
                  </p>
                  <p className="text-amber-700 text-xs mt-0.5">
                    Supera el límite de {fmt(DISCREPANCY_THRESHOLD)}. Indica el motivo.
                  </p>
                </div>
              </div>
              <Textarea
                autoFocus rows={4}
                placeholder="Explica la diferencia encontrada..."
                value={discrepancyNote}
                onChange={(e) => setDiscrepancyNote(e.target.value)}
              />
            </div>
          )}

          {/* ── Step: Review ─────────────────────────────────────────── */}
          {step === "review" && (
            <div className="space-y-3">
              <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4 space-y-2 text-sm">
                <Row label="Tipo" value={
                  scope === "general"
                    ? <Badge variant="default">Caja General</Badge>
                    : <Badge variant="secondary">Turno: {selectedCashier?.name ?? "—"}</Badge>
                } />
                <Row label="Fondo inicial" value={<span className="font-semibold text-blue-700">{fmt(openingAmount)}</span>} />
              </div>

              <div className="rounded-xl border bg-white p-4 space-y-1 text-sm">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Cuadre</p>
                <ReviewLine label="Efectivo"      exp={cashExpected}     rep={cashReported} />
                <ReviewLine label="Tarjeta"       exp={cardExpected}     rep={cardReported} />
                <ReviewLine label="Transferencia" exp={transferExpected} rep={transferReported} />
                <ReviewLine label="Crédito"       exp={creditExpected}   rep={creditReported} />
                <div className="flex justify-between border-t pt-2 mt-2 font-bold">
                  <span>Total</span>
                  <span className={diffColor(totalDiff)}>
                    {fmt(totalReported)} / {fmt(totalExpected)}
                    {totalDiff !== 0 && (
                      <span className="ml-2 text-xs">
                        ({totalDiff > 0 ? "+" : ""}{fmt(totalDiff)})
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {discrepancyNote && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs font-semibold text-amber-800 uppercase mb-1">Nota de discrepancia</p>
                  <p className="text-sm text-amber-900">{discrepancyNote}</p>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs text-gray-500 flex items-center gap-1">
                  <FileText className="h-3 w-3" /> Notas adicionales (opcional)
                </Label>
                <Textarea
                  rows={2}
                  placeholder="Observaciones del cierre..."
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                />
              </div>
            </div>
          )}

          {isLoadingStats && (
            <div className="flex items-center justify-center gap-2 text-xs text-gray-500 mt-3">
              <Loader2 className="h-3 w-3 animate-spin" />
              Cargando datos del período…
            </div>
          )}
        </div>

        {/* ── Footer navigation ──────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t pt-3">
          <Button
            variant="ghost"
            onClick={currentIndex === 0 ? () => onOpenChange(false) : goBack}
            disabled={isPending}
          >
            {currentIndex === 0 ? "Cancelar" : <><ChevronLeft className="h-4 w-4 mr-1" />Atrás</>}
          </Button>

          {step === "review" ? (
            <Button
              onClick={handleSubmit}
              disabled={isPending || !canAdvance}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isPending
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Registrando…</>
                : <><CheckCircle2 className="h-4 w-4 mr-1" />Confirmar Cierre</>}
            </Button>
          ) : (
            <Button onClick={goNext} disabled={!canAdvance}>
              Siguiente<ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Subcomponentes ─────────────────────────────────────────────────────────

function PaymentStep({
  icon, title, description, expected, reported, onChange, detail,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  expected: number;
  reported: number;
  onChange: (v: number) => void;
  detail?: React.ReactNode;
}) {
  const diff = reported - expected;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="font-semibold text-sm">{title}</p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-gray-50 border p-3">
          <p className="text-xs text-gray-500">Sistema esperaba</p>
          <p className="font-bold text-gray-900">{fmt(expected)}</p>
        </div>
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
          <p className="text-xs text-emerald-700">Ingresa lo contado</p>
          <Input
            type="number" step="0.01" min="0" autoFocus
            className="mt-1 font-bold text-lg bg-white"
            placeholder="0.00"
            value={reported || ""}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          />
        </div>
      </div>

      {detail}

      {reported > 0 && Math.abs(diff) > 0.01 && (
        <div className={`text-xs flex items-center gap-1 ${diffColor(diff)}`}>
          <DollarSign className="h-3 w-3" />
          Diferencia: {diff > 0 ? "+" : ""}{fmt(diff)}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-600">{label}</span>
      {value}
    </div>
  );
}

function ReviewLine({ label, exp, rep }: { label: string; exp: number; rep: number }) {
  const diff = rep - exp;
  return (
    <div className="flex justify-between text-xs">
      <span className="text-gray-600">{label}</span>
      <span>
        {fmt(rep)} / {fmt(exp)}
        {Math.abs(diff) > 0.01 && (
          <span className={`ml-2 ${diffColor(diff)}`}>
            ({diff > 0 ? "+" : ""}{fmt(diff)})
          </span>
        )}
      </span>
    </div>
  );
}
