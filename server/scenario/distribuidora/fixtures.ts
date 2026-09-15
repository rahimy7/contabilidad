/**
 * Master data for the month simulation: "Distribuidora Caribe", a wholesale and
 * retail distributor of groceries and home appliances in Santo Domingo, run
 * through October 2026.
 *
 * Every figure here is chosen to exercise a rule, not for realism alone:
 * exempt, 16% and 18% ITBIS products; weighted-average and FIFO products with
 * lots and expiry; a consumable supply; a service; customers on cash, on credit
 * with limits, and the State (B15, withholds taxes); suppliers who are legal
 * entities, individuals subject to withholding, a landlord and a utility.
 *
 * The test-plan document (docs/plan-pruebas-distribuidora-octubre-2026.md)
 * describes the same data, case by case, with the same codes.
 */

export const SCENARIO_YEAR = 2026;
export const SCENARIO_MONTH = 10;
export const OCT = (day: number) => `2026-10-${String(day).padStart(2, "0")}`;
export const NOV = (day: number) => `2026-11-${String(day).padStart(2, "0")}`;

export const COMPANY = {
  legalName: "Distribuidora Caribe SRL",
  tradeName: "Distribuidora Caribe",
};

export const USERS = [
  { key: "gerente", name: "Carlos Méndez", role: "admin" },
  { key: "contador", name: "Laura Peña", role: "accountant" },
  { key: "comprador", name: "Luis Castillo", role: "purchasing" },
  { key: "almacenista", name: "Ramón Díaz", role: "warehouse" },
  { key: "vendedor1", name: "José Martínez", role: "seller" },
  { key: "vendedor2", name: "María Santos", role: "seller" },
  { key: "cajera", name: "Rosa Jiménez", role: "cashier" },
  { key: "rrhh", name: "Carmen Vargas", role: "hr" },
] as const;
export type UserKey = (typeof USERS)[number]["key"];

export const WAREHOUSES = [
  { key: "CENTRAL", name: "Almacén Central (Santo Domingo)", isDefault: true },
  { key: "TIENDA", name: "Sala de ventas / mostrador" },
  { key: "SANTIAGO", name: "Sucursal Santiago" },
  { key: "AVERIAS", name: "Cuarentena y averías" },
] as const;
export type WarehouseKey = (typeof WAREHOUSES)[number]["key"];

export interface ProductSeed {
  key: string;
  name: string;
  type: "product" | "service";
  taxCode: "ITBIS18" | "ITBIS16" | "EXENTO";
  price: string;
  cost?: string;
  method?: "average" | "fifo";
  inventoryAccount?: "1.1.03.001" | "1.1.03.002";
  category: string;
}

export const PRODUCTS: ProductSeed[] = [
  { key: "P01", name: "Arroz Selecto 25 lb", type: "product", taxCode: "EXENTO", price: "1450", cost: "1150", method: "average", category: "Granos" },
  { key: "P02", name: "Aceite vegetal 1 galón", type: "product", taxCode: "ITBIS18", price: "720", cost: "520", method: "average", category: "Aceites" },
  { key: "P03", name: "Café molido 1 lb", type: "product", taxCode: "ITBIS16", price: "360", cost: "260", method: "average", category: "Café" },
  { key: "P04", name: "Leche en polvo 2.2 lb", type: "product", taxCode: "EXENTO", price: "820", cost: "610", method: "fifo", category: "Lácteos" },
  { key: "P05", name: "Detergente en polvo 5 kg", type: "product", taxCode: "ITBIS18", price: "690", cost: "480", method: "average", category: "Limpieza" },
  { key: "P06", name: "Galletas surtidas caja 24", type: "product", taxCode: "ITBIS18", price: "520", cost: "350", method: "fifo", category: "Galletas" },
  { key: "P07", name: "Refresco 2 L paquete de 8", type: "product", taxCode: "ITBIS18", price: "600", cost: "410", method: "average", category: "Bebidas" },
  { key: "P08", name: "Nevera 10 pies", type: "product", taxCode: "ITBIS18", price: "26900", cost: "18500", method: "fifo", category: "Electrodomésticos" },
  { key: "P09", name: "Televisor 55 pulgadas", type: "product", taxCode: "ITBIS18", price: "34500", cost: "24000", method: "fifo", category: "Electrodomésticos" },
  { key: "P10", name: "Licuadora 10 velocidades", type: "product", taxCode: "ITBIS18", price: "3250", cost: "2100", method: "average", category: "Electrodomésticos" },
  { key: "SUM01", name: "Resma papel carta", type: "product", taxCode: "ITBIS18", price: "0", cost: "280", method: "average", inventoryAccount: "1.1.03.002", category: "Suministros" },
  { key: "S01", name: "Servicio de entrega e instalación", type: "service", taxCode: "ITBIS18", price: "1500", category: "Servicios" },
];

