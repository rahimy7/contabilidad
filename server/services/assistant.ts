import type { Pool } from "@neondatabase/serverless";

/**
 * Asistente interactivo del ERP.
 *
 * Provee tres cosas:
 *   1. Onboarding checklist — computa qué pasos de configuración inicial ya
 *      están hechos consultando estado real de la base de datos
 *   2. Tips contextuales — sugerencias según la ruta actual del usuario
 *   3. FAQ / Q&A — banco curado de preguntas frecuentes con matching por
 *      keywords (extensible a IA en el futuro)
 *
 * Ninguna consulta hace inserts; todo es solo lectura y agrupación.
 */

export interface OnboardingTask {
  key: string;
  title: string;
  description: string;
  href: string;
  done: boolean;
  category: "setup" | "commercial" | "operational" | "compliance";
}

export async function getOnboardingStatus(
  pool: Pool,
  storeId: number,
  companyId?: number,
): Promise<{ tasks: OnboardingTask[]; completedCount: number; totalCount: number; progressPct: number }> {
  const tasks: OnboardingTask[] = [];

  const [
    hasStoreConfig, hasWarehouses, hasCategories, hasProducts,
    hasCustomers, hasSuppliers, hasOrders, hasBankAccount,
    hasEmployees, hasBom, hasAlertRule, hasApiKey,
  ] = await Promise.all([
    countHas(pool, `SELECT count(*)::int AS n FROM store_settings WHERE store_id = $1`, [storeId]),
    countHas(pool, `SELECT count(*)::int AS n FROM warehouses WHERE store_id = $1`, [storeId]),
    countHas(pool, `SELECT count(*)::int AS n FROM categories WHERE store_id = $1`, [storeId]),
    countHas(pool, `SELECT count(*)::int AS n FROM products WHERE store_id = $1`, [storeId]),
    countHas(pool, `SELECT count(*)::int AS n FROM customers WHERE store_id = $1`, [storeId]),
    countHas(pool, `SELECT count(*)::int AS n FROM suppliers WHERE store_id = $1`, [storeId]),
    countHas(pool, `SELECT count(*)::int AS n FROM orders WHERE store_id = $1`, [storeId]),
    companyId ? countHas(pool, `SELECT count(*)::int AS n FROM bank_accounts WHERE company_id = $1`, [companyId]) : Promise.resolve(false),
    countHas(pool, `SELECT count(*)::int AS n FROM hr_employees WHERE store_id = $1`, [storeId]).catch(() => false),
    countHas(pool, `SELECT count(*)::int AS n FROM bom_headers WHERE store_id = $1`, [storeId]).catch(() => false),
    countHas(pool, `SELECT count(*)::int AS n FROM alert_rules WHERE store_id = $1`, [storeId]).catch(() => false),
    countHas(pool, `SELECT count(*)::int AS n FROM api_keys WHERE store_id = $1 AND is_active = true`, [storeId]).catch(() => false),
  ]);

  tasks.push(
    // Setup básico
    { key: "store_settings", category: "setup", done: hasStoreConfig,
      title: "Configurar tienda", description: "Nombre, RNC, dirección, teléfono",
      href: "/store-settings" },
    { key: "warehouses", category: "setup", done: hasWarehouses,
      title: "Crear almacenes", description: "Al menos uno para operar",
      href: "/warehouses" },
    { key: "categories", category: "setup", done: hasCategories,
      title: "Definir categorías de productos", description: "Para organizar el catálogo",
      href: "/admin/categories-brands" },
    { key: "bank_account", category: "setup", done: hasBankAccount,
      title: "Registrar cuenta bancaria", description: "Para tesorería y conciliación",
      href: "/treasury" },
    // Comercial
    { key: "products", category: "commercial", done: hasProducts,
      title: "Cargar productos", description: "Catálogo inicial",
      href: "/product-management" },
    { key: "customers", category: "commercial", done: hasCustomers,
      title: "Registrar clientes", description: "Al menos uno para facturar",
      href: "/customer-management" },
    { key: "suppliers", category: "commercial", done: hasSuppliers,
      title: "Registrar proveedores", description: "Para OCs y AP",
      href: "/purchase-management" },
    { key: "first_order", category: "commercial", done: hasOrders,
      title: "Crear primera orden", description: "POS o Órdenes",
      href: "/pos" },
    // Operacional
    { key: "employees", category: "operational", done: hasEmployees,
      title: "Registrar empleados (opcional)", description: "Para RRHH y TSS",
      href: "/hr/employees" },
    { key: "bom", category: "operational", done: hasBom,
      title: "Definir recetas BOM (opcional)", description: "Solo para fabricantes",
      href: "/manufacturing" },
    { key: "alerts", category: "operational", done: hasAlertRule,
      title: "Configurar alertas proactivas", description: "Cash bajo, AR vencidas, stock",
      href: "/alerts" },
    { key: "api_key", category: "operational", done: hasApiKey,
      title: "Emitir API key (opcional)", description: "Para integraciones externas",
      href: "/api-keys" },
  );

  const completed = tasks.filter((t) => t.done).length;
  return {
    tasks,
    completedCount: completed,
    totalCount: tasks.length,
    progressPct: Math.round((completed / tasks.length) * 100),
  };
}

