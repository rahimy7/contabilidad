import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import {
  Banknote, Boxes, ChevronRight, FileText, Receipt, ShoppingCart,
} from "lucide-react";
import { accountingApi, type DashboardData } from "@/lib/accounting-api";
import { useChartColors } from "@/lib/chart-theme";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import AttentionCenter from "@/components/dashboard/attention-center";
import { useRouteBadges } from "@/components/layout/nav-model";
import {
  Cue, CueGroup, KpiHeadline, KpiRow, PageHeader, Money, money, moneyShort,
} from "@/components/erp";

/**
 * Role Center — la pantalla de inicio de un ERP.
 *
 * No es un tablero de métricas: es una lista de trabajo con cifras arriba. Por
 * eso el orden es cifras → lo que exige atención → contadores accionables →
 * detalle. Un panel que abre con gráficos obliga a interpretar antes de actuar.
 *
 * Las cifras grandes van en peso 300 y sin caja alrededor. La única parte con
 * color es la barra bajo cada una, y significa algo: verde dentro de lo
 * esperado, ámbar a vigilar, rojo fuera de rango.
 */

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export default function Dashboard() {
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["/api/accounting/dashboard", year, month],
    queryFn: () => accountingApi.dashboard(year, month),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        subtitle={`Cifras contables de ${MONTHS[month - 1]} ${year}`}
        actions={
          <>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[92px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[0, 1, 2].map((d) => {
                  const y = now.getUTCFullYear() - d;
                  return <SelectItem key={y} value={String(y)}>{y}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </>
        }
      />

      {isError ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-[13px]">No se pudo cargar el resumen contable.</p>
            <p className="mt-1 text-[12px] text-muted-foreground">{(error as Error)?.message}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Headlines data={data} isLoading={isLoading} />

          <AttentionCenter />

          <Cues data={data} />

          <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              <IncomeVsExpense data={data} isLoading={isLoading} />
              <ExpenseBreakdown data={data} isLoading={isLoading} />
            </div>

            <div className="space-y-4">
              <FinancialSummary data={data} isLoading={isLoading} />
              <QuickActions />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <OpenItems
              title="Cuentas por Cobrar"
              href="/receivables"
              emptyLabel="Nadie te debe."
              block={data?.receivables}
              isLoading={isLoading}
            />
            <OpenItems
              title="Cuentas por Pagar"
              href="/payables"
              emptyLabel="No debes nada."
              block={data?.payables}
              isLoading={isLoading}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ── Cifras destacadas ────────────────────────────────────────────────────────

/**
 * Que un número suba no es bueno por sí solo: en Gastos, subir es malo. El tono
 * de la barra lo decide `goodWhenUp`, nunca el signo. Y sin mes anterior con
 * movimiento no hay variación: no es 0%, es "no aplica".
 */
function Headlines({ data, isLoading }: { data?: DashboardData; isLoading: boolean }) {
  const items = [
    { label: "Ingresos del mes", kpi: data?.kpis.income, goodWhenUp: true },
    { label: "Gastos del mes", kpi: data?.kpis.expense, goodWhenUp: false },
    { label: "Utilidad neta", kpi: data?.kpis.netIncome, goodWhenUp: true },
    { label: "Flujo de efectivo", kpi: data?.kpis.cashFlow, goodWhenUp: true },
  ];

  return (
    <KpiRow>
      {items.map((it) => {
        const pct = it.kpi?.changePct ?? null;
        const n = pct === null ? null : Number(pct);
        const tone =
          n === null || n === 0 ? "neutral" : (n > 0) === it.goodWhenUp ? "good" : "bad";
        const hint =
          n === null
            ? "Sin mes anterior para comparar"
            : `${n > 0 ? "+" : ""}${pct}% vs mes anterior`;

        return (
          <KpiHeadline
            key={it.label}
            label={it.label}
            value={moneyShort(it.kpi?.value ?? 0)}
            tone={tone}
            isLoading={isLoading}
            hint={hint}
          />
        );
      })}
    </KpiRow>
  );
}

// ── Mosaicos ─────────────────────────────────────────────────────────────────

/**
 * Contadores accionables. Sólo entran números que el sistema conoce de forma
 * exacta: una partida abierta o un mensaje sin leer se cuentan enteros. Una
 * cifra "aproximada" en un mosaico enseña a desconfiar del panel entero.
 */
function Cues({ data }: { data?: DashboardData }) {
  const { badgeForRoute } = useRouteBadges();

  const arCount = (data?.receivables.items.length ?? 0) + (data?.receivables.othersCount ?? 0);
  const apCount = (data?.payables.items.length ?? 0) + (data?.payables.othersCount ?? 0);
  const pendingOrders = Number(badgeForRoute("/orders") ?? 0);
  const unreadChats = Number(badgeForRoute("/conversations") ?? 0);
  const notifications = Number(badgeForRoute("/notifications") ?? 0);

  return (
    <div className="flex flex-wrap gap-x-9 gap-y-5 border-b border-border pb-5">
      <CueGroup title="Cartera">
        <Cue label="Partidas por cobrar" value={arCount} href="/receivables"
             tone={arCount > 0 ? "accent" : "quiet"} />
        <Cue label="Partidas por pagar" value={apCount} href="/payables"
             tone={apCount > 0 ? "accent" : "quiet"} />
      </CueGroup>

      <CueGroup title="Operación">
        <Cue label="Pedidos pendientes" value={pendingOrders} href="/orders"
             tone={pendingOrders > 0 ? "accent" : "quiet"} />
        <Cue label="Conversaciones sin leer" value={unreadChats} href="/conversations"
             tone={unreadChats > 0 ? "accent" : "quiet"} />
        <Cue label="Notificaciones" value={notifications} href="/notifications" tone="quiet" />
      </CueGroup>
    </div>
  );
}

// ── Gráficos ─────────────────────────────────────────────────────────────────

/**
 * Ingresos contra gastos, mes a mes.
 *
 * Dos líneas y no dos áreas superpuestas: con relleno, el área de arriba tapa la
 * de abajo justo donde importa mirarlas juntas. Se corta en el mes consultado —
 * dibujar los meses futuros en cero simula una caída que no ocurrió.
 */
function IncomeVsExpense({ data, isLoading }: { data?: DashboardData; isLoading: boolean }) {
  const c = useChartColors();
  const rows = (data?.monthly ?? [])
    .filter((p) => !data || p.period <= data.month)
    .map((p) => ({
      mes: MONTHS[p.period - 1].slice(0, 3),
      Ingresos: Number(p.income),
      Gastos: Number(p.expense),
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ingresos vs Gastos</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[230px] w-full" />
        ) : rows.length === 0 ? (
          <p className="py-20 text-center text-[13px] text-muted-foreground">
            Sin movimiento registrado en {data?.year}.
          </p>
        ) : (
          <>
            <div className="mb-2 flex items-center gap-4 text-[12px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-[3px] w-4" style={{ backgroundColor: c.income }} /> Ingresos
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-[3px] w-4" style={{ backgroundColor: c.expense }} /> Gastos
              </span>
            </div>
            <div className="h-[230px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows} margin={{ top: 6, right: 12, bottom: 0, left: -14 }}>
                  <CartesianGrid stroke={c.grid} vertical={false} />
                  <XAxis
                    dataKey="mes" tickLine={false} axisLine={{ stroke: c.grid }}
                    tick={{ fontSize: 11, fill: c.axis }}
                  />
                  <YAxis
                    tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: c.axis }}
                    tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                  />
                  <RTooltip
                    formatter={(v: any, n: any) => [money(v), n]}
                    contentStyle={{
                      borderRadius: 2, border: `1px solid ${c.border}`,
                      backgroundColor: c.surface, color: c.text, fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone" dataKey="Ingresos" stroke={c.income} strokeWidth={2}
                    dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: c.surface }}
                  />
                  <Line
                    type="monotone" dataKey="Gastos" stroke={c.expense} strokeWidth={2}
                    dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: c.surface }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Distribución de gastos, en barras ordenadas de mayor a menor.
 *
 * Antes era una dona: para comparar seis porciones hay que estimar ángulos, y
 * eso es justo lo que el ojo hace peor. Con barras alineadas al mismo origen la
 * comparación es de longitudes, y el orden ya cuenta la historia. El color no
 * codifica nada aquí — la magnitud está en el largo, así que un solo tono.
 */
function ExpenseBreakdown({ data, isLoading }: { data?: DashboardData; isLoading: boolean }) {
  const c = useChartColors();
  const slices = data?.expenseBreakdown ?? [];
  const max = Math.max(...slices.map((s) => Number(s.amount)), 1);

  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between space-y-0">
        <CardTitle>Distribución de gastos</CardTitle>
        <span className="text-[12px] tabular-nums text-muted-foreground">
          Total {moneyShort(data?.expenseTotal ?? 0)}
        </span>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2.5">
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-6 w-full" />)}
          </div>
        ) : slices.length === 0 ? (
          <p className="py-14 text-center text-[13px] text-muted-foreground">
            Sin gastos registrados este mes.
          </p>
        ) : (
          <ul className="space-y-2">
            {slices.map((s) => (
              <li key={s.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                <span className="truncate text-[13px]">{s.name}</span>
                <span className="text-right text-[13px] font-medium tabular-nums">
                  {money(s.amount)}
                  <span className="ml-2 text-[12px] font-normal text-muted-foreground">{s.pct}%</span>
                </span>
                <div className="col-span-2 h-[6px] bg-muted">
                  <div
                    className="h-full"
                    style={{
                      width: `${(Number(s.amount) / max) * 100}%`,
                      backgroundColor: c.series[0],
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ── CxC / CxP ────────────────────────────────────────────────────────────────

function OpenItems({
  title, href, emptyLabel, block, isLoading,
}: {
  title: string;
  href: string;
  emptyLabel: string;
  block?: DashboardData["receivables"];
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{title}</CardTitle>
        <Link href={href} className="text-[12px] text-primary hover:underline">
          Ver todas
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-36" />
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-5 w-full" />)}
          </div>
        ) : (
          <>
            <p className="erp-figure-sm">{moneyShort(block?.total ?? 0)}</p>
            <p className="mb-3 text-[12px] text-muted-foreground">Total pendiente</p>

            {(block?.items.length ?? 0) === 0 ? (
              <p className="py-4 text-center text-[13px] text-muted-foreground">{emptyLabel}</p>
            ) : (
              <ul>
                {block!.items.map((it) => (
                  <li
                    key={it.name}
                    className="flex items-center gap-2 border-b border-border py-1.5 text-[13px] last:border-0"
                  >
                    <span className="min-w-0 flex-1 truncate">{it.name}</span>
                    <Money value={it.balance} className="shrink-0 font-medium" />
                    <Overdue days={it.daysOverdue} />
                  </li>
                ))}
                {(block!.othersCount ?? 0) > 0 && (
                  <li className="flex items-center gap-2 pt-1.5 text-[13px] text-muted-foreground">
                    <span className="min-w-0 flex-1 truncate">Otros ({block!.othersCount})</span>
                    <Money value={block!.othersBalance} className="shrink-0" />
                    <span className="w-[70px]" />
                  </li>
                )}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Días de atraso de la partida más vieja: semáforo de cobranza. Un número
 * negativo significa que aún no vence, así que no es un atraso.
 */
function Overdue({ days }: { days: number }) {
  if (days <= 0) {
    return (
      <span className="flex w-[70px] shrink-0 items-center justify-end gap-1 text-[11px] text-muted-foreground">
        al día <span className="h-1.5 w-1.5 rounded-full bg-success" />
      </span>
    );
  }
  const color = days > 60 ? "bg-destructive" : days > 30 ? "bg-warning" : "bg-success";
  return (
    <span className="flex w-[70px] shrink-0 items-center justify-end gap-1 text-[11px] tabular-nums text-muted-foreground">
      {days} días <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
    </span>
  );
}

// ── Columna derecha ──────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: "Emitir factura", hint: "Comprobante fiscal con NCF o e-CF", href: "/fiscal/documents", icon: Receipt },
  { label: "Facturación electrónica", hint: "Transmisión a DGII y recibidos", href: "/fiscal/ecf", icon: FileText },
  { label: "Nueva compra", hint: "Registrar orden de compra", href: "/purchase-management", icon: ShoppingCart },
  { label: "Conteo físico", hint: "Auditar existencias por ubicación", href: "/inventory-count", icon: Boxes },
  { label: "Cobro recibido", hint: "Aplicar a cuentas por cobrar", href: "/receivables", icon: Banknote },
];

function QuickActions() {
  return (
    <Card>
      <CardHeader><CardTitle>Acciones rápidas</CardTitle></CardHeader>
      <CardContent className="p-0">
        {QUICK_ACTIONS.map((a) => (
          <Link
            key={a.label}
            href={a.href}
            className="flex items-center gap-2.5 border-b border-border px-3.5 py-2 transition-colors last:border-0 hover:bg-accent"
          >
            <a.icon className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{a.label}</p>
              <p className="truncate text-[11px] text-muted-foreground">{a.hint}</p>
            </div>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function FinancialSummary({ data, isLoading }: { data?: DashboardData; isLoading: boolean }) {
  const s = data?.summary;
  const rows = [
    { label: "Activo total", value: s?.assets },
    { label: "Pasivo total", value: s?.liabilities },
    { label: "Patrimonio", value: s?.equity },
    { label: "Utilidad del ejercicio", value: s?.netIncome },
  ];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Resumen financiero</CardTitle>
        <Link href="/accounting/financial-statements" className="text-[12px] text-primary hover:underline">
          Ver reporte
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between border-b border-border px-3.5 py-2 text-[13px]"
          >
            <span className="text-muted-foreground">{r.label}</span>
            {isLoading ? <Skeleton className="h-4 w-24" /> : <Money value={r.value} className="font-medium" />}
          </div>
        ))}
        <div className="flex items-center justify-between px-3.5 py-2 text-[13px]">
          <span className="text-muted-foreground">Margen de utilidad</span>
          {isLoading ? (
            <Skeleton className="h-4 w-16" />
          ) : s?.marginPct == null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span
              className={`font-semibold tabular-nums ${
                Number(s.marginPct) >= 0 ? "text-success" : "text-destructive"
              }`}
            >
              {s.marginPct}%
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
