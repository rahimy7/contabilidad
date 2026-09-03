import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle2, ChevronRight, ClipboardCheck, FileWarning,
  Hash, Inbox, PackageX, ShoppingBag, ShoppingCart,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { ecfApi } from "@/lib/accounting-api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Centro de atención: lo que hoy necesita una persona, de todos los módulos.
 *
 * El panel anterior sólo miraba contabilidad. Pero un ERP se cae por los bordes
 * — un e-CF rechazado que nadie vio, una secuencia de NCF que se agota el
 * viernes, un conteo abierto hace tres semanas — y ninguno de esos aparece en un
 * estado de resultados.
 *
 * Dos decisiones de diseño que importan:
 *
 * **Sólo muestra lo que pide algo.** Una fila de seis ceros enseña a ignorar el
 * panel. Si no hay nada pendiente, esto dice que no hay nada pendiente, en una
 * línea, y desaparece.
 *
 * **La severidad está en la forma, no sólo en el color.** Un borde y un ícono
 * distinguen lo urgente de lo informativo sin depender de que alguien distinga
 * ámbar de rojo en una pantalla mal calibrada.
 */

type Severity = "critical" | "warning" | "info";

interface Alert {
  key: string;
  label: string;
  detail: string;
  count: number;
  href: string;
  icon: any;
  severity: Severity;
}

const SEVERITY_STYLE: Record<Severity, string> = {
  critical:
    "border-destructive/40 bg-destructive/5 hover:bg-destructive/10",
  warning:
    "border-warning/40 bg-warning/10 hover:bg-warning/20",
  info:
    "border-border bg-card hover:bg-muted",
};

const SEVERITY_TEXT: Record<Severity, string> = {
  critical: "text-destructive",
  warning: "text-warning",
  info: "text-foreground",
};

