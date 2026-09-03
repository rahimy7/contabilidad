import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Cifra destacada del Role Center: número grande de peso 300 con una barra de
 * estado debajo.
 *
 * La barra es la única parte con color y por eso tiene que significar algo —
 * verde: dentro de lo esperado; ámbar: vigilar; rojo: fuera de rango. Un número
 * grande sin barra es sólo un número; con barra es una lectura.
 */
export type KpiTone = "good" | "watch" | "bad" | "neutral";

const BARS: Record<KpiTone, string> = {
  good: "bg-success",
  watch: "bg-warning",
  bad: "bg-destructive",
  neutral: "bg-border-strong",
};

interface KpiHeadlineProps {
  label: string;
  value: string;
  tone?: KpiTone;
  href?: string;
  hint?: string;
  isLoading?: boolean;
}

export function KpiHeadline({
  label, value, tone = "neutral", href, hint, isLoading,
}: KpiHeadlineProps) {
  return (
    <div className="min-w-[150px]">
      <p className="max-w-[170px] text-[12px] leading-snug text-muted-foreground">{label}</p>
      {isLoading ? (
        <Skeleton className="my-1 h-[42px] w-[130px]" />
      ) : (
        <p className="erp-figure">{value}</p>
      )}
      <div className={`mt-1.5 h-[3px] w-[110px] ${BARS[tone]}`} />
      {href && (
        <Link href={href} className="mt-1.5 inline-block text-[12px] text-primary hover:underline">
          › {hint ?? "Ver detalle"}
        </Link>
      )}
      {!href && hint && <p className="mt-1.5 text-[12px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** La fila de cifras destacadas, separada del resto por una línea. */
export function KpiRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-11 gap-y-5 border-b border-border pb-5">
      {children}
    </div>
  );
}
