import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import {
  ArrowDownRight, ArrowUpRight, Banknote, ChevronRight, FileText, Receipt,
  ShoppingCart, TrendingUp, UserPlus, Wallet, Calculator, Boxes, Users,
  Landmark, BarChart3, Building2,
} from "lucide-react";
import { accountingApi, type DashboardData } from "@/lib/accounting-api";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** Pesos dominicanos, sin decimales: en un panel los centavos son ruido. */
const money = (v: string | number) =>
  `RD$ ${Math.round(Number(v ?? 0)).toLocaleString("es-DO")}`;

const moneyExact = (v: string | number) =>
  `RD$ ${Number(v ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SLICE_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#94a3b8"];

export default function Dashboard() {
  const { user } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["/api/accounting/dashboard", year, month],
    queryFn: () => accountingApi.dashboard(year, month),
  });

  const firstName = user?.name?.split(" ")[0] ?? "Usuario";

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            ¡Bienvenido, {firstName}! 👋
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Resumen contable de {MONTHS[month - 1]} {year}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="h-9 w-[150px] bg-white dark:bg-slate-950">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="h-9 w-[100px] bg-white dark:bg-slate-950">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0, 1, 2].map((d) => {
                const y = now.getUTCFullYear() - d;
                return <SelectItem key={y} value={String(y)}>{y}</SelectItem>;
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isError ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              No se pudo cargar el resumen contable.
            </p>
            <p className="mt-1 text-xs text-slate-400">{(error as Error)?.message}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <KpiRow data={data} isLoading={isLoading} />

          <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
            <div className="space-y-5">
              <div className="grid gap-5 lg:grid-cols-2">
                <IncomeVsExpense data={data} isLoading={isLoading} />
                <ExpenseBreakdown data={data} isLoading={isLoading} />
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <OpenItemsCard
                  title="Cuentas por Cobrar"
                  href="/receivables"
                  emptyLabel="Nadie te debe."
                  block={data?.receivables}
                  isLoading={isLoading}
                />
                <OpenItemsCard
                  title="Cuentas por Pagar"
                  href="/payables"
                  emptyLabel="No debes nada."
                  block={data?.payables}
                  isLoading={isLoading}
                />
              </div>
            </div>

            <div className="space-y-5">
              <QuickActions />
              <FinancialSummary data={data} isLoading={isLoading} />
              <ModuleShortcuts />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── KPIs ─────────────────────────────────────────────────────────────────────

function KpiRow({ data, isLoading }: { data?: DashboardData; isLoading: boolean }) {
  const series = data?.monthly ?? [];
  const upTo = data ? series.filter((p) => p.period <= data.month) : [];

  const kpis = [
    {
      label: "Ingresos Totales",
      kpi: data?.kpis.income,
      icon: TrendingUp,
      tint: "bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400",
      stroke: "#6366f1",
      spark: upTo.map((p) => ({ v: Number(p.income) })),
      goodWhenUp: true,
    },
    {
      label: "Gastos Totales",
      kpi: data?.kpis.expense,
      icon: ArrowDownRight,
      tint: "bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400",
      stroke: "#f43f5e",
      spark: upTo.map((p) => ({ v: Number(p.expense) })),
      goodWhenUp: false,
    },
    {
      label: "Utilidad Neta",
      kpi: data?.kpis.netIncome,
      icon: BarChart3,
      tint: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
      stroke: "#10b981",
      spark: upTo.map((p) => ({ v: Number(p.income) - Number(p.expense) })),
      goodWhenUp: true,
    },
    {
      label: "Flujo de Efectivo",
      kpi: data?.kpis.cashFlow,
      icon: Wallet,
      tint: "bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400",
      stroke: "#0ea5e9",
      spark: upTo.map((p) => ({ v: Number(p.cash) })),
      goodWhenUp: true,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((k) => (
        <Card key={k.label} className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${k.tint}`}>
                <k.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-slate-500">{k.label}</p>
                {isLoading ? (
                  <Skeleton className="mt-1.5 h-7 w-28" />
                ) : (
                  <p className="mt-0.5 truncate text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {money(k.kpi?.value ?? 0)}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-3 flex items-end justify-between gap-2">
              <Delta pct={k.kpi?.changePct ?? null} goodWhenUp={k.goodWhenUp} isLoading={isLoading} />
              {k.spark.length > 1 && (
                <div className="h-10 w-24 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={k.spark} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id={`sp-${k.label}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={k.stroke} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={k.stroke} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone" dataKey="v" stroke={k.stroke} strokeWidth={1.5}
                        fill={`url(#sp-${k.label})`} dot={false} isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * La variación contra el mes anterior.
 *
 * Que un número suba no es bueno por sí solo: en Gastos, subir es malo. Por eso
 * el color lo decide `goodWhenUp`, no el signo. Y sin mes anterior con
 * movimiento no hay variación — no es 0%, es "no aplica".
 */
function Delta({
  pct,
  goodWhenUp,
  isLoading,
}: {
  pct: string | null;
  goodWhenUp: boolean;
  isLoading: boolean;
}) {
  if (isLoading) return <Skeleton className="h-4 w-24" />;
  if (pct === null) {
    return <span className="text-[11px] text-slate-400">Sin mes anterior para comparar</span>;
  }

  const n = Number(pct);
  const up = n > 0;
  const good = n === 0 ? null : up === goodWhenUp;
  const color =
    good === null ? "text-slate-500" : good ? "text-emerald-600" : "text-rose-600";
  const Arrow = up ? ArrowUpRight : ArrowDownRight;

  return (
    <span className="flex items-center gap-1 text-xs">
      <span className={`flex items-center font-semibold tabular-nums ${color}`}>
        {n !== 0 && <Arrow className="h-3.5 w-3.5" />}
        {n > 0 ? "+" : ""}{pct}%
      </span>
      <span className="text-slate-400">vs mes anterior</span>
    </span>
  );
}

// ── Gráficos ─────────────────────────────────────────────────────────────────

function IncomeVsExpense({ data, isLoading }: { data?: DashboardData; isLoading: boolean }) {
  const rows = (data?.monthly ?? []).map((p) => ({
    mes: MONTHS[p.period - 1].slice(0, 3),
    Ingresos: Number(p.income),
    Gastos: Number(p.expense),
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Ingresos vs Gastos</CardTitle>
        <p className="text-xs text-slate-500">Movimiento mensual del año {data?.year ?? ""}</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[240px] w-full" />
        ) : (
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rows} margin={{ top: 5, right: 5, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="gIng" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gGas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis
                  tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }}
                  tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : String(v))}
                />
                <RTooltip
                  formatter={(v: any, n: any) => [moneyExact(v), n]}
                  contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                />
                <Area type="monotone" dataKey="Ingresos" stroke="#6366f1" strokeWidth={2} fill="url(#gIng)" />
                <Area type="monotone" dataKey="Gastos" stroke="#f43f5e" strokeWidth={2} fill="url(#gGas)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="mt-1 flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-indigo-500" /> Ingresos
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-500" /> Gastos
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function ExpenseBreakdown({ data, isLoading }: { data?: DashboardData; isLoading: boolean }) {
  const slices = data?.expenseBreakdown ?? [];
  const rows = slices.map((s) => ({ name: s.name, value: Number(s.amount) }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Distribución de Gastos</CardTitle>
        <p className="text-xs text-slate-500">{MONTHS[(data?.month ?? 1) - 1]}</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[240px] w-full" />
        ) : rows.length === 0 ? (
          <p className="py-20 text-center text-sm text-slate-400">Sin gastos registrados este mes.</p>
        ) : (
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="relative h-[170px] w-[170px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={rows} dataKey="value" nameKey="name"
                    innerRadius={54} outerRadius={82} paddingAngle={2} strokeWidth={0}
                  >
                    {rows.map((_, i) => (
                      <Cell key={i} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RTooltip
                    formatter={(v: any, n: any) => [moneyExact(v), n]}
                    contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
                  {money(data?.expenseTotal ?? 0)}
                </span>
                <span className="text-[11px] text-slate-400">Total</span>
              </div>
            </div>

            <div className="w-full flex-1 space-y-1.5">
              {slices.map((s, i) => (
                <div key={s.name} className="flex items-center gap-2 text-[13px]">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length] }}
                  />
                  <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-400">{s.name}</span>
                  <span className="shrink-0 tabular-nums text-slate-400">{s.pct}%</span>
                  <span className="w-24 shrink-0 text-right font-medium tabular-nums text-slate-900 dark:text-slate-200">
                    {money(s.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── CxC / CxP ────────────────────────────────────────────────────────────────

function OpenItemsCard({
  title,
  href,
  emptyLabel,
  block,
  isLoading,
}: {
  title: string;
  href: string;
  emptyLabel: string;
  block?: DashboardData["receivables"];
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <Link href={href} className="text-xs font-medium text-indigo-600 hover:underline">
          Ver todas
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-36" />
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-6 w-full" />)}
          </div>
        ) : (
          <>
            <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {money(block?.total ?? 0)}
            </p>
            <p className="mb-3 text-xs text-slate-500">Total pendiente</p>

            {(block?.items.length ?? 0) === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">{emptyLabel}</p>
            ) : (
              <div className="space-y-1.5">
                {block!.items.map((it) => (
                  <div key={it.name} className="flex items-center gap-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-400">
                      {it.name}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums text-slate-900 dark:text-slate-200">
                      {money(it.balance)}
                    </span>
                    <Overdue days={it.daysOverdue} />
                  </div>
                ))}
                {(block!.othersCount ?? 0) > 0 && (
                  <div className="flex items-center gap-2 border-t pt-1.5 text-[13px] text-slate-400">
                    <span className="min-w-0 flex-1 truncate">
                      Otros ({block!.othersCount})
                    </span>
                    <span className="shrink-0 tabular-nums">{money(block!.othersBalance)}</span>
                    <span className="w-[68px]" />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Días de atraso de la partida más vieja. El color es un semáforo de cobranza:
 * al día, vencido hace poco, vencido hace mucho. Un número negativo significa
 * que aún no vence, así que no es un atraso.
 */
function Overdue({ days }: { days: number }) {
  if (days <= 0) {
    return (
      <span className="flex w-[68px] shrink-0 items-center justify-end gap-1 text-[11px] text-slate-400">
        al día <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
    );
  }
  const color = days > 60 ? "bg-rose-500" : days > 30 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <span className="flex w-[68px] shrink-0 items-center justify-end gap-1 text-[11px] text-slate-500">
      {days} días <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
    </span>
  );
}

// ── Columna derecha ──────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: "Nueva Factura", hint: "Emitir comprobante con NCF", href: "/fiscal/documents", icon: Receipt, tint: "bg-indigo-100 text-indigo-600" },
  { label: "Nueva Compra", hint: "Registrar orden de compra", href: "/purchase-management", icon: ShoppingCart, tint: "bg-emerald-100 text-emerald-600" },
  { label: "Registrar Gasto", hint: "Factura de proveedor", href: "/payables", icon: FileText, tint: "bg-rose-100 text-rose-600" },
  { label: "Nuevo Cliente", hint: "Agregar cliente", href: "/customer-management", icon: UserPlus, tint: "bg-sky-100 text-sky-600" },
  { label: "Cobro Recibido", hint: "Aplicar a cuentas por cobrar", href: "/receivables", icon: Banknote, tint: "bg-violet-100 text-violet-600" },
];

function QuickActions() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Acciones rápidas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {QUICK_ACTIONS.map((a) => (
          <Link
            key={a.label}
            href={a.href}
            className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900"
          >
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${a.tint}`}>
              <a.icon className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-200">{a.label}</p>
              <p className="truncate text-[11px] text-slate-500">{a.hint}</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function FinancialSummary({ data, isLoading }: { data?: DashboardData; isLoading: boolean }) {
  const s = data?.summary;
  const rows = [
    { label: "Activo Total", value: s?.assets },
    { label: "Pasivo Total", value: s?.liabilities },
    { label: "Patrimonio", value: s?.equity },
    { label: "Utilidad del Ejercicio", value: s?.netIncome },
  ];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">Resumen Financiero</CardTitle>
        <Link href="/accounting/financial-statements" className="text-xs font-medium text-indigo-600 hover:underline">
          Ver reporte
        </Link>
      </CardHeader>
      <CardContent className="space-y-0">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between border-b py-2.5 last:border-0 dark:border-slate-800">
            <span className="text-[13px] text-slate-600 dark:text-slate-400">{r.label}</span>
            {isLoading ? (
              <Skeleton className="h-4 w-24" />
            ) : (
              <span className="text-[13px] font-semibold tabular-nums text-slate-900 dark:text-slate-200">
                {money(r.value ?? 0)}
              </span>
            )}
          </div>
        ))}
        <div className="flex items-center justify-between pt-2.5">
          <span className="text-[13px] text-slate-600 dark:text-slate-400">Margen de Utilidad</span>
          {isLoading ? (
            <Skeleton className="h-4 w-16" />
          ) : s?.marginPct === null || s?.marginPct === undefined ? (
            <span className="text-[13px] text-slate-400">—</span>
          ) : (
            <span
              className={`flex items-center gap-0.5 text-[13px] font-semibold tabular-nums ${
                Number(s.marginPct) >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {s.marginPct}%
              {Number(s.marginPct) >= 0 ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5" />
              )}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const SHORTCUTS = [
  { label: "Contabilidad", href: "/accounting/accounts", icon: Calculator, tint: "bg-indigo-100 text-indigo-600" },
  { label: "Inventario", href: "/inventory-costing", icon: Boxes, tint: "bg-rose-100 text-rose-600" },
  { label: "Fiscal DGII", href: "/fiscal/reports", icon: Receipt, tint: "bg-emerald-100 text-emerald-600" },
  { label: "Compras", href: "/purchase-management", icon: ShoppingCart, tint: "bg-amber-100 text-amber-600" },
  { label: "Nómina", href: "/payroll", icon: Users, tint: "bg-sky-100 text-sky-600" },
  { label: "Tesorería", href: "/treasury", icon: Landmark, tint: "bg-violet-100 text-violet-600" },
  { label: "Reportes", href: "/reports", icon: BarChart3, tint: "bg-slate-100 text-slate-600" },
  { label: "Empresas", href: "/companies", icon: Building2, tint: "bg-teal-100 text-teal-600" },
];

function ModuleShortcuts() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Atajos de módulos</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-2">
          {SHORTCUTS.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className="flex flex-col items-center gap-1.5 rounded-lg p-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.tint}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <span className="w-full truncate text-center text-[10px] text-slate-600 dark:text-slate-400">
                {s.label}
              </span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