export interface CustomerSeed {
  key: string;
  name: string;
  rnc?: string;
  creditDays: number;
  creditLimit: string;
  itbisRetentionPercent?: string;
  isrRetentionPercent?: string;
  ncfType: "B01" | "B02" | "B15";
}

export const CUSTOMERS: CustomerSeed[] = [
  { key: "C01", name: "Supermercado La Económica SRL", rnc: "130555001", creditDays: 30, creditLimit: "900000", ncfType: "B01" },
  { key: "C02", name: "Colmado Don Pepe (Pedro Almonte)", rnc: "00112345678", creditDays: 15, creditLimit: "60000", ncfType: "B01" },
  { key: "C03", name: "Hotel Playa Dorada SA", rnc: "130555003", creditDays: 30, creditLimit: "400000", ncfType: "B01" },
  { key: "C04", name: "Ministerio de Educación", rnc: "401000011", creditDays: 45, creditLimit: "1000000", itbisRetentionPercent: "30", isrRetentionPercent: "5", ncfType: "B15" },
  { key: "C05", name: "Consumidor final", creditDays: 0, creditLimit: "0", ncfType: "B02" },
  { key: "C06", name: "Rosa Jiménez (empleada)", rnc: "00133344455", creditDays: 0, creditLimit: "0", ncfType: "B02" },
  { key: "C07", name: "Tienda Mi Barrio SRL", rnc: "130555007", creditDays: 30, creditLimit: "80000", ncfType: "B01" },
];

export interface SupplierSeed {
  key: string;
  name: string;
  rnc: string;
  counterpartyType: "persona_fisica" | "persona_juridica";
  operationType: "bienes" | "servicios";
  paymentTermsDays: number;
  expenseType: string;
}

export const SUPPLIERS: SupplierSeed[] = [
  { key: "V01", name: "Distribuidora Nacional de Alimentos SRL", rnc: "101555001", counterpartyType: "persona_juridica", operationType: "bienes", paymentTermsDays: 30, expenseType: "09" },
  { key: "V02", name: "ElectroImport del Caribe SRL", rnc: "101555002", counterpartyType: "persona_juridica", operationType: "bienes", paymentTermsDays: 45, expenseType: "09" },
  { key: "V03", name: "Transporte Juan Pérez", rnc: "00198765432", counterpartyType: "persona_fisica", operationType: "servicios", paymentTermsDays: 15, expenseType: "02" },
  { key: "V04", name: "Inmobiliaria Rosado (Ana Rosado)", rnc: "00255566677", counterpartyType: "persona_fisica", operationType: "servicios", paymentTermsDays: 5, expenseType: "03" },
  { key: "V05", name: "Empresa Distribuidora de Electricidad del Este", rnc: "101555005", counterpartyType: "persona_juridica", operationType: "servicios", paymentTermsDays: 20, expenseType: "02" },
  { key: "V06", name: "Contadores y Auditores Asociados SRL", rnc: "101555006", counterpartyType: "persona_juridica", operationType: "servicios", paymentTermsDays: 30, expenseType: "02" },
  { key: "V07", name: "Autos del Este SRL", rnc: "101555007", counterpartyType: "persona_juridica", operationType: "bienes", paymentTermsDays: 15, expenseType: "10" },
  { key: "V08", name: "Papelería Nacional SRL", rnc: "101555008", counterpartyType: "persona_juridica", operationType: "bienes", paymentTermsDays: 30, expenseType: "02" },
  { key: "V09", name: "CompuOffice SRL", rnc: "101555009", counterpartyType: "persona_juridica", operationType: "bienes", paymentTermsDays: 30, expenseType: "10" },
];