async function countHas(pool: Pool, sql: string, params: any[]): Promise<boolean> {
  try {
    const r = await pool.query(sql, params);
    return Number(r.rows[0]?.n ?? 0) > 0;
  } catch {
    return false;
  }
}

// ── FAQ / Knowledge base ──────────────────────────────────────────

export interface FaqEntry {
  id: string;
  category: string;
  question: string;
  answer: string;
  keywords: string[];
  href?: string;
}

const FAQ: FaqEntry[] = [
  // Fiscal DR
  {
    id: "ncf",
    category: "Fiscal",
    question: "¿Cómo genero un NCF (Número de Comprobante Fiscal)?",
    answer: "Los NCF se emiten automáticamente al facturar desde Facturación o POS. Configura tu secuencia autorizada por DGII en Fiscal → Comprobantes. Cada tipo (B01, B02, B04, etc.) tiene su rango.",
    keywords: ["ncf", "comprobante", "fiscal", "b01", "b02", "dgii", "factura"],
    href: "/fiscal/documents",
  },
  {
    id: "itbis",
    category: "Fiscal",
    question: "¿El sistema calcula el ITBIS automáticamente?",
    answer: "Sí. Los productos tienen impuesto configurable (18% por defecto). En cada venta se calcula automáticamente y se separa en el asiento contable. El panel ejecutivo muestra ITBIS neto a pagar a DGII.",
    keywords: ["itbis", "impuesto", "18", "dgii", "iva"],
    href: "/executive-dashboard",
  },
  {
    id: "606",
    category: "Fiscal",
    question: "¿Cómo genero el formulario 606 y 607?",
    answer: "Ve a Fiscal → Reportes DGII. Selecciona el período y descarga los formatos 606 (compras) y 607 (ventas) ya listos para subir al portal DGII.",
    keywords: ["606", "607", "reporte", "dgii", "mensual"],
    href: "/fiscal/reports",
  },
  {
    id: "ecf",
    category: "Fiscal",
    question: "¿El sistema soporta e-CF (facturación electrónica)?",
    answer: "Sí. Configura el ambiente (simulado/pre-producción/producción) en Fiscal → e-CF. En producción usa el signer XAdES-BES con tu certificado de firma electrónica autorizado.",
    keywords: ["ecf", "e-cf", "electronica", "firma", "xades"],
    href: "/fiscal/ecf",
  },
  // TSS / RRHH
  {
    id: "tss",
    category: "RRHH",
    question: "¿Cómo calculo los aportes TSS de un empleado?",
    answer: "En RRHH → TSS abre la calculadora, ingresa el salario bruto y verás AFP (2.87% emp / 7.10% pat), SFS (3.04% emp / 7.09% pat), INFOTEP (1%) y SRL (1.30%). También se generan las novedades SUIR+.",
    keywords: ["tss", "afp", "sfs", "sipen", "sisalril", "aportes", "seguridad social", "infotep"],
    href: "/hr/tss",
  },
  {
    id: "cesantia",
    category: "RRHH",
    question: "¿El sistema calcula la cesantía correctamente?",
    answer: "Sí. Al terminar la relación laboral en RRHH → Empleados, el sistema calcula preaviso, cesantía (según años trabajados: 6 días para 3-6 meses, 13 para 6-12, 21 para 1-5 años, 23 para más de 5), y compensación de vacaciones + regalía proporcional.",
    keywords: ["cesantia", "prestaciones", "preaviso", "regalía", "13", "vacaciones", "liquidación"],
    href: "/hr/employees",
  },
  // Contabilidad
  {
    id: "conciliacion",
    category: "Contabilidad",
    question: "¿Cómo hago la conciliación bancaria?",
    answer: "Ve a Contabilidad → Conciliación Bancaria. Selecciona la cuenta, importa el CSV del banco (BHD, Popular, Reservas, Banreservas). El auto-match empareja movimientos por fecha + monto + referencia con 5 niveles de confianza.",
    keywords: ["conciliacion", "bancaria", "banco", "csv", "match", "extracto"],
    href: "/bank-reconciliation",
  },
  {
    id: "fx",
    category: "Contabilidad",
    question: "¿Cómo manejo las cuentas en USD?",
    answer: "Regístrate en Revaluación FX. Ingresa las tasas diarias (spot, closing, avg). Al cierre mensual corre la revaluación: recalcula AR/AP/bancos USD con la tasa de cierre y postea ganancia/pérdida por diferencia cambiaria.",
    keywords: ["dolar", "usd", "revaluacion", "cambio", "fx", "moneda", "diferencia cambiaria"],
    href: "/fx-revaluation",
  },
  {
    id: "cash_flow",
    category: "Contabilidad",
    question: "¿Cómo proyecto mi flujo de caja?",
    answer: "En Contabilidad → Flujo de Caja. El sistema consolida bancos + AR vencidas + AP vencidas + gastos recurrentes (nómina, alquiler, servicios) en 13 semanas. Alerta si el balance quedaría negativo.",
    keywords: ["flujo", "caja", "cash flow", "proyeccion", "liquidez", "presupuesto"],
    href: "/cash-flow",
  },
  // Inventario
  {
    id: "landed_cost",
    category: "Inventario",
    question: "¿Cómo distribuyo el costo de importación (flete, aduana)?",
    answer: "Compras → Costos de Importación. Crea un voucher, agrega líneas (flete, aduana, ITBIS despacho, agente aduanal), asigna las OCs recibidas, escoge método de prorateo (valor/cantidad/peso/volumen). Al aplicar actualiza el costo unitario en inventario.",
    keywords: ["landed", "importacion", "flete", "aduana", "prorateo", "contenedor", "costo"],
    href: "/landed-costs",
  },
  {
    id: "bom",
    category: "Producción",
    question: "¿Cómo defino una receta de producción?",
    answer: "En Inventario → Producción → Recetas. Define el producto terminado y sus componentes (MPs) con cantidad por unidad y % scrap. Luego crea una Orden de Producción que al completar hace backflush automático (descuenta MPs, ingresa PT).",
    keywords: ["bom", "receta", "produccion", "manufactura", "backflush", "mp"],
    href: "/manufacturing",
  },
  // API
  {
    id: "api",
    category: "Integraciones",
    question: "¿Cómo integro con sistemas externos?",
    answer: "Emite una API key en Configuración → API Keys. Define scopes (read/write/admin) y rate limit. Consulta la spec OpenAPI en /api/v1/openapi.json. Endpoints: /v1/dashboard, /v1/orders, /v1/products, /v1/customers, /v1/fx/rate.",
    keywords: ["api", "integracion", "webhook", "zapier", "openapi", "swagger", "key", "token"],
    href: "/api-keys",
  },
  // Alertas
  {
    id: "alerts",
    category: "Automatización",
    question: "¿Cómo configuro alertas automáticas?",
    answer: "En Principal → Alertas Proactivas. Crea reglas (cash bajo, AR vencida, stock bajo, aprobaciones estancadas, MO sin stock, tasa FX vieja). Selecciona canales (in-app, email, WhatsApp). El scheduler evalúa cada 15 min automáticamente.",
    keywords: ["alerta", "notificacion", "automatica", "email", "whatsapp", "cron", "aviso"],
    href: "/alerts",
  },
];

