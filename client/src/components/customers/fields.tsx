import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { StatusChip, type Status } from "@/components/erp";
import { cn } from "@/lib/utils";
import { CREDIT_LINE_STATUS } from "@shared/customer-fiscal";

const CREDIT_CHIP: Record<string, Status> = {
  none: "draft",
  active: "ok",
  suspended: "pending",
  blocked: "overdue",
};

/** Estado de la línea de crédito; sin línea pero con solicitud viva, "En evaluación". */
export function CreditChip({ status, pending }: { status: string; pending?: boolean }) {
  if (status === "none" && pending) return <StatusChip status="pending">En evaluación</StatusChip>;
  return (
    <StatusChip status={CREDIT_CHIP[status] ?? "draft"}>
      {CREDIT_LINE_STATUS[status as keyof typeof CREDIT_LINE_STATUS] ?? status}
    </StatusChip>
  );
}

/**
 * Piezas de la ficha de cliente.
 *
 * La misma ficha sirve para crear, consultar y editar. En consulta cada campo se
 * dibuja como texto — no como un input deshabilitado, que se lee como "algo que
 * no funciona" — y en edición como su control. Cambiar de modo no mueve nada de
 * sitio: la etiqueta y el ancho de cada campo son los mismos en los dos.
 */

export function Section({
  title, description, children, className, actions,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <section className={cn("border border-border bg-card", className)}>
      <header className="flex items-start justify-between gap-3 border-b border-border bg-subtle px-4 py-2">
        <div>
          <h3 className="text-[13px] font-semibold">{title}</h3>
          {description && <p className="text-[11.5px] text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </header>
      <div className="grid gap-x-5 gap-y-3 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

export function Field({
  label, required, hint, error, editing, display, children, span = 1,
}: {
  label: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string | null;
  editing: boolean;
  /** Lo que se muestra en consulta. */
  display?: ReactNode;
  children?: ReactElement;
  span?: 1 | 2 | 3;
}) {
  const spans = { 1: "", 2: "sm:col-span-2", 3: "sm:col-span-2 lg:col-span-3" };
  const empty = display === null || display === undefined || display === "";
  // La etiqueta apunta a su control: un clic la enfoca y un lector de pantalla la anuncia.
  const autoId = useId();
  const control = isValidElement<{ id?: string }>(children) ? children : null;
  const id = control?.props.id ?? autoId;
  return (
    <div className={cn("min-w-0 space-y-1", spans[span])}>
      <Label htmlFor={editing && control ? id : undefined} className="text-[11.5px] font-normal text-muted-foreground">
        {label}
        {required && editing && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {editing ? (
        control && !control.props.id ? cloneElement(control, { id }) : children
      ) : (
        <div className={cn("min-h-[22px] break-words text-[13px]", empty && "text-muted-foreground")}>
          {empty ? "—" : display}
        </div>
      )}
      {editing && error && <p className="text-[11px] text-destructive">{error}</p>}
      {editing && !error && hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Formato de fecha corto dominicano; acepta ISO de fecha o de fecha-hora. */
export const fmtDate = (v: string | null | undefined) => {
  if (!v) return null;
  const d = new Date(v.length === 10 ? `${v}T12:00:00` : v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("es-DO", { day: "2-digit", month: "short", year: "numeric" });
};

export const fmtDateTime = (v: string | null | undefined) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleString("es-DO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

/** Cuerpo de error de la API: mensaje y código de negocio. */
export const apiErrorOf = (e: unknown): { message: string; code?: string; details?: any } => {
  const err = e as { message?: string; data?: { error?: string; code?: string; details?: unknown } };
  return { message: err?.data?.error ?? err?.message ?? "Error inesperado", code: err?.data?.code, details: err?.data?.details };
};
