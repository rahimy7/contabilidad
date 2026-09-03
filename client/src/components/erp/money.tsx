/**
 * Importes en pesos dominicanos.
 *
 * Dos formatos y una regla: en listas y totales van los centavos, porque un
 * descuadre de céntimos es un descuadre; en paneles y mosaicos se redondea,
 * porque ahí los centavos son ruido sobre una cifra de siete dígitos.
 */
export const money = (v: string | number | null | undefined) =>
  `RD$ ${Number(v ?? 0).toLocaleString("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const moneyShort = (v: string | number | null | undefined) =>
  `RD$ ${Math.round(Number(v ?? 0)).toLocaleString("es-DO")}`;

/** Sólo la cifra, sin símbolo: para columnas cuya cabecera ya dice "RD$". */
export const amount = (v: string | number | null | undefined) =>
  Number(v ?? 0).toLocaleString("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Celda de importe: alineada a la derecha y en rojo si es negativa. */
export function Money({
  value, short, className = "",
}: {
  value: string | number | null | undefined;
  short?: boolean;
  className?: string;
}) {
  const n = Number(value ?? 0);
  return (
    <span
      className={`tabular-nums ${n < 0 ? "text-destructive" : ""} ${className}`}
    >
      {short ? moneyShort(n) : money(n)}
    </span>
  );
}