export default function AttentionCenter() {
  // Cada consulta pertenece al módulo dueño del dato. Ninguna es obligatoria:
  // un módulo sin configurar simplemente no aporta tarjetas, en vez de tumbar
  // el panel entero.
  const soft = { retry: false, staleTime: 60_000 } as const;

  const ecf = useQuery({
    queryKey: ["/api/ecf/dashboard"],
    queryFn: () => ecfApi.dashboard(),
    ...soft,
  });

  const counts = useQuery({
    queryKey: ["/api/wms/counts"],
    queryFn: () => apiRequest<{ counts: any[] }>("GET", "/api/wms/counts"),
    ...soft,
  });

  const orders = useQuery({
    queryKey: ["/api/orders"],
    queryFn: () => apiRequest<any[]>("GET", "/api/orders"),
    ...soft,
  });

  const purchases = useQuery({
    queryKey: ["/api/purchase-orders"],
    queryFn: () => apiRequest<any[]>("GET", "/api/purchase-orders"),
    ...soft,
  });

  const stockDrift = useQuery({
    queryKey: ["/api/inventory/stock-reconciliation"],
    queryFn: () =>
      apiRequest<{ differences: any[]; reconciled: boolean }>(
        "GET",
        "/api/inventory/stock-reconciliation",
      ),
    ...soft,
  });

  const loading =
    ecf.isLoading || counts.isLoading || orders.isLoading || purchases.isLoading;

  const alerts: Alert[] = [];

  // ── Fiscal · e-CF ─────────────────────────────────────────────────────────
  const d = ecf.data;
  if (d) {
    if (d.stuck?.length) {
      alerts.push({
        key: "ecf-stuck",
        label: "e-CF trabados",
        detail: "DGII los rechazó o se agotaron los reintentos",
        count: d.stuck.length,
        href: "/fiscal/ecf",
        icon: FileWarning,
        severity: "critical",
      });
    }
    if (d.inbox?.overdue > 0) {
      alerts.push({
        key: "ecf-overdue",
        label: "Aprobaciones vencidas",
        detail: "Pasaron los 3 días: el silencio ya contó como aceptación",
        count: d.inbox.overdue,
        href: "/fiscal/ecf",
        icon: Inbox,
        severity: "critical",
      });
    } else if (d.inbox?.pending > 0) {
      alerts.push({
        key: "ecf-pending",
        label: "Comprobantes por aprobar",
        detail: "Aprobación comercial pendiente",
        count: d.inbox.pending,
        href: "/fiscal/ecf",
        icon: Inbox,
        severity: "warning",
      });
    }
    if (d.sequenceAlerts?.length) {
      const tightest = Math.min(...d.sequenceAlerts.map((s: any) => s.remaining));
      alerts.push({
        key: "ecf-sequences",
        label: "Secuencias por agotarse",
        detail: `Quedan ${tightest} números en la más ajustada`,
        count: d.sequenceAlerts.length,
        href: "/fiscal/ecf",
        icon: Hash,
        // Quedarse sin eNCF detiene la facturación por completo, no la degrada.
        severity: tightest <= 10 ? "critical" : "warning",
      });
    }
  }

  // ── Inventario ────────────────────────────────────────────────────────────
  const openCounts = (counts.data?.counts ?? []).filter((c: any) =>
    ["open", "counting", "review"].includes(c.status),
  );
  if (openCounts.length) {
    const inReview = openCounts.filter((c: any) => c.status === "review").length;
    alerts.push({
      key: "counts",
      label: "Conteos en proceso",
      detail: inReview
        ? `${inReview} esperando revisión para aplicarse`
        : "Capturando existencias por ubicación",
      count: openCounts.length,
      href: "/inventory-count",
      icon: ClipboardCheck,
      severity: inReview ? "warning" : "info",
    });
  }

  const diffs = stockDrift.data?.differences?.length ?? 0;
  if (diffs > 0) {
    alerts.push({
      key: "stock-drift",
      label: "Diferencias de existencia",
      detail: "El conteo operativo y el valuado no coinciden",
      count: diffs,
      href: "/inventory-count",
      icon: PackageX,
      severity: "warning",
    });
  }

  // ── Ventas y compras ──────────────────────────────────────────────────────
  const pendingOrders = Array.isArray(orders.data)
    ? orders.data.filter((o: any) => o.status === "pending").length
    : 0;
  if (pendingOrders > 0) {
    alerts.push({
      key: "orders",
      label: "Pedidos pendientes",
      detail: "Sin despachar",
      count: pendingOrders,
      href: "/orders",
      icon: ShoppingCart,
      severity: "info",
    });
  }

  const openPurchases = Array.isArray(purchases.data)
    ? purchases.data.filter((p: any) => p.status === "pending" || p.status === "partial").length
    : 0;
  if (openPurchases > 0) {
    alerts.push({
      key: "purchases",
      label: "Compras por recibir",
      detail: "Órdenes abiertas o recibidas a medias",
      count: openPurchases,
      href: "/purchase-management",
      icon: ShoppingBag,
      severity: "info",
    });
  }

  // Lo urgente primero: el orden de la fila es el orden en que hay que atender.
  const rank: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-sm" />
        ))}
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <Card className="border-success/40 bg-success/5">
        <CardContent className="flex items-center gap-2.5 py-3">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
          <p className="text-[13px] text-success">
            Nada pendiente de atención: comprobantes al día, secuencias con holgura y
            existencias cuadradas.
          </p>
        </CardContent>
      </Card>
    );
  }

  const critical = alerts.filter((a) => a.severity === "critical").length;

  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2">
        <AlertTriangle
          className={`h-4 w-4 ${critical ? "text-destructive" : "text-warning"}`}
        />
        <h2 className="text-[13px] font-semibold">
          Requiere atención
        </h2>
        {critical > 0 && (
          <span className="rounded-sm bg-destructive px-1.5 py-px text-[11px] font-semibold text-destructive-foreground">
            {critical} urgente{critical > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {alerts.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.key}
              href={a.href}
              className={[
                "group flex items-start gap-3 rounded-sm border p-2.5 transition-colors",
                SEVERITY_STYLE[a.severity],
              ].join(" ")}
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${SEVERITY_TEXT[a.severity]}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span
                    className={`text-[19px] font-light tabular-nums leading-none ${SEVERITY_TEXT[a.severity]}`}
                  >
                    {a.count}
                  </span>
                  <span className="truncate text-[13px] font-medium">
                    {a.label}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                  {a.detail}
                </p>
              </div>
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
