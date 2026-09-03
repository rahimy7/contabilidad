import { ReactNode } from "react";

/**
 * FactBox — el panel de detalle del registro seleccionado.
 *
 * Es lo que convierte una lista en una pantalla de ERP: se elige una fila y el
 * contexto aparece al lado en vez de abrir un diálogo que tapa la lista. Sin
 * selección muestra por qué está vacío, no un rectángulo en blanco.
 */
export function FactBox({
  title, children, empty = "Selecciona una fila para ver su detalle.", isEmpty,
}: {
  title: string;
  children?: ReactNode;
  empty?: string;
  isEmpty?: boolean;
}) {
  return (
    <aside className="w-full shrink-0 border border-border bg-card lg:w-[300px]">
      <div className="border-b border-border bg-subtle px-3 py-2">
        <h3 className="text-[13px] font-semibold">{title}</h3>
      </div>
      {isEmpty ? (
        <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-2.5 px-3 py-3">{children}</div>
      )}
    </aside>
  );
}

/** Una línea etiqueta/valor dentro del FactBox. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-medium tabular-nums">{children}</span>
    </div>
  );
}