/**
 * Staff by department. `commission` and the variable inputs are what the
 * October run pays on top of the contract salary.
 */
export interface EmployeeSeed {
  key: string;
  firstName: string;
  lastName: string;
  cedula: string;
  department: string;
  position: string;
  salary: number;
  hireDate: string;
  user?: UserKey;
  /** October variable pay. */
  overtime35Hours?: string;
  overtime100Hours?: string;
  incentive?: string;
  bonus?: string;
  loanDeduction?: string;
  earnsCommission?: boolean;
}

export const EMPLOYEES: EmployeeSeed[] = [
  { key: "E01", firstName: "Carlos", lastName: "Méndez", cedula: "00111111111", department: "Gerencia", position: "Gerente General", salary: 180000, hireDate: "2019-01-15", user: "gerente" },
  { key: "E02", firstName: "Laura", lastName: "Peña", cedula: "00111111112", department: "Administración y Finanzas", position: "Contadora", salary: 85000, hireDate: "2021-03-01", user: "contador" },
  { key: "E03", firstName: "Pedro", lastName: "Gil", cedula: "00111111113", department: "Administración y Finanzas", position: "Auxiliar contable", salary: 38000, hireDate: "2023-06-01" },
  { key: "E04", firstName: "Ana", lastName: "Rosario", cedula: "00111111114", department: "Ventas", position: "Gerente de Ventas", salary: 70000, hireDate: "2022-02-01", incentive: "7000" },
  { key: "E05", firstName: "José", lastName: "Martínez", cedula: "00111111115", department: "Ventas", position: "Vendedor", salary: 25000, hireDate: "2024-01-10", user: "vendedor1", earnsCommission: true },
  { key: "E06", firstName: "María", lastName: "Santos", cedula: "00111111116", department: "Ventas", position: "Vendedora", salary: 25000, hireDate: "2024-05-02", user: "vendedor2", earnsCommission: true },
  { key: "E07", firstName: "Luis", lastName: "Castillo", cedula: "00111111117", department: "Compras", position: "Comprador", salary: 45000, hireDate: "2022-09-01", user: "comprador" },
  { key: "E08", firstName: "Ramón", lastName: "Díaz", cedula: "00111111118", department: "Almacén y Logística", position: "Jefe de almacén", salary: 40000, hireDate: "2020-07-01", user: "almacenista", overtime35Hours: "10" },
  { key: "E09", firstName: "Félix", lastName: "Reyes", cedula: "00111111119", department: "Almacén y Logística", position: "Almacenista", salary: 22000, hireDate: "2023-02-15", overtime35Hours: "12", overtime100Hours: "4", loanDeduction: "1500" },
  { key: "E10", firstName: "Rosa", lastName: "Jiménez", cedula: "00111111120", department: "Caja", position: "Cajera", salary: 21000, hireDate: "2024-08-01", user: "cajera", incentive: "2000" },
  { key: "E11", firstName: "Miguel", lastName: "Ortiz", cedula: "00111111121", department: "Almacén y Logística", position: "Chofer repartidor", salary: 23000, hireDate: "2021-11-01", incentive: "3500" },
  { key: "E12", firstName: "Carmen", lastName: "Vargas", cedula: "00111111122", department: "Recursos Humanos", position: "Encargada de RRHH", salary: 55000, hireDate: "2022-04-01", user: "rrhh", bonus: "5000" },
  { key: "E13", firstName: "Juan", lastName: "Paredes", cedula: "00111111123", department: "Almacén y Logística", position: "Ayudante de almacén", salary: 20000, hireDate: "2026-10-15" },
];

export const BANKS = [
  { key: "BRV", code: "BRV-001", name: "Banreservas cuenta corriente", bankName: "Banreservas", accountNumber: "960-123456-7" },
  { key: "POP", code: "POP-001", name: "Banco Popular cuenta corriente", bankName: "Banco Popular", accountNumber: "812-654321-0" },
] as const;

export const NCF_RANGES: Array<[string, number, number]> = [
  ["B01", 1, 500], ["B02", 1, 2000], ["B03", 1, 100], ["B04", 1, 200], ["B14", 1, 100], ["B15", 1, 100],
];
