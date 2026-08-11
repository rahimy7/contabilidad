import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { apiRequest } from "@/lib/queryClient";
import {
  TrendingUp, TrendingDown, Minus, DollarSign, Users, Package, ShoppingCart,
  AlertTriangle, CheckCircle2, Clock, Wallet, Receipt, Activity,
} from "lucide-react";

const money = (v: string | number) =>
  Number(v ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const moneyExact = (v: string | number) =>
  Number(v ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Dashboard ejecutivo — consolida ventas, caja, aging, top clientes, alertas. */
export default function ExecutiveDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/executive-dashboard"],
    queryFn: () => apiRequest("GET", "/api/executive-dashboard"),
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-muted animate-pulse rounded w-64" />
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded" />
          ))}
        </div>
      </div>
    );
  }

  const d = data;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Activity className="w-8 h-8 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold">Panel Ejecutivo</h1>
            <p className="text-muted-foreground">KPIs consolidados al {d.asOf}</p>
          </div>
        </div>
      </div>

      {/* Alerts strip */}
      {(d.alerts.overduePayables > 0 || d.alerts.overdueReceivables > 0 || d.alerts.lowStockCount > 0 || d.alerts.pendingApprovals > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <AlertPill
            icon={<Clock className="w-4 h-4" />}
            label="AP vencidas"
            value={d.alerts.overduePayables}
            severity="danger"
            href="/payables"
          />
          <AlertPill
            icon={<Clock className="w-4 h-4" />}
            label="AR vencidas"
            value={d.alerts.overdueReceivables}
            severity="warning"
            href="/receivables"
          />
          <AlertPill
            icon={<Package className="w-4 h-4" />}
            label="Stock bajo"
            value={d.alerts.lowStockCount}
            severity="warning"
            href="/product-management"
          />
          <AlertPill
            icon={<CheckCircle2 className="w-4 h-4" />}
            label="Aprobaciones pendientes"
            value={d.alerts.pendingApprovals}
            severity="info"
            href="/approvals"
          />
        </div>
      )}

      {/* Row 1: Ventas + Caja */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SalesCard sales={d.sales} />
        <CashCard cash={d.cash} />
        <PurchasesCard purchases={d.purchases} />
      </div>

      {/* Row 2: Aging */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AgingCard title="Cuentas por Cobrar" data={d.arAging} type="ar" />
        <AgingCard title="Cuentas por Pagar" data={d.apAging} type="ap" />
      </div>

      {/* Row 3: Top customers + Top products */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" /> Top Clientes del Mes
              </CardTitle>
              <Link href="/customers"><span className="text-xs text-blue-600 hover:underline">ver todos</span></Link>
            </div>
          </CardHeader>
          <CardContent>
            {d.topCustomers.length ? (
              <div className="space-y-2">
                {d.topCustomers.map((c: any, i: number) => (
                  <div key={c.id} className="flex justify-between items-center p-2 rounded hover:bg-muted">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 flex items-center justify-center text-xs font-bold">
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.orderCount} pedidos</p>
                      </div>
                    </div>
                    <p className="font-mono text-sm font-semibold">RD$ {money(c.revenue)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground py-8">Sin ventas este mes</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="w-4 h-4" /> Top Productos del Mes
              </CardTitle>
              <Link href="/product-management"><span className="text-xs text-blue-600 hover:underline">ver todos</span></Link>
            </div>
          </CardHeader>
          <CardContent>
            {d.topProducts.length ? (
              <div className="space-y-2">
                {d.topProducts.map((p: any, i: number) => (
                  <div key={p.id} className="flex justify-between items-center p-2 rounded hover:bg-muted">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-600 flex items-center justify-center text-xs font-bold">
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{p.sku ?? "—"} · {p.qty} un.</p>
                      </div>
                    </div>
                    <p className="font-mono text-sm font-semibold">RD$ {money(p.revenue)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground py-8">Sin ventas este mes</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Orders by status */}
      {d.ordersByStatus.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" /> Órdenes por Estado (últimos 30 días)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {d.ordersByStatus.map((s: any) => (
                <Link key={s.status} href="/order-management">
                  <Card className="cursor-pointer hover:shadow-md transition">
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground capitalize">{s.status}</p>
                      <p className="text-2xl font-bold">{s.count}</p>
                      <p className="text-xs font-mono text-muted-foreground">RD$ {money(s.amount)}</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AlertPill({ icon, label, value, severity, href }: {
  icon: React.ReactNode; label: string; value: number;
  severity: "danger" | "warning" | "info"; href: string;
}) {
  if (value === 0) return null;
  const cls = severity === "danger" ? "border-red-500 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400"
    : severity === "warning" ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20 text-yellow-700 dark:text-yellow-400"
    : "border-blue-500 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400";
  return (
    <Link href={href}>
      <Card className={`border-l-4 ${cls} cursor-pointer hover:shadow`}>
        <CardContent className="pt-3 pb-3 flex items-center gap-2">
          {icon}
          <div className="flex-1 min-w-0">
            <p className="text-xs">{label}</p>
            <p className="text-lg font-bold">{value}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function TrendIcon({ dir }: { dir: "up" | "down" | "flat" }) {
  if (dir === "up") return <TrendingUp className="w-4 h-4 text-green-600" />;
  if (dir === "down") return <TrendingDown className="w-4 h-4 text-red-600" />;
  return <Minus className="w-4 h-4 text-muted-foreground" />;
}

function SalesCard({ sales }: { sales: any }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-green-600" /> Ventas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold font-mono">RD$ {money(sales.thisMonth.current)}</p>
            <TrendIcon dir={sales.thisMonth.direction} />
            {sales.thisMonth.changePct != null && (
              <span className={`text-sm font-medium ${
                sales.thisMonth.direction === "up" ? "text-green-600" :
                sales.thisMonth.direction === "down" ? "text-red-600" : "text-muted-foreground"
              }`}>
                {sales.thisMonth.changePct > 0 ? "+" : ""}{sales.thisMonth.changePct}%
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Este mes · vs mes anterior RD$ {money(sales.lastMonth)}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">Hoy</p>
            <p className="font-mono font-semibold">RD$ {money(sales.today)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Órdenes mes</p>
            <p className="font-semibold">{sales.ordersMonth}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Ticket prom.</p>
            <p className="font-mono font-semibold">RD$ {money(sales.avgTicketMonth)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CashCard({ cash }: { cash: any }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Wallet className="w-4 h-4 text-blue-600" /> Posición de Caja
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground">Posición neta</p>
          <p className={`text-3xl font-bold font-mono ${cash.netPosition >= 0 ? "text-blue-600" : "text-red-600"}`}>
            RD$ {money(cash.netPosition)}
          </p>
          <p className="text-xs text-muted-foreground">bancos + AR − AP</p>
        </div>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">💰 Bancos</span>
            <span className="font-mono">RD$ {money(cash.bankBalance)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground text-green-700">↗ Por cobrar (AR)</span>
            <span className="font-mono text-green-700">+RD$ {money(cash.arTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground text-red-700">↘ Por pagar (AP)</span>
            <span className="font-mono text-red-700">−RD$ {money(cash.apTotal)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PurchasesCard({ purchases }: { purchases: any }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Receipt className="w-4 h-4 text-purple-600" /> Compras · ITBIS
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold font-mono">RD$ {money(purchases.thisMonth.current)}</p>
            <TrendIcon dir={purchases.thisMonth.direction} />
            {purchases.thisMonth.changePct != null && (
              <span className={`text-xs font-medium ${purchases.thisMonth.direction === "up" ? "text-red-600" : "text-green-600"}`}>
                {purchases.thisMonth.changePct > 0 ? "+" : ""}{purchases.thisMonth.changePct}%
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Compras del mes</p>
        </div>
        <div className="pt-2 border-t space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">ITBIS cobrado (ventas)</span>
            <span className="font-mono text-green-700">+{money(purchases.itbisCollected)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">ITBIS pagado (compras)</span>
            <span className="font-mono text-red-700">−{money(purchases.itbisPaid)}</span>
          </div>
          <div className="flex justify-between pt-1 border-t font-semibold">
            <span>ITBIS a pagar DGII</span>
            <span className={`font-mono ${purchases.itbisNet > 0 ? "text-red-700" : "text-green-700"}`}>
              RD$ {money(purchases.itbisNet)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AgingCard({ title, data, type }: { title: string; data: any; type: "ar" | "ap" }) {
  const currentPct = data.total > 0 ? (data.current / data.total) * 100 : 0;
  const d3060Pct = data.total > 0 ? (data.days30_60 / data.total) * 100 : 0;
  const d6090Pct = data.total > 0 ? (data.days60_90 / data.total) * 100 : 0;
  const over90Pct = data.total > 0 ? (data.over90 / data.total) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-base">{title}</CardTitle>
          {data.overduePct > 20 && (
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="w-3 h-3 mr-1" /> {data.overduePct}% vencido
            </Badge>
          )}
        </div>
        <CardDescription>Total RD$ {moneyExact(data.total)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2 text-sm">
          <AgingRow label="Vigente (0 días)" value={data.current} pct={currentPct} color="bg-green-500" />
          <AgingRow label="1-30 días" value={data.days30_60} pct={d3060Pct} color="bg-yellow-500" />
          <AgingRow label="31-60 días" value={data.days60_90} pct={d6090Pct} color="bg-orange-500" />
          <AgingRow label="60+ días" value={data.over90} pct={over90Pct} color="bg-red-500" />
        </div>
        <Link href={type === "ar" ? "/receivables" : "/payables"}>
          <span className="text-xs text-blue-600 hover:underline">ver detalle →</span>
        </Link>
      </CardContent>
    </Card>
  );
}

function AgingRow({ label, value, pct, color }: { label: string; value: number; pct: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs">{label}</span>
        <span className="text-xs font-mono">RD$ {moneyExact(value)}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
