import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Landmark, TrendingUp, TrendingDown, Banknote, CreditCard,
  ArrowRightLeft, Clock, History, CheckCircle2, XCircle,
  AlertTriangle, RefreshCw, Lock,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// ─── helpers ────────────────────────────────────────────────────────────────

const DISCREPANCY_THRESHOLD = 100;

const apiCall = async (endpoint: string, options: RequestInit = {}) => {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(endpoint, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Error desconocido" }));
    throw new Error(err.error || "Error en la solicitud");
  }
  return res.json();
};

const fmt = (value: string | number | null | undefined, currency = "DOP") => {
  const num = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  if (isNaN(num)) return `${currency} 0.00`;
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: currency === "USD" ? "USD" : "DOP",
    currencyDisplay: "symbol",
  }).format(num);
};

const fmtDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("es-DO", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

const diffColor = (diff: number) => {
  if (diff > 0) return "text-green-600 font-semibold";
  if (diff < 0) return "text-red-600 font-semibold";
  return "text-gray-600";
};

const statusBadge = (status: string) => {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    open:     { label: "Abierta",   variant: "default" },
    closed:   { label: "Pendiente", variant: "secondary" },
    approved: { label: "Aprobada",  variant: "default" },
    rejected: { label: "Rechazada", variant: "destructive" },
  };
  const cfg = map[status] ?? { label: status, variant: "outline" };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
};

const sessionTypeLabel = (t: string) => t === "day" ? "Cierre del Día" : "Cierre de Turno";

// ─── payment row helper ──────────────────────────────────────────────────────

