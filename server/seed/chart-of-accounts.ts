/**
 * Chart of accounts template for a Dominican SMB.
 *
 * A flat list: `parent_id`, `level` and `is_postable` are all derived from the
 * code, so the tree cannot drift out of sync with itself. An account is postable
 * exactly when nothing else lists it as a prefix — i.e. when it is a leaf. That
 * rule is applied once, in the seeder, instead of being hand-maintained per row
 * where a single wrong flag would let someone post to a roll-up account.
 *
 * Contra accounts (accumulated depreciation, sales discounts, allowance for
 * doubtful accounts) carry the normal side opposite to their class, which is why
 * `normalSide` is stated per account and not inferred from `accountType`.
 */

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

export interface AccountSeed {
  code: string;
  name: string;
  type: AccountType;
  /** 'D' or 'C' — the side that increases this account. */
  side: "D" | "C";
  subledger?: "AR" | "AP" | "INVENTORY" | "BANK";
  isControl?: boolean;
}

export const DR_CHART_OF_ACCOUNTS: AccountSeed[] = [
  // 1 — Activos
  { code: "1", name: "Activos", type: "asset", side: "D" },
  { code: "1.1", name: "Activos corrientes", type: "asset", side: "D" },
  { code: "1.1.01", name: "Efectivo y equivalentes", type: "asset", side: "D" },
  { code: "1.1.01.001", name: "Caja general", type: "asset", side: "D" },
  { code: "1.1.01.002", name: "Caja chica", type: "asset", side: "D" },
  { code: "1.1.01.003", name: "Bancos", type: "asset", side: "D", subledger: "BANK", isControl: true },
  { code: "1.1.02", name: "Cuentas por cobrar", type: "asset", side: "D" },
  { code: "1.1.02.001", name: "Clientes", type: "asset", side: "D", subledger: "AR", isControl: true },
  // Contra-asset: credited to increase.
  { code: "1.1.02.002", name: "Estimación para cuentas incobrables", type: "asset", side: "C" },
  { code: "1.1.03", name: "Inventarios", type: "asset", side: "D" },
  { code: "1.1.03.001", name: "Inventario de mercancías", type: "asset", side: "D", subledger: "INVENTORY", isControl: true },
  // Consumables/supplies held apart from goods for sale — their own storage.
  { code: "1.1.03.002", name: "Inventario de suministros y materiales gastables", type: "asset", side: "D", subledger: "INVENTORY", isControl: true },
  { code: "1.1.04", name: "Impuestos adelantados", type: "asset", side: "D" },
  { code: "1.1.04.001", name: "ITBIS adelantado (crédito fiscal)", type: "asset", side: "D" },
  { code: "1.1.04.002", name: "Anticipo de ISR", type: "asset", side: "D" },
  { code: "1.1.04.003", name: "ITBIS retenido por terceros", type: "asset", side: "D" },
  { code: "1.2", name: "Activos no corrientes", type: "asset", side: "D" },
  { code: "1.2.01", name: "Propiedad, planta y equipo", type: "asset", side: "D" },
  { code: "1.2.01.001", name: "Mobiliario y equipo de oficina", type: "asset", side: "D" },
  { code: "1.2.01.002", name: "Vehículos", type: "asset", side: "D" },
  { code: "1.2.01.003", name: "Depreciación acumulada", type: "asset", side: "C" },

  // 2 — Pasivos
  { code: "2", name: "Pasivos", type: "liability", side: "C" },
  { code: "2.1", name: "Pasivos corrientes", type: "liability", side: "C" },
  { code: "2.1.01", name: "Cuentas por pagar", type: "liability", side: "C" },
  { code: "2.1.01.001", name: "Proveedores", type: "liability", side: "C", subledger: "AP", isControl: true },
  { code: "2.1.02", name: "Impuestos por pagar", type: "liability", side: "C" },
  { code: "2.1.02.001", name: "ITBIS por pagar", type: "liability", side: "C" },
  { code: "2.1.02.002", name: "ITBIS retenido por pagar", type: "liability", side: "C" },
  { code: "2.1.02.003", name: "ISR retenido por pagar", type: "liability", side: "C" },
  { code: "2.1.02.004", name: "ISR por pagar", type: "liability", side: "C" },
  { code: "2.1.02.005", name: "ISR retenido pagos al exterior por pagar", type: "liability", side: "C" },
  { code: "2.1.03", name: "Obligaciones laborales", type: "liability", side: "C" },
  { code: "2.1.03.001", name: "Sueldos por pagar", type: "liability", side: "C" },
  { code: "2.1.03.002", name: "TSS por pagar", type: "liability", side: "C" },
  { code: "2.1.03.003", name: "INFOTEP por pagar", type: "liability", side: "C" },

  // 3 — Patrimonio
  { code: "3", name: "Patrimonio", type: "equity", side: "C" },
  { code: "3.1", name: "Capital", type: "equity", side: "C" },
  { code: "3.1.01", name: "Capital social", type: "equity", side: "C" },
  { code: "3.1.01.001", name: "Capital social suscrito y pagado", type: "equity", side: "C" },
  { code: "3.1.02", name: "Resultados", type: "equity", side: "C" },
  { code: "3.1.02.001", name: "Resultados acumulados", type: "equity", side: "C" },
  { code: "3.1.02.002", name: "Resultado del ejercicio", type: "equity", side: "C" },

  // 4 — Ingresos
  { code: "4", name: "Ingresos", type: "income", side: "C" },
  { code: "4.1", name: "Ingresos operacionales", type: "income", side: "C" },
  { code: "4.1.01", name: "Ventas", type: "income", side: "C" },
  { code: "4.1.01.001", name: "Ventas de mercancías", type: "income", side: "C" },
  { code: "4.1.01.002", name: "Ingresos por servicios", type: "income", side: "C" },
  { code: "4.1.02", name: "Deducciones de ventas", type: "income", side: "C" },
  // Contra-income: debited to increase.
  { code: "4.1.02.001", name: "Descuentos sobre ventas", type: "income", side: "D" },
  { code: "4.1.02.002", name: "Devoluciones sobre ventas", type: "income", side: "D" },
  { code: "4.2", name: "Ingresos no operacionales", type: "income", side: "C" },
  { code: "4.2.01", name: "Financieros", type: "income", side: "C" },
  { code: "4.2.01.001", name: "Ganancia por diferencia cambiaria", type: "income", side: "C" },

  // 5 — Costos y gastos
  { code: "5", name: "Costos y gastos", type: "expense", side: "D" },
  { code: "5.1", name: "Costo de ventas", type: "expense", side: "D" },
  { code: "5.1.01", name: "Costo de mercancías", type: "expense", side: "D" },
  { code: "5.1.01.001", name: "Costo de mercancías vendidas", type: "expense", side: "D" },
  { code: "5.2", name: "Gastos operacionales", type: "expense", side: "D" },
  { code: "5.2.01", name: "Gastos de personal", type: "expense", side: "D" },
  { code: "5.2.01.001", name: "Sueldos y salarios", type: "expense", side: "D" },
  { code: "5.2.01.002", name: "Aportes patronales TSS", type: "expense", side: "D" },
  { code: "5.2.01.003", name: "Aportes INFOTEP", type: "expense", side: "D" },
  { code: "5.2.02", name: "Gastos generales", type: "expense", side: "D" },
  { code: "5.2.02.001", name: "Alquileres", type: "expense", side: "D" },
  { code: "5.2.02.002", name: "Servicios públicos", type: "expense", side: "D" },
  { code: "5.2.02.003", name: "Honorarios profesionales", type: "expense", side: "D" },
  { code: "5.2.02.004", name: "Útiles y materiales de oficina", type: "expense", side: "D" },
  { code: "5.2.03", name: "Depreciación y amortización", type: "expense", side: "D" },
  { code: "5.2.03.001", name: "Gasto de depreciación", type: "expense", side: "D" },
  { code: "5.3", name: "Gastos no operacionales", type: "expense", side: "D" },
  { code: "5.3.01", name: "Financieros", type: "expense", side: "D" },
  { code: "5.3.01.001", name: "Pérdida por diferencia cambiaria", type: "expense", side: "D" },
  { code: "5.3.01.002", name: "Comisiones bancarias", type: "expense", side: "D" },
];

/** Depth = number of dot-separated segments. */
export const levelOf = (code: string) => code.split(".").length;

/** A leaf is an account no other account uses as a code prefix. */
export function isLeaf(code: string, all: AccountSeed[]): boolean {
  return !all.some((a) => a.code !== code && a.code.startsWith(code + "."));
}

/** Immediate parent code, or null for a root. */
export function parentCodeOf(code: string): string | null {
  const i = code.lastIndexOf(".");
  return i === -1 ? null : code.slice(0, i);
}
