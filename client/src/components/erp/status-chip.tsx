import { cn } from "@/lib/utils";

/**
 * Estado de un documento en una rejilla.
 *
 * El color es semántico y está reservado: rojo es vencido o anulado, ámbar es
 * pendiente de alguien, verde es cerrado sin deuda, gris es borrador. Ninguno
 * de los cuatro se usa para acciones — para eso está el petróleo del acento.
 */
export type Status = "draft" | "pending" | "ok" | "overdue" | "void";

const STYLES: Record<Status, string> = {
  draft: "border-border-strong text-muted-foreground",
  pending: "border-warning/40 bg-warning/10 text-warning",
  ok: "border-success/40 bg-success/10 text-success",
  overdue: "border-destructive/40 bg-destructive/10 text-destructive",
  void: "border-border-strong bg-muted text-muted-foreground line-through",
};

export function StatusChip({
  status, children, className,
}: {
  status: Status;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-px text-[11px] font-medium leading-[16px]",
        STYLES[status],
        className,
      )}
    >
      {children}
    </span>
  );
}