function PaymentRow({
  icon: Icon,
  label,
  expected,
  reported,
  onReportedChange,
  readOnly = false,
}: {
  icon: any;
  label: string;
  expected: number;
  reported: number;
  onReportedChange?: (v: number) => void;
  readOnly?: boolean;
}) {
  const diff = reported - expected;
  return (
    <tr className="border-b last:border-0">
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Icon className="h-4 w-4 text-gray-500" />
          {label}
        </div>
      </td>
      <td className="py-3 pr-4 text-right text-sm text-gray-700">{fmt(expected)}</td>
      <td className="py-3 pr-4">
        {readOnly ? (
          <span className="text-sm text-gray-700">{fmt(reported)}</span>
        ) : (
          <Input
            type="number"
            min={0}
            step="0.01"
            className="w-36 text-right"
            value={reported === 0 ? "" : reported}
            placeholder="0.00"
            onChange={(e) => onReportedChange?.(parseFloat(e.target.value) || 0)}
          />
        )}
      </td>
      <td className={`py-3 text-right text-sm ${diffColor(diff)}`}>
        {diff > 0 ? "+" : ""}{fmt(diff)}
        {diff > 0 && <TrendingUp className="inline h-3 w-3 ml-1" />}
        {diff < 0 && <TrendingDown className="inline h-3 w-3 ml-1" />}
      </td>
    </tr>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function CashRegisterPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  // Form state: apertura
  const [openForm, setOpenForm] = useState({ sessionType: "shift", openingAmount: "", openingNotes: "" });

  // Form state: cierre
  const [closeForm, setCloseForm] = useState({
    cashReported: 0, cardReported: 0, transferReported: 0, creditReported: 0,
    discrepancyNote: "",
  });
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  // Reject dialog
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<number | null>(null);

  // History filters
  const [histFilters, setHistFilters] = useState({ startDate: "", endDate: "", status: "" });

  // ── queries ──────────────────────────────────────────────────────────────
  const { data: activeData, isLoading: loadingActive } = useQuery({
    queryKey: ["/api/cash-register/sessions/active"],
    queryFn: () => apiCall("/api/cash-register/sessions/active"),
    refetchInterval: 30_000, // actualiza stats cada 30s
  });

  const { data: histData, isLoading: loadingHist, refetch: refetchHist } = useQuery({
    queryKey: ["/api/cash-register/sessions", histFilters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (histFilters.startDate) params.set("startDate", histFilters.startDate);
      if (histFilters.endDate) params.set("endDate", histFilters.endDate);
      if (histFilters.status) params.set("status", histFilters.status);
      return apiCall(`/api/cash-register/sessions?${params.toString()}`);
    },
  });

  // ── mutations ─────────────────────────────────────────────────────────────
  const openMutation = useMutation({
    mutationFn: (body: any) =>
      apiCall("/api/cash-register/sessions", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash-register/sessions/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash-register/sessions"] });
      toast({ title: "Caja abierta", description: "La sesión de caja fue abierta correctamente." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const closeMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) =>
      apiCall(`/api/cash-register/sessions/${id}/close`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash-register/sessions/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash-register/sessions"] });
      setShowCloseConfirm(false);
      toast({ title: "Cierre enviado", description: "El cierre queda pendiente de aprobación del supervisor." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) =>
      apiCall(`/api/cash-register/sessions/${id}/approve`, { method: "PUT" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash-register/sessions"] });
      toast({ title: "Aprobado", description: "El cierre de caja fue aprobado." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiCall(`/api/cash-register/sessions/${id}/reject`, {
        method: "PUT", body: JSON.stringify({ rejectionReason: reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash-register/sessions"] });
      setRejectOpen(false);
      setRejectReason("");
      toast({ title: "Rechazado", description: "El cierre de caja fue rechazado." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // ── derived state ─────────────────────────────────────────────────────────
  const session = activeData?.session ?? null;
  const stats = activeData?.stats ?? null;
  const sessions: any[] = histData?.sessions ?? [];

  const cashExpected    = parseFloat(stats?.cashTotal     ?? "0");
  const cardExpected    = parseFloat(stats?.cardTotal     ?? "0");
  const transferExpected = parseFloat(stats?.transferTotal ?? "0");
  const creditExpected  = parseFloat(stats?.creditTotal   ?? "0");
  const totalExpected   = cashExpected + cardExpected + transferExpected + creditExpected;
  const totalReported   =
    closeForm.cashReported + closeForm.cardReported +
    closeForm.transferReported + closeForm.creditReported;
  const totalDiff = totalReported - totalExpected;
  const needsNote = Math.abs(totalDiff) > DISCREPANCY_THRESHOLD;

  // ── views ─────────────────────────────────────────────────────────────────
  if (loadingActive) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Landmark className="h-7 w-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Cierre de Caja</h1>
          <p className="text-sm text-gray-500">Apertura, cuadre y aprobación de sesiones de caja</p>
        </div>
      </div>

      <Tabs defaultValue="current">
        <TabsList>
          <TabsTrigger value="current">Sesión Actual</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>

        {/* ════════════════ SESIÓN ACTUAL ════════════════ */}
        <TabsContent value="current" className="space-y-4 mt-4">

          {/* ── SIN SESIÓN: formulario de apertura ── */}
          {!session && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5 text-gray-400" />
                  No hay caja abierta
                </CardTitle>
                <CardDescription>
                  Abre una nueva sesión registrando el fondo de caja inicial.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <Label>Tipo de cierre</Label>
                  <Select
                    value={openForm.sessionType}
                    onValueChange={(v) => setOpenForm((p) => ({ ...p, sessionType: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="shift">Cierre de Turno</SelectItem>
                      <SelectItem value="day">Cierre del Día</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Fondo de caja inicial (DOP)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0.00"
                    value={openForm.openingAmount}
                    onChange={(e) => setOpenForm((p) => ({ ...p, openingAmount: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Notas de apertura (opcional)</Label>
                  <Textarea
                    placeholder="Observaciones..."
                    value={openForm.openingNotes}
                    onChange={(e) => setOpenForm((p) => ({ ...p, openingNotes: e.target.value }))}
                  />
                </div>

                <Button
                  className="w-full"
                  disabled={openMutation.isPending}
                  onClick={() =>
                    openMutation.mutate({
                      sessionType: openForm.sessionType,
                      openingAmount: parseFloat(openForm.openingAmount) || 0,
                      openingNotes: openForm.openingNotes || undefined,
                    })
                  }
                >
                  {openMutation.isPending ? "Abriendo..." : "Abrir Caja"}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* ── SESIÓN ABIERTA: stats + cierre ── */}
          {session && (
            <>
              {/* Info de sesión */}
              <Card>
                <CardContent className="pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm text-gray-500">Tipo</p>
                      <p className="font-semibold">{sessionTypeLabel(session.sessionType)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-gray-500">Cajera</p>
                      <p className="font-semibold">{session.cashierName ?? "—"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-gray-500">Apertura</p>
                      <p className="font-semibold">{fmtDate(session.openedAt)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-gray-500">Fondo inicial</p>
                      <p className="font-semibold">{fmt(session.openingAmount)}</p>
                    </div>
                    <Badge variant="default" className="self-center">Abierta</Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Stats en vivo */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Órdenes", value: stats?.totalOrders ?? 0, icon: CheckCircle2, raw: true },
                  { label: "Ventas Totales", value: stats?.totalSales ?? "0", icon: TrendingUp },
                  { label: "Descuentos", value: stats?.totalDiscounts ?? "0", icon: TrendingDown },
                  { label: "Cancelaciones", value: stats?.totalCancellations ?? 0, icon: XCircle, raw: true },
                ].map(({ label, value, icon: Icon, raw }) => (
                  <Card key={label}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-500">{label}</p>
                        <Icon className="h-4 w-4 text-gray-400" />
                      </div>
                      <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
                        {raw ? value : fmt(value)}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Tabla de pagos por método */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Resumen por método de pago</CardTitle>
                  <CardDescription>
                    Ingresa el dinero contado por método. La diferencia se calcula automáticamente.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-gray-500 text-xs uppercase">
                        <th className="pb-2 text-left">Método</th>
                        <th className="pb-2 text-right">Sistema</th>
                        <th className="pb-2 text-right">Cajera reporta</th>
                        <th className="pb-2 text-right">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      <PaymentRow icon={Banknote} label="Efectivo"
                        expected={cashExpected} reported={closeForm.cashReported}
                        onReportedChange={(v) => setCloseForm((p) => ({ ...p, cashReported: v }))} />
                      <PaymentRow icon={CreditCard} label="Tarjeta"
                        expected={cardExpected} reported={closeForm.cardReported}
                        onReportedChange={(v) => setCloseForm((p) => ({ ...p, cardReported: v }))} />
                      <PaymentRow icon={ArrowRightLeft} label="Transferencia"
                        expected={transferExpected} reported={closeForm.transferReported}
                        onReportedChange={(v) => setCloseForm((p) => ({ ...p, transferReported: v }))} />
                      <PaymentRow icon={Clock} label="Crédito"
                        expected={creditExpected} reported={closeForm.creditReported}
                        onReportedChange={(v) => setCloseForm((p) => ({ ...p, creditReported: v }))} />
                    </tbody>
                    <tfoot>
                      <tr className="border-t font-bold text-sm">
                        <td className="pt-3">Total</td>
                        <td className="pt-3 text-right">{fmt(totalExpected)}</td>
                        <td className="pt-3 text-right">{fmt(totalReported)}</td>
                        <td className={`pt-3 text-right ${diffColor(totalDiff)}`}>
                          {totalDiff > 0 ? "+" : ""}{fmt(totalDiff)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>

                  {/* Nota de discrepancia */}
                  {needsNote && (
                    <div className="mt-4 p-3 rounded-md bg-amber-50 border border-amber-200 flex gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="flex-1 space-y-2">
                        <p className="text-sm text-amber-800 font-medium">
                          La diferencia supera {fmt(DISCREPANCY_THRESHOLD)}. Debes explicar el motivo.
                        </p>
                        <Textarea
                          placeholder="Explica la diferencia encontrada..."
                          value={closeForm.discrepancyNote}
                          onChange={(e) => setCloseForm((p) => ({ ...p, discrepancyNote: e.target.value }))}
                        />
                      </div>
                    </div>
                  )}

                  <Button
                    className="mt-5 w-full"
                    disabled={needsNote && !closeForm.discrepancyNote.trim()}
                    onClick={() => setShowCloseConfirm(true)}
                  >
                    Enviar Cierre de Caja
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ════════════════ HISTORIAL ════════════════ */}
        <TabsContent value="history" className="space-y-4 mt-4">
          {/* Filtros */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Desde</Label>
                  <Input type="date" className="w-40"
                    value={histFilters.startDate}
                    onChange={(e) => setHistFilters((p) => ({ ...p, startDate: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Hasta</Label>
                  <Input type="date" className="w-40"
                    value={histFilters.endDate}
                    onChange={(e) => setHistFilters((p) => ({ ...p, endDate: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Estado</Label>
                  <Select
                    value={histFilters.status || "all"}
                    onValueChange={(v) => setHistFilters((p) => ({ ...p, status: v === "all" ? "" : v }))}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="open">Abierta</SelectItem>
                      <SelectItem value="closed">Pendiente</SelectItem>
                      <SelectItem value="approved">Aprobada</SelectItem>
                      <SelectItem value="rejected">Rechazada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchHist()}>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Actualizar
                </Button>
              </div>
            </CardContent>
          </Card>

          {loadingHist ? (
            <div className="flex justify-center py-10">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <History className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No hay registros de cierre de caja.</p>
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha apertura</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Cajera</TableHead>
                      <TableHead className="text-right">Esperado</TableHead>
                      <TableHead className="text-right">Reportado</TableHead>
                      <TableHead className="text-right">Diferencia</TableHead>
                      <TableHead>Estado</TableHead>
                      {isAdmin && <TableHead>Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((s: any) => {
                      const diff = parseFloat(s.totalDifference ?? "0");
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="text-sm">{fmtDate(s.openedAt)}</TableCell>
                          <TableCell className="text-sm">{sessionTypeLabel(s.sessionType)}</TableCell>
                          <TableCell className="text-sm">{s.cashierName ?? "—"}</TableCell>
                          <TableCell className="text-right text-sm">{fmt(s.totalExpected)}</TableCell>
                          <TableCell className="text-right text-sm">{fmt(s.totalReported)}</TableCell>
                          <TableCell className={`text-right text-sm ${diffColor(diff)}`}>
                            {diff > 0 ? "+" : ""}{fmt(diff)}
                          </TableCell>
                          <TableCell>{statusBadge(s.status)}</TableCell>
                          {isAdmin && (
                            <TableCell>
                              {s.status === "closed" && (
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-green-700 border-green-300 hover:bg-green-50"
                                    disabled={approveMutation.isPending}
                                    onClick={() => approveMutation.mutate(s.id)}
                                  >
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Aprobar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-700 border-red-300 hover:bg-red-50"
                                    onClick={() => {
                                      setRejectingId(s.id);
                                      setRejectOpen(true);
                                    }}
                                  >
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Rechazar
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Modal confirmar cierre ── */}
      <Dialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Cierre de Caja</DialogTitle>
            <DialogDescription>
              Esta acción enviará el cierre al supervisor para su aprobación.
              Los montos no podrán modificarse una vez enviados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Total esperado (sistema)</span>
              <span className="font-medium">{fmt(totalExpected)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Total reportado (cajera)</span>
              <span className="font-medium">{fmt(totalReported)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Diferencia</span>
              <span className={diffColor(totalDiff)}>
                {totalDiff > 0 ? "+" : ""}{fmt(totalDiff)}
              </span>
            </div>
            {closeForm.discrepancyNote && (
              <p className="text-gray-500 italic text-xs mt-1">{closeForm.discrepancyNote}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseConfirm(false)}>Cancelar</Button>
            <Button
              disabled={closeMutation.isPending}
              onClick={() =>
                closeMutation.mutate({
                  id: session!.id,
                  body: {
                    cashReported: closeForm.cashReported,
                    cardReported: closeForm.cardReported,
                    transferReported: closeForm.transferReported,
                    creditReported: closeForm.creditReported,
                    discrepancyNote: closeForm.discrepancyNote || undefined,
                  },
                })
              }
            >
              {closeMutation.isPending ? "Enviando..." : "Confirmar Cierre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal rechazar ── */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar Cierre</DialogTitle>
            <DialogDescription>
              Indica el motivo del rechazo. La cajera deberá revisar y volver a enviar el cierre.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Motivo del rechazo..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              onClick={() => rejectingId && rejectMutation.mutate({ id: rejectingId, reason: rejectReason })}
            >
              {rejectMutation.isPending ? "Rechazando..." : "Rechazar Cierre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