export function getFaq(): FaqEntry[] {
  return FAQ;
}

export function searchFaq(query: string, limit = 5): FaqEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return FAQ.slice(0, limit);
  const terms = q.split(/\s+/).filter((t) => t.length > 1);
  const scored = FAQ.map((entry) => {
    let score = 0;
    const haystack = (entry.question + " " + entry.answer + " " + entry.keywords.join(" ")).toLowerCase();
    for (const term of terms) {
      if (entry.keywords.includes(term)) score += 10;
      if (haystack.includes(term)) score += 3;
    }
    return { entry, score };
  }).filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map((x) => x.entry);
}

// ── Tips contextuales por ruta ────────────────────────────────────

const ROUTE_TIPS: Record<string, string[]> = {
  "/dashboard": [
    "El dashboard muestra cifras contables por mes. Para ventas de hoy y aging, usa el Panel Ejecutivo.",
  ],
  "/executive-dashboard": [
    "Se refresca cada 60 segundos. Click en cualquier alerta para ir al detalle.",
    "Si aparece 'Aging > 20%' significa que más del 20% de tus AR están vencidas.",
  ],
  "/pos": [
    "Puedes escanear el código de barras o SKU del producto para agregarlo al carrito.",
    "Presiona F2 para buscar cliente, F4 para completar el pago.",
  ],
  "/hr/tss": [
    "La calculadora usa las tasas 2026: AFP 2.87%/7.10%, SFS 3.04%/7.09%, INFOTEP 1%, SRL 1.30%.",
    "Las novedades SUIR+ se generan automáticamente al cambiar salario, dar alta o baja.",
  ],
  "/cash-flow": [
    "Los flujos recurrentes se expanden según la frecuencia. Marca como 'baja certeza' los inciertos para escenarios pesimistas.",
    "El balance mínimo debajo de cero indica una alerta de liquidez.",
  ],
  "/landed-costs": [
    "Prorateo por valor es el default. Usa por cantidad para agente aduanal, por peso para flete marítimo pesado.",
    "El voucher no se puede aplicar 2 veces — protege contra duplicados.",
  ],
  "/bank-reconciliation": [
    "Match 'exact' requiere referencia; 'high' es sin referencia; 'medium' permite ±3 días de diferencia.",
    "Si hay múltiples candidatos, la línea queda 'ambiguous' para revisión manual.",
  ],
  "/alerts": [
    "Cada regla tiene 'debounce' — no se dispara dos veces en el mismo período.",
    "Los eventos idénticos del mismo día son deduplicados por SHA-256.",
  ],
  "/api-keys": [
    "El token solo se muestra 1 vez al emitirlo. Guárdalo en un password manager.",
    "Puedes rotar (revocar + emitir nueva) sin downtime.",
  ],
  "/manufacturing": [
    "Al liberar una MO, si falta stock de MP se marca 'short' pero la MO se puede completar de todas formas.",
    "El backflush descuenta MPs proporcional a la actualQuantity vs plannedQuantity.",
  ],
};

export function getTipsForRoute(pathname: string): string[] {
  if (ROUTE_TIPS[pathname]) return ROUTE_TIPS[pathname];
  const prefix = Object.keys(ROUTE_TIPS).find((r) => pathname.startsWith(r + "/"));
  return prefix ? ROUTE_TIPS[prefix] : [];
}
