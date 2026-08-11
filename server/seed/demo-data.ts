/**
 * demo-data.ts — pobla la base de datos con datos demo para todas las vistas.
 *
 * Idempotente por diseño: cada bloque hace SELECT-then-INSERT (o ON CONFLICT
 * cuando existe un índice único). Ejecutarlo dos veces deja la BD exactamente
 * como la deja una sola ejecución.
 *
 * Alcance:
 *   - Usuarios y roles (RBAC): 5 usuarios de perfiles distintos.
 *   - Catálogo: categorías, marcas, unidades, 10 productos.
 *   - Clientes y proveedores: 6 clientes, 3 proveedores.
 *   - Almacenes y stock inicial.
 *   - Compras (POs recibidas), ventas (órdenes con distintos estados).
 *   - Contabilidad: 2 asientos manuales.
 *   - Tesorería: 3 movimientos bancarios.
 *   - Fiscal: secuencia NCF + 2 facturas fiscales.
 *   - AR/AP open items.
 *   - Crédito y lealtad.
 *   - RRHH: 3 empleados con nómina de un mes.
 *   - Manufactura: 1 BOM + 1 orden de producción.
 *   - Caja: 1 sesión abierta.
 *   - Alertas: 2 reglas.
 *
 * Uso:  `yarn tsx server/seed/demo-data.ts`
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { Pool, PoolClient, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const STORE_ID = 1;
const COMPANY_ID = 1;
const CURRENCY = "DOP";

type Row = Record<string, unknown>;

async function q<T extends Row = Row>(
  c: PoolClient | Pool,
  sql: string,
  args: unknown[] = [],
): Promise<T[]> {
  const r = await c.query(sql, args);
  return r.rows as T[];
}

async function one<T extends Row = Row>(
  c: PoolClient | Pool,
  sql: string,
  args: unknown[] = [],
): Promise<T | null> {
  const rows = await q<T>(c, sql, args);
  return rows[0] ?? null;
}

async function scalar<T = unknown>(
  c: PoolClient | Pool,
  sql: string,
  args: unknown[] = [],
): Promise<T | null> {
  const r = await one<Row>(c, sql, args);
  if (!r) return null;
  const v = Object.values(r)[0];
  return (v ?? null) as T | null;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const pool = new Pool({ connectionString: url });
  try {
    console.log("→ verificando pre-requisitos");
    const company = await one(pool, `SELECT id FROM companies WHERE id=$1`, [COMPANY_ID]);
    if (!company) throw new Error(`Company ${COMPANY_ID} no existe. Corre 'yarn db:seed' primero.`);

    const settings = await one(pool, `SELECT id FROM store_settings WHERE store_id=$1`, [STORE_ID]);
    if (!settings) {
      await pool.query(
        `INSERT INTO store_settings (store_id, store_whatsapp_number, store_name, store_email, store_phone, currency)
         VALUES ($1, '+18099990001', 'Empresa Demo SRL', 'demo@empresa.do', '+18095550000', 'DOP')`,
        [STORE_ID],
      );
    }

    const warehouseId = await seedWarehouse(pool);
    await seedRolesAndUsers(pool, warehouseId);
    const units = await seedMeasurementUnits(pool);
    const categories = await seedCategories(pool);
    const brands = await seedBrands(pool);
    const products = await seedProducts(pool, { units, categories, brands });
    await seedWarehouseStock(pool, warehouseId, products);
    await seedInventoryOpeningMovements(pool, warehouseId, products);
    const custTypes = await seedCustomerTypes(pool);
    const customers = await seedCustomers(pool, custTypes);
    const suppliers = await seedSuppliers(pool);
    await seedPurchaseOrders(pool, warehouseId, products, suppliers);
    await seedSalesOrders(pool, warehouseId, products, customers);
    await seedCustomerCreditAccounts(pool, customers);
    await seedLoyalty(pool, customers);
    await seedNcfSequences(pool);
    await seedFiscalDocuments(pool, customers, suppliers);
    await seedArApOpenItems(pool, customers, suppliers);
    await seedBankTransactions(pool);
    await seedJournalEntries(pool);
    await seedHr(pool);
    await seedPayroll(pool);
    await seedManufacturing(pool, warehouseId, products);
    await seedCashSession(pool, warehouseId);
    await seedAlertRules(pool);

    await printCounts(pool);
    console.log("✓ demo data seed OK");
  } finally {
    await pool.end();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Warehouse
// ────────────────────────────────────────────────────────────────────────────
async function seedWarehouse(pool: Pool): Promise<number> {
  const existing = await one<{ id: number }>(
    pool,
    `SELECT id FROM warehouses WHERE store_id=$1 AND name='Almacén Principal'`,
    [STORE_ID],
  );
  if (existing) return existing.id;
  const r = await one<{ id: number }>(
    pool,
    `INSERT INTO warehouses (store_id, name, description, is_default, is_active)
     VALUES ($1, 'Almacén Principal', 'Almacén central de la empresa', true, true)
     RETURNING id`,
    [STORE_ID],
  );
  console.log("  · warehouse creado");
  return r!.id;
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Roles + usuarios adicionales
// ────────────────────────────────────────────────────────────────────────────
const DEMO_ROLES: Array<{ name: string; display: string; description: string }> = [
  { name: "admin", display: "Administrador", description: "Acceso total" },
  { name: "seller", display: "Vendedor", description: "Ventas y clientes" },
  { name: "cashier", display: "Cajero", description: "Caja registradora y POS" },
  { name: "warehouse", display: "Almacén", description: "Inventario y despachos" },
  { name: "accountant", display: "Contabilidad", description: "Contabilidad y finanzas" },
  { name: "hr", display: "Recursos Humanos", description: "RRHH y nómina" },
];

const DEMO_USERS: Array<{ username: string; name: string; email: string; role: string }> = [
  { username: "vendedor1", name: "María Vendedora", email: "maria.vendedora@demo.do", role: "seller" },
  { username: "cajero1", name: "Pedro Cajero", email: "pedro.cajero@demo.do", role: "cashier" },
  { username: "almacen1", name: "Juan Almacén", email: "juan.almacen@demo.do", role: "warehouse" },
  { username: "contador1", name: "Ana Contadora", email: "ana.contadora@demo.do", role: "accountant" },
  { username: "rrhh1", name: "Luis RRHH", email: "luis.rrhh@demo.do", role: "hr" },
];

async function seedRolesAndUsers(pool: Pool, warehouseId: number): Promise<void> {
  for (const r of DEMO_ROLES) {
    await pool.query(
      `INSERT INTO roles (name, display_name, description, is_system, is_active)
       VALUES ($1,$2,$3,$4,true) ON CONFLICT (name) DO NOTHING`,
      [r.name, r.display, r.description, r.name === "admin"],
    );
  }

  // Enlazar admin (user_id=1) al rol admin (idempotente).
  const adminRoleId = await scalar<number>(pool, `SELECT id FROM roles WHERE name='admin'`);
  if (adminRoleId) {
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id, is_primary)
       SELECT 1, $1, true
       WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id=1 AND role_id=$1)`,
      [adminRoleId],
    );
  }

  const passwordHash = await bcrypt.hash("demo1234", 10);
  for (const u of DEMO_USERS) {
    let uid = await scalar<number>(pool, `SELECT id FROM users WHERE username=$1`, [u.username]);
    if (!uid) {
      const r = await one<{ id: number }>(
        pool,
        `INSERT INTO users (username, password, name, email, role, status, warehouse_id)
         VALUES ($1,$2,$3,$4,$5,'active',$6) RETURNING id`,
        [u.username, passwordHash, u.name, u.email, u.role, warehouseId],
      );
      uid = r!.id;
    }
    await pool.query(
      `INSERT INTO user_companies (user_id, company_id, is_default) VALUES ($1,$2,true)
       ON CONFLICT (user_id, company_id) DO NOTHING`,
      [uid, COMPANY_ID],
    );
    const roleId = await scalar<number>(pool, `SELECT id FROM roles WHERE name=$1`, [u.role]);
    if (roleId) {
      await pool.query(
        `INSERT INTO user_roles (user_id, role_id, is_primary)
         SELECT $1, $2, true
         WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id=$1 AND role_id=$2)`,
        [uid, roleId],
      );
    }
  }
  console.log("  · roles + usuarios demo ok");
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Unidades, categorías, marcas
// ────────────────────────────────────────────────────────────────────────────
type UnitMap = Record<string, number>;
async function seedMeasurementUnits(pool: Pool): Promise<UnitMap> {
  const defs = [
    { name: "Unidad", symbol: "u", type: "count", abbreviation: "u" },
    { name: "Caja", symbol: "cja", type: "count", abbreviation: "cja" },
    { name: "Kilogramo", symbol: "kg", type: "weight", abbreviation: "kg" },
    { name: "Litro", symbol: "L", type: "volume", abbreviation: "L" },
  ];
  const map: UnitMap = {};
  for (const d of defs) {
    let id = await scalar<number>(
      pool,
      `SELECT id FROM measurement_units WHERE store_id=$1 AND symbol=$2`,
      [STORE_ID, d.symbol],
    );
    if (!id) {
      const r = await one<{ id: number }>(
        pool,
        `INSERT INTO measurement_units (store_id, name, symbol, type, abbreviation, is_active)
         VALUES ($1,$2,$3,$4,$5,true) RETURNING id`,
        [STORE_ID, d.name, d.symbol, d.type, d.abbreviation],
      );
      id = r!.id;
    }
    map[d.symbol] = id!;
  }
  return map;
}

type CatMap = Record<string, number>;
async function seedCategories(pool: Pool): Promise<CatMap> {
  const defs = ["Bebidas", "Alimentos", "Limpieza", "Electrónica", "Papelería"];
  const map: CatMap = {};
  for (const name of defs) {
    let id = await scalar<number>(
      pool,
      `SELECT id FROM product_categories WHERE store_id=$1 AND name=$2`,
      [STORE_ID, name],
    );
    if (!id) {
      const r = await one<{ id: number }>(
        pool,
        `INSERT INTO product_categories (store_id, name, description, is_active)
         VALUES ($1,$2,$3,true) RETURNING id`,
        [STORE_ID, name, `Categoría de ${name.toLowerCase()}`],
      );
      id = r!.id;
    }
    map[name] = id!;
  }
  return map;
}

type BrandMap = Record<string, number>;
async function seedBrands(pool: Pool): Promise<BrandMap> {
  const defs = ["Demo Brand", "Nacional", "Importado"];
  const map: BrandMap = {};
  for (const name of defs) {
    let id = await scalar<number>(
      pool,
      `SELECT id FROM product_brands WHERE store_id=$1 AND name=$2`,
      [STORE_ID, name],
    );
    if (!id) {
      const r = await one<{ id: number }>(
        pool,
        `INSERT INTO product_brands (store_id, name, is_active)
         VALUES ($1,$2,true) RETURNING id`,
        [STORE_ID, name],
      );
      id = r!.id;
    }
    map[name] = id!;
  }
  return map;
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Productos
// ────────────────────────────────────────────────────────────────────────────
interface ProductSeed {
  sku: string;
  name: string;
  category: string;
  brand: string;
  price: number;
  cost: number;
  openingStock: number;
  minStock: number;
  unit: string;
}
const PRODUCTS: ProductSeed[] = [
  { sku: "BEB-001", name: "Agua Purificada 500ml", category: "Bebidas", brand: "Nacional", price: 40, cost: 22, openingStock: 200, minStock: 24, unit: "u" },
  { sku: "BEB-002", name: "Refresco Cola 355ml", category: "Bebidas", brand: "Nacional", price: 60, cost: 35, openingStock: 150, minStock: 24, unit: "u" },
  { sku: "ALI-001", name: "Arroz Selecto 5 lb", category: "Alimentos", brand: "Nacional", price: 220, cost: 150, openingStock: 80, minStock: 12, unit: "u" },
  { sku: "ALI-002", name: "Aceite Vegetal 1L", category: "Alimentos", brand: "Importado", price: 250, cost: 175, openingStock: 60, minStock: 10, unit: "L" },
  { sku: "ALI-003", name: "Azúcar Blanca 5 lb", category: "Alimentos", brand: "Nacional", price: 180, cost: 120, openingStock: 90, minStock: 15, unit: "u" },
  { sku: "LIM-001", name: "Detergente Multiuso 1L", category: "Limpieza", brand: "Demo Brand", price: 150, cost: 90, openingStock: 70, minStock: 12, unit: "L" },
  { sku: "LIM-002", name: "Jabón de Manos 500ml", category: "Limpieza", brand: "Importado", price: 120, cost: 70, openingStock: 100, minStock: 20, unit: "u" },
  { sku: "ELE-001", name: "Bombilla LED 9W", category: "Electrónica", brand: "Importado", price: 180, cost: 100, openingStock: 50, minStock: 10, unit: "u" },
  { sku: "ELE-002", name: "Cable USB-C 1m", category: "Electrónica", brand: "Importado", price: 300, cost: 175, openingStock: 40, minStock: 8, unit: "u" },
  { sku: "PAP-001", name: "Resma Papel Bond 8.5x11", category: "Papelería", brand: "Demo Brand", price: 400, cost: 270, openingStock: 30, minStock: 5, unit: "u" },
];

interface ProductRow { id: number; seed: ProductSeed; }
async function seedProducts(
  pool: Pool,
  ctx: { units: UnitMap; categories: CatMap; brands: BrandMap },
): Promise<ProductRow[]> {
  const out: ProductRow[] = [];
  for (const p of PRODUCTS) {
    let id = await scalar<number>(
      pool,
      `SELECT id FROM products WHERE store_id=$1 AND sku=$2`,
      [STORE_ID, p.sku],
    );
    if (!id) {
      const r = await one<{ id: number }>(
        pool,
        `INSERT INTO products
           (store_id, name, description, base_currency, price, sale_price, category, type,
            status, sku, brand, availability, stock_quantity, min_quantity, base_unit_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'product','active',$8,$9,'in_stock',$10,$11,$12)
         RETURNING id`,
        [
          STORE_ID, p.name, `Producto demo ${p.name}`, CURRENCY, p.price.toString(),
          p.price.toString(), p.category, p.sku, p.brand, p.openingStock, p.minStock,
          ctx.units[p.unit] ?? ctx.units["u"],
        ],
      );
      id = r!.id;
    }
    out.push({ id: id!, seed: p });
  }
  console.log(`  · productos: ${out.length}`);
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Warehouse stock inicial
// ────────────────────────────────────────────────────────────────────────────
async function seedWarehouseStock(
  pool: Pool,
  warehouseId: number,
  products: ProductRow[],
): Promise<void> {
  for (const p of products) {
    const existing = await one(
      pool,
      `SELECT id FROM warehouse_stock WHERE warehouse_id=$1 AND product_id=$2 AND store_id=$3`,
      [warehouseId, p.id, STORE_ID],
    );
    if (!existing) {
      await pool.query(
        `INSERT INTO warehouse_stock (warehouse_id, product_id, store_id, quantity, min_stock)
         VALUES ($1,$2,$3,$4,$5)`,
        [warehouseId, p.id, STORE_ID, p.seed.openingStock, p.seed.minStock],
      );
    }
  }
}

async function seedInventoryOpeningMovements(
  pool: Pool,
  warehouseId: number,
  products: ProductRow[],
): Promise<void> {
  for (const p of products) {
    const already = await scalar<number>(
      pool,
      `SELECT id FROM inventory_movements
       WHERE store_id=$1 AND product_id=$2 AND type='opening'`,
      [STORE_ID, p.id],
    );
    if (already) continue;
    await pool.query(
      `INSERT INTO inventory_movements
         (store_id, product_id, type, quantity, quantity_before, quantity_after,
          unit_cost, total_cost, reference_type, warehouse_id, notes, reason, created_by)
       VALUES ($1,$2,'opening',$3,0,$3,$4,$5,'opening_balance',$6,'Inventario inicial demo','Carga inicial',1)`,
      [
        STORE_ID, p.id, p.seed.openingStock, p.seed.cost.toString(),
        (p.seed.cost * p.seed.openingStock).toString(), warehouseId,
      ],
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 6. Tipos de cliente + clientes
// ────────────────────────────────────────────────────────────────────────────
type TypeMap = Record<string, number>;
async function seedCustomerTypes(pool: Pool): Promise<TypeMap> {
  const defs = [
    { name: "Minorista", discount: 0 },
    { name: "Mayorista", discount: 10 },
    { name: "VIP", discount: 15 },
  ];
  const map: TypeMap = {};
  for (const d of defs) {
    let id = await scalar<number>(
      pool,
      `SELECT id FROM customer_types WHERE store_id=$1 AND name=$2`,
      [STORE_ID, d.name],
    );
    if (!id) {
      const r = await one<{ id: number }>(
        pool,
        `INSERT INTO customer_types (store_id, name, description, discount_percentage, is_active)
         VALUES ($1,$2,$3,$4,true) RETURNING id`,
        [STORE_ID, d.name, `Cliente ${d.name}`, d.discount.toString()],
      );
      id = r!.id;
    }
    map[d.name] = id!;
  }
  return map;
}

interface CustomerRow { id: number; name: string; type: string; }
const CUSTOMERS: Array<{ name: string; phone: string; email: string; type: string; vip?: boolean }> = [
  { name: "Rosa Almanzar", phone: "+18091110001", email: "rosa.almanzar@correo.do", type: "Minorista" },
  { name: "Carlos Peña", phone: "+18091110002", email: "carlos.pena@correo.do", type: "Minorista" },
  { name: "Distribuidora Los Pinos SRL", phone: "+18091110003", email: "compras@lospinos.do", type: "Mayorista" },
  { name: "Colmado Doña Fela", phone: "+18091110004", email: "colmado.fela@correo.do", type: "Mayorista" },
  { name: "Farmacia San Rafael", phone: "+18091110005", email: "ventas@sanrafael.do", type: "VIP", vip: true },
  { name: "Cliente Contado", phone: "+18091110006", email: "contado@demo.do", type: "Minorista" },
];

async function seedCustomers(pool: Pool, types: TypeMap): Promise<CustomerRow[]> {
  const out: CustomerRow[] = [];
  for (const c of CUSTOMERS) {
    let id = await scalar<number>(
      pool,
      `SELECT id FROM customers WHERE store_id=$1 AND phone=$2`,
      [STORE_ID, c.phone],
    );
    if (!id) {
      const r = await one<{ id: number }>(
        pool,
        `INSERT INTO customers (name, phone, store_id, email, customer_type_id, is_vip, is_active, address)
         VALUES ($1,$2,$3,$4,$5,$6,true,$7) RETURNING id`,
        [c.name, c.phone, STORE_ID, c.email, types[c.type], !!c.vip, `Dirección de ${c.name}`],
      );
      id = r!.id;
    }
    out.push({ id: id!, name: c.name, type: c.type });
  }
  console.log(`  · clientes: ${out.length}`);
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// 7. Proveedores
// ────────────────────────────────────────────────────────────────────────────
interface SupplierRow { id: number; name: string; taxId: string; }
const SUPPLIERS: Array<{ name: string; contact: string; phone: string; email: string; taxId: string }> = [
  { name: "Suplidora Nacional SRL", contact: "Miguel Ramírez", phone: "+18092220001", email: "ventas@suplidoranacional.do", taxId: "131000011" },
  { name: "Importadora Caribe S.A.", contact: "Elena Guzmán", phone: "+18092220002", email: "info@impcaribe.do", taxId: "131000012" },
  { name: "Distribuidora Global", contact: "Rafael Mota", phone: "+18092220003", email: "rafael@dglobal.do", taxId: "131000013" },
];

async function seedSuppliers(pool: Pool): Promise<SupplierRow[]> {
  const out: SupplierRow[] = [];
  for (const s of SUPPLIERS) {
    let id = await scalar<number>(
      pool,
      `SELECT id FROM suppliers WHERE store_id=$1 AND tax_id=$2`,
      [STORE_ID, s.taxId],
    );
    if (!id) {
      const r = await one<{ id: number }>(
        pool,
        `INSERT INTO suppliers (store_id, name, contact_name, phone, email, address, tax_id, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true) RETURNING id`,
        [STORE_ID, s.name, s.contact, s.phone, s.email, `Oficina de ${s.name}`, s.taxId],
      );
      id = r!.id;
    }
    out.push({ id: id!, name: s.name, taxId: s.taxId });
  }
  console.log(`  · proveedores: ${out.length}`);
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// 8. Órdenes de compra
// ────────────────────────────────────────────────────────────────────────────
async function seedPurchaseOrders(
  pool: Pool,
  warehouseId: number,
  products: ProductRow[],
  suppliers: SupplierRow[],
): Promise<void> {
  const specs = [
    { number: "PO-DEMO-0001", supplier: 0, items: [0, 1, 2] as number[], status: "received" },
    { number: "PO-DEMO-0002", supplier: 1, items: [3, 4, 5] as number[], status: "received" },
    { number: "PO-DEMO-0003", supplier: 2, items: [7, 8] as number[], status: "pending" },
  ];

  for (const s of specs) {
    const exists = await scalar<number>(
      pool,
      `SELECT id FROM purchase_orders WHERE store_id=$1 AND purchase_number=$2`,
      [STORE_ID, s.number],
    );
    if (exists) continue;
    const sup = suppliers[s.supplier];
    let subtotal = 0;
    const lines = s.items.map((idx) => {
      const p = products[idx];
      const qty = 20 + idx * 5;
      const line = qty * p.seed.cost;
      subtotal += line;
      return { p, qty, cost: p.seed.cost, total: line };
    });
    const tax = subtotal * 0.18;
    const total = subtotal + tax;
    const po = await one<{ id: number }>(
      pool,
      `INSERT INTO purchase_orders
         (store_id, purchase_number, supplier_id, supplier_name, status, subtotal, tax, total_amount,
          currency, payment_status, notes, created_by, warehouse_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'DOP',$9,$10,1,$11)
       RETURNING id`,
      [
        STORE_ID, s.number, sup.id, sup.name, s.status,
        subtotal.toFixed(2), tax.toFixed(2), total.toFixed(2),
        s.status === "received" ? "paid" : "unpaid",
        `Orden demo a ${sup.name}`, warehouseId,
      ],
    );
    for (const l of lines) {
      await pool.query(
        `INSERT INTO purchase_order_items
           (purchase_order_id, store_id, product_id, product_name, sku, quantity,
            quantity_received, unit_cost, tax_rate, total_cost, warehouse_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,18,$9,$10)`,
        [
          po!.id, STORE_ID, l.p.id, l.p.seed.name, l.p.seed.sku,
          l.qty, s.status === "received" ? l.qty : 0,
          l.cost.toString(), l.total.toString(), warehouseId,
        ],
      );
      if (s.status === "received") {
        await pool.query(
          `INSERT INTO inventory_movements
             (store_id, product_id, type, quantity, unit_cost, total_cost,
              reference_type, reference_id, supplier_id, warehouse_id, notes, created_by)
           VALUES ($1,$2,'in',$3,$4,$5,'purchase_order',$6,$7,$8,'Recepción PO ${s.number}',1)`,
          [
            STORE_ID, l.p.id, l.qty, l.cost.toString(), l.total.toString(),
            po!.id, sup.id, warehouseId,
          ],
        );
        await pool.query(
          `UPDATE warehouse_stock SET quantity = quantity + $1, updated_at = now()
           WHERE warehouse_id=$2 AND product_id=$3 AND store_id=$4`,
          [l.qty, warehouseId, l.p.id, STORE_ID],
        );
      }
    }
  }
  console.log("  · purchase orders demo ok");
}

// ────────────────────────────────────────────────────────────────────────────
// 9. Órdenes de venta
// ────────────────────────────────────────────────────────────────────────────
async function seedSalesOrders(
  pool: Pool,
  warehouseId: number,
  products: ProductRow[],
  customers: CustomerRow[],
): Promise<void> {
  const specs = [
    { number: "SO-DEMO-0001", cust: 0, items: [0, 1], status: "completed", paid: true, pm: "cash" },
    { number: "SO-DEMO-0002", cust: 1, items: [2, 3], status: "completed", paid: true, pm: "card" },
    { number: "SO-DEMO-0003", cust: 2, items: [4, 5, 6], status: "completed", paid: true, pm: "transfer" },
    { number: "SO-DEMO-0004", cust: 3, items: [1, 2], status: "processing", paid: false, pm: "credit" },
    { number: "SO-DEMO-0005", cust: 4, items: [7, 8, 9], status: "pending", paid: false, pm: "credit" },
    { number: "SO-DEMO-0006", cust: 5, items: [0, 5], status: "pending", paid: false, pm: "cash" },
  ];

  for (const s of specs) {
    const exists = await scalar<number>(
      pool,
      `SELECT id FROM orders WHERE store_id=$1 AND order_number=$2`,
      [STORE_ID, s.number],
    );
    if (exists) continue;
    const cust = customers[s.cust];
    let subtotal = 0;
    const lines = s.items.map((idx) => {
      const p = products[idx];
      const qty = 1 + (idx % 3);
      const line = qty * p.seed.price;
      subtotal += line;
      return { p, qty, price: p.seed.price, total: line };
    });
    const orderNo = s.number;
    const paymentStatus = s.paid ? "paid" : (s.pm === "credit" ? "credit" : "pending");
    const order = await one<{ id: number }>(
      pool,
      `INSERT INTO orders
         (order_number, customer_id, store_id, warehouse_id, status, priority, service_type,
          description, total_amount, payment_method, payment_status, order_type,
          subtotal_amount, received_amount, change_amount, assigned_user_id, completed_date)
       VALUES ($1,$2,$3,$4,$5,'normal','sale',$6,$7,$8,$9,'sale',$10,$11,0,1,$12)
       RETURNING id`,
      [
        orderNo, cust.id, STORE_ID, warehouseId, s.status,
        `Venta demo a ${cust.name}`, subtotal.toFixed(2), s.pm, paymentStatus,
        subtotal.toFixed(2),
        s.paid ? subtotal.toFixed(2) : "0",
        s.status === "completed" ? new Date().toISOString() : null,
      ],
    );
    for (const l of lines) {
      await pool.query(
        `INSERT INTO order_items
           (order_id, product_id, quantity, unit_price, total_price, store_id, warehouse_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [order!.id, l.p.id, l.qty, l.price.toString(), l.total.toFixed(2), STORE_ID, warehouseId],
      );
      if (s.status === "completed") {
        await pool.query(
          `INSERT INTO inventory_movements
             (store_id, product_id, type, quantity, unit_cost, total_cost,
              reference_type, reference_id, warehouse_id, notes, created_by)
           VALUES ($1,$2,'out',$3,$4,$5,'sales_order',$6,$7,'Venta ${orderNo}',1)`,
          [
            STORE_ID, l.p.id, l.qty, l.p.seed.cost.toString(),
            (l.p.seed.cost * l.qty).toString(), order!.id, warehouseId,
          ],
        );
        await pool.query(
          `UPDATE warehouse_stock SET quantity = quantity - $1, updated_at = now()
           WHERE warehouse_id=$2 AND product_id=$3 AND store_id=$4`,
          [l.qty, warehouseId, l.p.id, STORE_ID],
        );
      }
    }
    // Actualizar totales del cliente
    if (s.status === "completed") {
      await pool.query(
        `UPDATE customers SET total_orders = total_orders + 1,
           total_spent = total_spent + $1, last_contact = now() WHERE id=$2`,
        [subtotal.toFixed(2), cust.id],
      );
    }
  }
  console.log("  · sales orders demo ok");
}

// ────────────────────────────────────────────────────────────────────────────
// 10. Cuentas de crédito
// ────────────────────────────────────────────────────────────────────────────
async function seedCustomerCreditAccounts(pool: Pool, customers: CustomerRow[]): Promise<void> {
  const creditCustomers = customers.filter((c) => c.type === "Mayorista" || c.type === "VIP");
  for (const c of creditCustomers) {
    let acct = await one<{ id: number; current_balance: string }>(
      pool,
      `SELECT id, current_balance FROM customer_credit_accounts WHERE customer_id=$1 AND store_id=$2`,
      [c.id, STORE_ID],
    );
    if (!acct) {
      const r = await one<{ id: number }>(
        pool,
        `INSERT INTO customer_credit_accounts (customer_id, store_id, total_credit, total_paid, current_balance, credit_limit)
         VALUES ($1,$2,0,0,0,$3) RETURNING id`,
        [c.id, STORE_ID, "50000"],
      );
      acct = { id: r!.id, current_balance: "0" };
    }
    const already = await scalar<number>(
      pool,
      `SELECT id FROM credit_transactions WHERE customer_id=$1 AND description='Cargo demo inicial'`,
      [c.id],
    );
    if (already) continue;
    const amount = 5000;
    const before = Number(acct.current_balance);
    const after = before + amount;
    await pool.query(
      `INSERT INTO credit_transactions
         (customer_id, store_id, type, amount, balance_before, balance_after, description, created_by)
       VALUES ($1,$2,'charge',$3,$4,$5,'Cargo demo inicial',1)`,
      [c.id, STORE_ID, amount, before, after],
    );
    await pool.query(
      `UPDATE customer_credit_accounts
         SET total_credit = total_credit + $1, current_balance = $2, updated_at=now()
       WHERE id=$3`,
      [amount, after, acct.id],
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 11. Lealtad
// ────────────────────────────────────────────────────────────────────────────
async function seedLoyalty(pool: Pool, customers: CustomerRow[]): Promise<void> {
  for (const c of customers.slice(0, 3)) {
    let bal = await one<{ id: number; current_balance: string }>(
      pool,
      `SELECT id, current_balance FROM customer_loyalty_balance WHERE customer_id=$1 AND store_id=$2`,
      [c.id, STORE_ID],
    );
    if (!bal) {
      const r = await one<{ id: number }>(
        pool,
        `INSERT INTO customer_loyalty_balance
           (customer_id, store_id, total_points_earned, total_points_redeemed, current_balance, loyalty_program_name)
         VALUES ($1,$2,0,0,0,'Puntos Demo') RETURNING id`,
        [c.id, STORE_ID],
      );
      bal = { id: r!.id, current_balance: "0" };
    }
    const already = await scalar<number>(
      pool,
      `SELECT id FROM loyalty_points_transactions WHERE customer_id=$1 AND description='Bono de bienvenida demo'`,
      [c.id],
    );
    if (already) continue;
    const points = 100;
    const before = Number(bal.current_balance);
    const after = before + points;
    await pool.query(
      `INSERT INTO loyalty_points_transactions
         (customer_id, store_id, type, points, balance_before, balance_after, description)
       VALUES ($1,$2,'earn',$3,$4,$5,'Bono de bienvenida demo')`,
      [c.id, STORE_ID, points, before, after],
    );
    await pool.query(
      `UPDATE customer_loyalty_balance
         SET total_points_earned = total_points_earned + $1,
             current_balance = $2, last_earned_at = now(), updated_at=now()
       WHERE id=$3`,
      [points, after, bal.id],
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 12. NCF sequences
// ────────────────────────────────────────────────────────────────────────────
async function seedNcfSequences(pool: Pool): Promise<void> {
  const defs = [
    { type: "B01", isEcf: false, from: 1, to: 1000, next: 1 },
    { type: "B02", isEcf: false, from: 1, to: 5000, next: 1 },
    { type: "E31", isEcf: true, from: 1, to: 500, next: 1 },
  ];
  for (const d of defs) {
    const exists = await scalar<number>(
      pool,
      `SELECT id FROM ncf_sequences WHERE company_id=$1 AND ncf_type=$2 AND is_ecf=$3`,
      [COMPANY_ID, d.type, d.isEcf],
    );
    if (exists) continue;
    await pool.query(
      `INSERT INTO ncf_sequences
         (company_id, ncf_type, is_ecf, range_from, range_to, next_number, alert_threshold, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,50,true)`,
      [COMPANY_ID, d.type, d.isEcf, d.from, d.to, d.next],
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 13. Fiscal documents (facturas)
// ────────────────────────────────────────────────────────────────────────────
async function seedFiscalDocuments(
  pool: Pool,
  customers: CustomerRow[],
  suppliers: SupplierRow[],
): Promise<void> {
  const issuerRnc = (await scalar<string>(pool, `SELECT rnc FROM companies WHERE id=$1`, [COMPANY_ID]))!;

  // Factura de venta (B02 consumo)
  const saleExists = await scalar<number>(
    pool,
    `SELECT id FROM fiscal_documents WHERE company_id=$1 AND ncf='B0200000001'`,
    [COMPANY_ID],
  );
  if (!saleExists) {
    const c = customers[2]; // mayorista
    const subtotal = 5000;
    const itbis = subtotal * 0.18;
    const total = subtotal + itbis;
    const doc = await one<{ id: number }>(
      pool,
      `INSERT INTO fiscal_documents
         (company_id, doc_type, ncf, ncf_type, is_ecf, issuer_rnc, buyer_rnc, buyer_name,
          customer_id, currency, subtotal_taxed, itbis_18, total, status, emitted_at, due_date)
       VALUES ($1,'invoice','B0200000001','B02',false,$2,NULL,$3,$4,'DOP',$5,$6,$7,'issued',now(),now()::date + interval '30 days')
       RETURNING id`,
      [COMPANY_ID, issuerRnc, c.name, c.id, subtotal.toFixed(2), itbis.toFixed(2), total.toFixed(2)],
    );
    await pool.query(
      `INSERT INTO fiscal_document_lines
         (document_id, company_id, line_no, description, quantity, unit_price, tax_code, itbis_rate, itbis_amount, line_total)
       VALUES ($1,$2,1,'Venta demo mayorista',1,$3,'ITBIS18',18,$4,$5)`,
      [doc!.id, COMPANY_ID, subtotal.toFixed(2), itbis.toFixed(2), total.toFixed(2)],
    );
    await pool.query(
      `UPDATE ncf_sequences SET next_number = next_number + 1
       WHERE company_id=$1 AND ncf_type='B02'`,
      [COMPANY_ID],
    );
  }

  // Factura de compra (registro NCF B01 recibido)
  const purchExists = await scalar<number>(
    pool,
    `SELECT id FROM fiscal_documents WHERE company_id=$1 AND ncf='B0100000001' AND doc_type='purchase'`,
    [COMPANY_ID],
  );
  if (!purchExists) {
    const s = suppliers[0];
    const subtotal = 8000;
    const itbis = subtotal * 0.18;
    const total = subtotal + itbis;
    const doc = await one<{ id: number }>(
      pool,
      `INSERT INTO fiscal_documents
         (company_id, doc_type, ncf, ncf_type, is_ecf, issuer_rnc, buyer_rnc, buyer_name,
          supplier_id, currency, subtotal_taxed, itbis_18, total, status, emitted_at, due_date)
       VALUES ($1,'purchase','B0100000001','B01',false,$2,$3,$4,$5,'DOP',$6,$7,$8,'issued',now(),now()::date + interval '30 days')
       RETURNING id`,
      [COMPANY_ID, s.taxId, issuerRnc, s.name, s.id, subtotal.toFixed(2), itbis.toFixed(2), total.toFixed(2)],
    );
    await pool.query(
      `INSERT INTO fiscal_document_lines
         (document_id, company_id, line_no, description, quantity, unit_price, tax_code, itbis_rate, itbis_amount, line_total)
       VALUES ($1,$2,1,'Compra demo mayorista',1,$3,'ITBIS18',18,$4,$5)`,
      [doc!.id, COMPANY_ID, subtotal.toFixed(2), itbis.toFixed(2), total.toFixed(2)],
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 14. AR / AP open items
// ────────────────────────────────────────────────────────────────────────────
async function seedArApOpenItems(
  pool: Pool,
  customers: CustomerRow[],
  suppliers: SupplierRow[],
): Promise<void> {
  const arDoc = await one<{ id: number; total: string }>(
    pool,
    `SELECT id, total::text as total FROM fiscal_documents
     WHERE company_id=$1 AND ncf='B0200000001'`,
    [COMPANY_ID],
  );
  if (arDoc) {
    const exists = await scalar<number>(
      pool,
      `SELECT id FROM ar_open_items WHERE document_id=$1`,
      [arDoc.id],
    );
    if (!exists) {
      await pool.query(
        `INSERT INTO ar_open_items
           (company_id, customer_id, document_id, issue_date, due_date, currency, original_amount, balance, status)
         VALUES ($1,$2,$3,now()::date, now()::date + interval '30 days','DOP',$4,$4,'open')`,
        [COMPANY_ID, customers[2].id, arDoc.id, arDoc.total],
      );
    }
  }
  const apDoc = await one<{ id: number; total: string }>(
    pool,
    `SELECT id, total::text as total FROM fiscal_documents
     WHERE company_id=$1 AND ncf='B0100000001' AND doc_type='purchase'`,
    [COMPANY_ID],
  );
  if (apDoc) {
    const exists = await scalar<number>(
      pool,
      `SELECT id FROM ap_open_items WHERE document_id=$1`,
      [apDoc.id],
    );
    if (!exists) {
      await pool.query(
        `INSERT INTO ap_open_items
           (company_id, supplier_id, document_id, issue_date, due_date, currency, original_amount, balance, status)
         VALUES ($1,$2,$3,now()::date, now()::date + interval '30 days','DOP',$4,$4,'open')`,
        [COMPANY_ID, suppliers[0].id, apDoc.id, apDoc.total],
      );
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 15. Bank transactions
// ────────────────────────────────────────────────────────────────────────────
async function seedBankTransactions(pool: Pool): Promise<void> {
  const bank = await one<{ id: number }>(
    pool,
    `SELECT id FROM bank_accounts WHERE company_id=$1 ORDER BY id LIMIT 1`,
    [COMPANY_ID],
  );
  if (!bank) return;
  const txns = [
    { direction: "in", amount: "50000", kind: "deposit", memo: "Depósito inicial demo" },
    { direction: "in", amount: "12500", kind: "receipt", memo: "Cobro cliente mayorista" },
    { direction: "out", amount: "9440", kind: "payment", memo: "Pago proveedor" },
  ];
  for (const t of txns) {
    const exists = await scalar<number>(
      pool,
      `SELECT id FROM bank_transactions
       WHERE company_id=$1 AND bank_account_id=$2 AND memo=$3`,
      [COMPANY_ID, bank.id, t.memo],
    );
    if (exists) continue;
    await pool.query(
      `INSERT INTO bank_transactions
         (company_id, bank_account_id, txn_date, direction, amount, kind, memo, status)
       VALUES ($1,$2,now()::date,$3,$4,$5,$6,'posted')`,
      [COMPANY_ID, bank.id, t.direction, t.amount, t.kind, t.memo],
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 16. Journal entries (manuales, en borrador)
// ────────────────────────────────────────────────────────────────────────────
async function seedJournalEntries(pool: Pool): Promise<void> {
  const period = await one<{ id: number }>(
    pool,
    `SELECT id FROM accounting_periods WHERE company_id=$1 AND status='open' ORDER BY start_date DESC LIMIT 1`,
    [COMPANY_ID],
  );
  if (!period) return;

  const acc = async (code: string) =>
    scalar<number>(
      pool,
      `SELECT id FROM chart_of_accounts WHERE company_id=$1 AND code=$2`,
      [COMPANY_ID, code],
    );
  const bancos = await acc("1.1.01.003");
  const clientes = await acc("1.1.02.001");
  const ventas = await acc("4.1.01.001");
  const gastos = await acc("6.1.01.001").catch(() => null);
  const caja = await acc("1.1.01.001");
  if (!bancos || !clientes || !ventas || !caja) return;

  const entries = [
    {
      memo: "Asiento demo — cobro contado",
      lines: [
        { account: caja, debit: "1000", credit: "0" },
        { account: ventas, debit: "0", credit: "1000" },
      ],
    },
    {
      memo: "Asiento demo — venta a crédito",
      lines: [
        { account: clientes, debit: "2000", credit: "0" },
        { account: ventas, debit: "0", credit: "2000" },
      ],
    },
  ];

  for (const e of entries) {
    const exists = await scalar<number>(
      pool,
      `SELECT id FROM journal_entries WHERE company_id=$1 AND memo=$2`,
      [COMPANY_ID, e.memo],
    );
    if (exists) continue;
    const je = await one<{ id: number }>(
      pool,
      `INSERT INTO journal_entries
         (company_id, period_id, entry_date, memo, currency, status, source_type, source_id)
       VALUES ($1,$2,now()::date,$3,'DOP','draft','manual','demo-seed')
       RETURNING id`,
      [COMPANY_ID, period.id, e.memo],
    );
    let line = 1;
    for (const l of e.lines) {
      await pool.query(
        `INSERT INTO journal_entry_lines
           (entry_id, company_id, line_no, account_id, debit, credit, currency,
            debit_func, credit_func, memo)
         VALUES ($1,$2,$3,$4,$5,$6,'DOP',$5,$6,$7)`,
        [je!.id, COMPANY_ID, line++, l.account, l.debit, l.credit, e.memo],
      );
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 17. RRHH — empleados
// ────────────────────────────────────────────────────────────────────────────
const HR_EMPLOYEES: Array<{ code: string; first: string; last: string; cedula: string; position: string; department: string; salary: number }> = [
  { code: "EMP-0001", first: "Ana", last: "Contadora", cedula: "00110000001", position: "Contadora Sr.", department: "Contabilidad", salary: 45000 },
  { code: "EMP-0002", first: "Pedro", last: "Cajero", cedula: "00110000002", position: "Cajero", department: "Ventas", salary: 22000 },
  { code: "EMP-0003", first: "María", last: "Vendedora", cedula: "00110000003", position: "Vendedora", department: "Ventas", salary: 28000 },
];

async function seedHr(pool: Pool): Promise<void> {
  for (const e of HR_EMPLOYEES) {
    const exists = await scalar<number>(
      pool,
      `SELECT id FROM hr_employees WHERE store_id=$1 AND employee_code=$2`,
      [STORE_ID, e.code],
    );
    if (exists) continue;
    await pool.query(
      `INSERT INTO hr_employees
         (store_id, employee_code, first_name, last_name, cedula, nationality,
          hire_date, employment_status, department, position_title, monthly_salary, payment_frequency)
       VALUES ($1,$2,$3,$4,$5,'DO',now()::date - interval '1 year','active',$6,$7,$8,'monthly')`,
      [STORE_ID, e.code, e.first, e.last, e.cedula, e.department, e.position, e.salary],
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 18. Payroll — empleados y run mensual
// ────────────────────────────────────────────────────────────────────────────
async function seedPayroll(pool: Pool): Promise<void> {
  const payrollIds: number[] = [];
  for (const e of HR_EMPLOYEES) {
    let id = await scalar<number>(
      pool,
      `SELECT id FROM payroll_employees WHERE company_id=$1 AND code=$2`,
      [COMPANY_ID, e.code],
    );
    if (!id) {
      const r = await one<{ id: number }>(
        pool,
        `INSERT INTO payroll_employees (company_id, code, name, cedula, position, base_salary, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id`,
        [COMPANY_ID, e.code, `${e.first} ${e.last}`, e.cedula, e.position, e.salary],
      );
      id = r!.id;
    }
    payrollIds.push(id!);
  }

  const now = new Date();
  const fy = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  let run = await one<{ id: number }>(
    pool,
    `SELECT id FROM payroll_runs WHERE company_id=$1 AND fiscal_year=$2 AND month=$3`,
    [COMPANY_ID, fy, month],
  );
  if (!run) {
    let gross = 0;
    let net = 0;
    for (const e of HR_EMPLOYEES) {
      gross += e.salary;
      net += e.salary * 0.9105; // aprox neto tras AFP+SFS+ISR minimo
    }
    run = await one<{ id: number }>(
      pool,
      `INSERT INTO payroll_runs
         (company_id, fiscal_year, month, status, gross_total, net_total)
       VALUES ($1,$2,$3,'draft',$4,$5) RETURNING id`,
      [COMPANY_ID, fy, month, gross.toFixed(2), net.toFixed(2)],
    );
    for (let i = 0; i < HR_EMPLOYEES.length; i++) {
      const e = HR_EMPLOYEES[i];
      const gross_i = e.salary;
      const afp_e = gross_i * 0.0287;
      const sfs_e = gross_i * 0.0304;
      const isr = 0;
      const other = 0;
      const afp_er = gross_i * 0.0710;
      const sfs_er = gross_i * 0.0709;
      const infotep = gross_i * 0.01;
      const net_i = gross_i - afp_e - sfs_e - isr - other;
      await pool.query(
        `INSERT INTO payslips
           (company_id, run_id, employee_id, gross_salary, afp_employee, sfs_employee, isr,
            other_deductions, afp_employer, sfs_employer, infotep, net_pay)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          COMPANY_ID, run!.id, payrollIds[i],
          gross_i.toFixed(2), afp_e.toFixed(2), sfs_e.toFixed(2), isr.toFixed(2),
          other.toFixed(2), afp_er.toFixed(2), sfs_er.toFixed(2), infotep.toFixed(2),
          net_i.toFixed(2),
        ],
      );
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 19. Manufactura — BOM + orden de producción
// ────────────────────────────────────────────────────────────────────────────
async function seedManufacturing(
  pool: Pool,
  warehouseId: number,
  products: ProductRow[],
): Promise<void> {
  const output = products.find((p) => p.seed.sku === "ALI-003"); // producto final demo
  const comp1 = products.find((p) => p.seed.sku === "ALI-001");
  const comp2 = products.find((p) => p.seed.sku === "ALI-002");
  if (!output || !comp1 || !comp2) return;

  let bomId = await scalar<number>(
    pool,
    `SELECT id FROM bom_headers WHERE store_id=$1 AND bom_code='BOM-DEMO-001'`,
    [STORE_ID],
  );
  if (!bomId) {
    const r = await one<{ id: number }>(
      pool,
      `INSERT INTO bom_headers
         (store_id, bom_code, output_product_id, output_quantity, output_warehouse_id,
          name, description, estimated_unit_cost, status, created_by)
       VALUES ($1,'BOM-DEMO-001',$2,1,$3,'Empaque Azúcar Demo','BOM demo del sistema',$4,'active',1)
       RETURNING id`,
      [STORE_ID, output.id, warehouseId, "150"],
    );
    bomId = r!.id;
    await pool.query(
      `INSERT INTO bom_lines (bom_id, component_product_id, quantity_per, unit, unit_cost, line_order)
       VALUES ($1,$2,1,'unit',$3,1), ($1,$4,0.5,'L',$5,2)`,
      [bomId, comp1.id, comp1.seed.cost.toString(), comp2.id, comp2.seed.cost.toString()],
    );
  }

  const poExists = await scalar<number>(
    pool,
    `SELECT id FROM production_orders WHERE store_id=$1 AND mo_number='MO-DEMO-0001'`,
    [STORE_ID],
  );
  if (!poExists) {
    await pool.query(
      `INSERT INTO production_orders
         (store_id, mo_number, bom_id, output_product_id, planned_quantity,
          output_warehouse_id, status, notes, created_by)
       VALUES ($1,'MO-DEMO-0001',$2,$3,10,$4,'draft','Orden de producción demo',1)`,
      [STORE_ID, bomId, output.id, warehouseId],
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 20. Sesión de caja abierta
// ────────────────────────────────────────────────────────────────────────────
async function seedCashSession(pool: Pool, warehouseId: number): Promise<void> {
  const cashierId = await scalar<number>(pool, `SELECT id FROM users WHERE username='cajero1'`);
  if (!cashierId) return;
  const exists = await scalar<number>(
    pool,
    `SELECT id FROM cash_register_sessions
     WHERE store_id=$1 AND cashier_id=$2 AND status='open'`,
    [STORE_ID, cashierId],
  );
  if (exists) return;
  await pool.query(
    `INSERT INTO cash_register_sessions
       (store_id, warehouse_id, cashier_id, session_type, status, opening_amount, opening_notes)
     VALUES ($1,$2,$3,'shift','open','1000','Apertura demo')`,
    [STORE_ID, warehouseId, cashierId],
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 21. Reglas de alertas
// ────────────────────────────────────────────────────────────────────────────
async function seedAlertRules(pool: Pool): Promise<void> {
  const rules = [
    {
      name: "Stock bajo",
      rule_type: "low_stock",
      parameters: { threshold_percent: 25 },
      severity: "warning",
    },
    {
      name: "Cuentas por cobrar vencidas",
      rule_type: "ar_overdue",
      parameters: { days: 30 },
      severity: "warning",
    },
  ];
  for (const r of rules) {
    const exists = await scalar<number>(
      pool,
      `SELECT id FROM alert_rules WHERE store_id=$1 AND name=$2`,
      [STORE_ID, r.name],
    );
    if (exists) continue;
    await pool.query(
      `INSERT INTO alert_rules
         (store_id, company_id, name, rule_type, parameters, severity, channels, is_active, created_by)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6, ARRAY['in_app']::text[], true, 1)`,
      [STORE_ID, COMPANY_ID, r.name, r.rule_type, JSON.stringify(r.parameters), r.severity],
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Print counts
// ────────────────────────────────────────────────────────────────────────────
async function printCounts(pool: Pool): Promise<void> {
  const tables = [
    "warehouses", "users", "user_roles", "roles",
    "measurement_units", "product_categories", "product_brands", "products",
    "customer_types", "customers", "suppliers",
    "warehouse_stock", "inventory_movements",
    "purchase_orders", "purchase_order_items",
    "orders", "order_items",
    "customer_credit_accounts", "credit_transactions",
    "customer_loyalty_balance", "loyalty_points_transactions",
    "ncf_sequences", "fiscal_documents", "fiscal_document_lines",
    "ar_open_items", "ap_open_items",
    "bank_transactions", "journal_entries", "journal_entry_lines",
    "hr_employees", "payroll_employees", "payroll_runs", "payslips",
    "bom_headers", "bom_lines", "production_orders",
    "cash_register_sessions", "alert_rules",
  ];
  console.log("\n── conteos ──");
  for (const t of tables) {
    try {
      const n = await scalar<number>(pool, `SELECT count(*)::int FROM ${t}`);
      console.log(`  ${t.padEnd(30)} ${n ?? 0}`);
    } catch (e) {
      console.log(`  ${t.padEnd(30)} (no existe)`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
