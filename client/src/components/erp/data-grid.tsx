import { ReactNode } from "react";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Rejilla de datos — la envoltura que faltaba.
 *
 * 29 páginas dibujaban su propia <table>: cada una con su altura de fila, su
 * alineación de importes y su estado vacío. Aquí eso se decide una vez.
 *
 * `align: "right"` no es cosmético — las columnas de dinero sólo se pueden
 * comparar de un vistazo si las cifras terminan en la misma vertical, y por eso
 * el componente además fuerza cifras tabulares.
 */
export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Contenido de la celda. */
  cell: (row: T, index: number) => ReactNode;
  align?: "left" | "right" | "center";
  /** Ancho fijo, p. ej. "120px" o "20%". */
  width?: string;
  className?: string;
}

interface DataGridProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string | number;
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  /**
   * Fila de totales, indexada por la clave de la columna. Se dibuja como un
   * `<tfoot>` de verdad para que cada total caiga bajo su columna: un total de
   * débitos que no está exactamente debajo de los débitos obliga a rastrear la
   * cifra con el dedo, que es lo que la rejilla debía evitar.
   */
  totals?: Record<string, ReactNode>;
  /** Rótulo del pie; ocupa las columnas previas a la primera con total. */
  totalsLabel?: ReactNode;
  /** Pie libre, cuando no hay totales por columna. */
  footer?: ReactNode;
  className?: string;
  /** Cabecera fija al desplazar. Requiere un contenedor con alto acotado. */
  stickyHeader?: boolean;
}

const ALIGN = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const;

export function DataGrid<T>({
  columns, rows, rowKey, isLoading, emptyMessage = "No hay registros.",
  onRowClick, totals, totalsLabel, footer, className, stickyHeader,
}: DataGridProps<T>) {
  const firstTotal = totals ? columns.findIndex((c) => c.key in totals) : -1;
  const labelSpan = firstTotal > 0 ? firstTotal : 1;
  return (
    <div className={cn("border border-border bg-card", className)}>
      <Table>
        <TableHeader className={stickyHeader ? "sticky top-0 z-10" : undefined}>
          <TableRow>
            {columns.map((c) => (
              <TableHead
                key={c.key}
                style={c.width ? { width: c.width } : undefined}
                className={cn(ALIGN[c.align ?? "left"], c.className)}
              >
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell key={c.key}>
                    <Skeleton className="h-3.5 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, i) => (
              <TableRow
                key={rowKey(row, i)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? "cursor-pointer" : undefined}
              >
                {columns.map((c) => (
                  <TableCell key={c.key} className={cn(ALIGN[c.align ?? "left"], c.className)}>
                    {c.cell(row, i)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>

        {totals && rows.length > 0 && (
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={labelSpan} className="font-semibold">
                {totalsLabel}
              </TableCell>
              {columns.slice(labelSpan).map((c) => (
                <TableCell
                  key={c.key}
                  className={cn("font-semibold", ALIGN[c.align ?? "left"], c.className)}
                >
                  {totals[c.key] ?? null}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        )}
      </Table>
      {footer && (
        <div className="border-t border-border-strong bg-subtle px-3 py-2 text-[13px] font-semibold">
          {footer}
        </div>
      )}
    </div>
  );
}
