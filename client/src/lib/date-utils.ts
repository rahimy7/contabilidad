// Zona horaria República Dominicana: UTC-4, sin cambio de horario estacional
export const DR_TZ = 'America/Santo_Domingo';

/** Fecha y hora completa: "04/05/2026, 10:35" */
export function fmtDateTime(iso: string | Date | undefined | null): string {
  if (!iso) return '—';
  return new Date(iso as string).toLocaleString('es-DO', {
    timeZone: DR_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Solo fecha: "04/05/2026" */
export function fmtDate(iso: string | Date | undefined | null): string {
  if (!iso) return '—';
  return new Date(iso as string).toLocaleDateString('es-DO', {
    timeZone: DR_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
}

/** Solo hora: "10:35" */
export function fmtTime(iso: string | Date | undefined | null): string {
  if (!iso) return '—';
  return new Date(iso as string).toLocaleTimeString('es-DO', {
    timeZone: DR_TZ,
    hour: '2-digit', minute: '2-digit',
  });
}

/** Fecha corta día/mes: "04/05" */
export function fmtDayMonth(iso: string | Date | undefined | null): string {
  if (!iso) return '—';
  return new Date(iso as string).toLocaleDateString('es-DO', {
    timeZone: DR_TZ,
    day: '2-digit', month: '2-digit',
  });
}

/** Ahora formateado en RD (para recibos) */
export function nowDR(): string {
  return new Date().toLocaleString('es-DO', {
    timeZone: DR_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}
