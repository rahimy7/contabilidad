/**
 * Catálogo de módulos: lo que el sistema hace, contrastado contra el esquema
 * ERP de referencia.
 *
 * El estado de cada punto es una afirmación verificable, no una aspiración:
 *
 *   `disponible`  la pantalla existe, está en el menú y hace lo que dice.
 *   `parcial`     hay una parte real y una parte que falta, y ambas se nombran.
 *                 Es el estado más útil del catálogo y el más fácil de inflar.
 *   `ausente`     no existe. Sin rodeos: decir "planificado" de algo que nadie
 *                 empezó convierte este documento en publicidad.
 *
 * Cuando algo es `parcial`, `falta` dice exactamente qué falta. Un catálogo que
 * sólo enumera lo que hay sirve para vender; uno que enumera lo que no hay
 * sirve para decidir en qué trabajar.
 */

export type Estado = "disponible" | "parcial" | "ausente";

export interface Capacidad {
  nombre: string;
  estado: Estado;
  /** Dónde vive, cuando existe. */
  ruta?: string;
  /** Qué hace hoy. */
  detalle?: string;
  /** Qué falta, cuando es parcial o ausente. */
  falta?: string;
}

export interface Area {
  codigo: string;
  nombre: string;
  /** Para qué sirve el área, en una línea. */
  proposito: string;
  capacidades: Capacidad[];
}

export const AREAS: Area[] = [
  {
    codigo: "01",
    nombre: "Finanzas",
    proposito: "El libro mayor y todo lo que desemboca en él.",
    capacidades: [
      {
        nombre: "Contabilidad",
        estado: "disponible",
        ruta: "/accounting/accounts",
        detalle:
          "Plan de cuentas jerárquico, asientos por partida doble y balance de comprobación. " +
          "Nada se postea directo: todo pasa por reglas de posteo que deciden qué cuenta " +
          "recibe cada movimiento, así que cambiar una política contable no exige tocar código.",
      },
      {
        nombre: "Cuentas por cobrar",
        estado: "disponible",
        ruta: "/receivables",
        detalle:
          "Partidas abiertas por cliente, antigüedad de saldos y aplicación de cobros. " +
          "El saldo de la cuenta de control siempre equivale a la suma de las partidas abiertas.",
      },
      {
        nombre: "Cuentas por pagar",
        estado: "disponible",
        ruta: "/payables",
        detalle:
          "Factura de proveedor con ITBIS adelantado y retenciones, partidas abiertas y pagos. " +
          "Una compra de mercancía alimenta además el costeo de inventario en el mismo asiento.",
      },
      {
        nombre: "Tesorería",
        estado: "disponible",
        ruta: "/treasury",
        detalle: "Cuentas bancarias, movimientos y saldo en libros.",
      },
      {
        nombre: "Bancos y conciliaciones",
        estado: "disponible",
        ruta: "/treasury",
        detalle:
          "Conciliación bancaria completa: partidas marcadas, depósitos en tránsito, " +
          "cheques pendientes y la diferencia que debe llegar a cero para poder cerrarla.",
      },
      {
        nombre: "Presupuesto",
        estado: "disponible",
        ruta: "/budget",
        detalle: "Presupuesto por cuenta y período, con reporte de variación contra lo real.",
      },
      {
        nombre: "Flujo de caja",
        estado: "parcial",
        ruta: "/dashboard",
        detalle: "El panel muestra el flujo de caja del mes y su variación contra el anterior.",
        falta:
          "No hay estado de flujo de efectivo formal (método directo o indirecto) ni " +
          "proyección de caja a futuro.",
      },
      {
        nombre: "Activos fijos",
        estado: "disponible",
        ruta: "/fixed-assets",
        detalle: "Registro de activos, vida útil, valor residual y corrida de depreciación que postea al mayor.",
      },
      {
        nombre: "Impuestos",
        estado: "disponible",
        ruta: "/fiscal/reports",
        detalle:
          "Formatos DGII 606, 607, 608 y 609, más IT-1 e IR-17. Se generan del mismo " +
          "libro que produce los estados financieros, así que no pueden discrepar entre sí.",
      },
      {
        nombre: "Facturación",
        estado: "disponible",
        ruta: "/invoicing",
        detalle:
          "Facturación formal con encabezado fiscal, cliente con RNC, y líneas con descuento " +
          "e ITBIS. El NCF se consume de último: si algo falla, el pedido queda corregible " +
          "en lugar de quemar un número.",
      },
      {
        nombre: "Facturación electrónica",
        estado: "disponible",
        ruta: "/fiscal/ecf",
        detalle:
          "Ciclo e-CF completo: firma, transmisión, cola de reintentos con contingencia, " +
          "consulta de estado, bandeja de comprobantes recibidos con acuse de recibo y " +
          "aprobación comercial, resumen de consumo (RFCE), anulación de rangos y " +
          "representación impresa con QR de verificación. Corre contra un DGII simulado " +
          "que reproduce el handshake, las validaciones y la resolución asíncrona.",
        falta:
          "El certificado digital de una autoridad autorizada por DGII no está cargado: " +
          "la firma es estructuralmente válida pero DGII todavía no confía en ella.",
      },
      {
        nombre: "Notas de crédito y débito",
        estado: "parcial",
        ruta: "/sales-returns",
        detalle:
          "Notas de crédito completas (B04/E34) contra la factura original, con control de " +
          "sobre-crédito y reingreso opcional de mercancía al costo con que salió.",
        falta: "La nota de débito (B03/E33) existe en el catálogo de tipos pero no tiene flujo propio.",
      },
      {
        nombre: "Reportes financieros",
        estado: "disponible",
        ruta: "/accounting/financial-statements",
        detalle:
          "Estado de resultados y balance general, más consolidación multiempresa con " +
          "conversión de moneda y eliminación de operaciones entre compañías.",
      },
    ],
  },

  {
    codigo: "02",
    nombre: "Ventas",
    proposito: "Del cliente al comprobante, por cualquiera de los canales.",
    capacidades: [
      {
        nombre: "Clientes",
        estado: "disponible",
        ruta: "/customer-management",
        detalle: "Catálogo de clientes con RNC/cédula, crédito y cuenta corriente.",
      },
      {
        nombre: "Prospectos",
        estado: "ausente",
        falta: "No hay registro de prospectos ni embudo previo a la venta.",
      },
      {
        nombre: "Cotizaciones",
        estado: "ausente",
        falta:
          "No se puede emitir una cotización ni convertirla en pedido. Hoy se factura o se " +
          "toma pedido directamente.",
      },
      {
        nombre: "Pedidos",
        estado: "disponible",
        ruta: "/order-management",
        detalle: "Pedidos con estados, asignación y seguimiento hasta la entrega.",
      },
      {
        nombre: "Aprobación de precios y descuentos",
        estado: "ausente",
        falta:
          "El descuento se aplica por línea sin límite ni flujo de autorización: nadie tiene " +
          "que aprobar un descuento fuera de política.",
      },
      {
        nombre: "Facturación",
        estado: "disponible",
        ruta: "/invoicing",
        detalle: "Facturación formal y punto de venta táctil, ambos emiten comprobante fiscal.",
      },
      {
        nombre: "Devoluciones",
        estado: "disponible",
        ruta: "/sales-returns",
        detalle:
          "Devolución contra la factura original: muestra facturado, ya devuelto y disponible " +
          "por producto y precio, e impide acreditar más de lo vendido.",
      },
      {
        nombre: "Comisiones",
        estado: "ausente",
        falta: "No hay cálculo ni liquidación de comisiones por vendedor.",
      },
      {
        nombre: "Canales de venta",
        estado: "parcial",
        detalle:
          "Operan tres canales: punto de venta, catálogo público con pedido en línea, y " +
          "WhatsApp con asistente que arma el pedido.",
        falta: "No hay gestión unificada de canales ni comparación de desempeño entre ellos.",
      },
      {
        nombre: "Indicadores comerciales",
        estado: "parcial",
        ruta: "/reports",
        detalle: "Reporte de ventas por período, historial y márgenes por producto.",
        falta: "No hay cuota por vendedor, pipeline ni indicadores de conversión.",
      },
    ],
  },

  {
    codigo: "03",
    nombre: "Compras y abastecimiento",
    proposito: "Del proveedor al almacén, con su costo bien puesto.",
    capacidades: [
      {
        nombre: "Requisiciones",
        estado: "ausente",
        falta:
          "No existe la solicitud interna previa a la compra: la orden se crea directamente, " +
          "sin que nadie la haya pedido formalmente.",
      },
      {
        nombre: "Cotizaciones a proveedores",
        estado: "ausente",
        falta: "No se registran ofertas de varios proveedores para comparar antes de decidir.",
      },
      {
        nombre: "Proveedores",
        estado: "disponible",
        ruta: "/purchase-management",
        detalle: "Catálogo de proveedores con RNC/cédula, contacto y condiciones.",
      },
      {
        nombre: "Evaluación de proveedores",
        estado: "ausente",
        falta: "No hay calificación por cumplimiento, calidad ni puntualidad de entrega.",
      },
      {
        nombre: "Órdenes de compra",
        estado: "disponible",
        ruta: "/purchase-management",
        detalle: "Orden con líneas, costos, impuestos y estado de recepción.",
      },
      {
        nombre: "Aprobaciones",
        estado: "ausente",
        falta: "Una orden de compra no requiere autorización de nadie, sin importar el monto.",
      },
      {
        nombre: "Recepción",
        estado: "disponible",
        ruta: "/purchase-management",
        detalle:
          "Recepción total o parcial con lote, fecha de vencimiento y —si el almacén usa " +
          "ubicaciones— el estante donde quedó cada cosa.",
      },
      {
        nombre: "Devoluciones a proveedores",
        estado: "ausente",
        falta:
          "No hay flujo para devolver mercancía comprada ni para la nota de crédito que el " +
          "proveedor debería emitir.",
      },
    ],
  },

  {
    codigo: "04",
    nombre: "Almacén e inventario",
    proposito: "Cuánto hay, dónde está, cuánto vale y en qué orden sale.",
    capacidades: [
      {
        nombre: "Maestro de productos",
        estado: "disponible",
        ruta: "/product-management",
        detalle: "Productos con SKU, código de barras, categoría, marca y unidades de medida con conversión.",
      },
      {
        nombre: "Recepciones",
        estado: "disponible",
        ruta: "/purchase-management",
        detalle: "Entrada por orden de compra, con lote, vencimiento y ubicación de destino.",
      },
      {
        nombre: "Despachos",
        estado: "parcial",
        detalle:
          "La mercancía sale al facturar o vender en caja, y si el almacén usa ubicaciones " +
          "se descuenta del estante que corresponde según FIFO o FEFO.",
        falta:
          "No hay pantalla de despacho ni lista de picking impresa: el picker no tiene un " +
          "documento con la ruta de recorrido.",
      },
      {
        nombre: "Transferencias",
        estado: "disponible",
        ruta: "/warehouse-transfers",
        detalle:
          "Traslado entre almacenes con aprobación y confirmación de recibido. No genera " +
          "asiento: el valor cambia de bodega, no de cuenta.",
      },
      {
        nombre: "Ajustes",
        estado: "disponible",
        ruta: "/inventory-adjustment",
        detalle: "Ajuste de existencia con motivo y registro del movimiento.",
      },
      {
        nombre: "Conteos físicos",
        estado: "disponible",
        ruta: "/inventory-count",
        detalle:
          "Conteo como documento con vida propia: se abre congelando lo que el sistema cree, " +
          "se cuenta a ciegas, se revisa y sólo al aplicar cambia algo. General, cíclico o " +
          "puntual por ubicación. El faltante va a gasto por faltante, no a costo de ventas.",
      },
      {
        nombre: "Inventario disponible",
        estado: "disponible",
        ruta: "/warehouses",
        detalle: "Existencia por almacén y por ubicación, con valor.",
      },
      {
        nombre: "Inventario comprometido",
        estado: "parcial",
        detalle: "El modelo de ubicaciones lleva una cantidad reservada por estante.",
        falta:
          "Ningún flujo la usa todavía: un pedido no reserva mercancía, así que dos ventas " +
          "pueden prometer la misma caja.",
      },
      {
        nombre: "Lotes y series",
        estado: "parcial",
        ruta: "/inventory-traceability",
        detalle:
          "Lotes completos: se abren en la recepción, se consumen por FIFO o FEFO y se " +
          "rastrean hasta la venta.",
        falta: "No hay número de serie por unidad, que es lo que exige un equipo con garantía individual.",
      },
      {
        nombre: "Vencimientos",
        estado: "disponible",
        ruta: "/warehouse-locations",
        detalle:
          "Reporte de vencidos y por vencer con el plazo configurable, y despacho FEFO que " +
          "saca primero lo que vence antes — que para perecederos no es lo mismo que lo más viejo.",
      },
      {
        nombre: "Ubicaciones",
        estado: "disponible",
        ruta: "/warehouse-locations",
        detalle:
          "Ubicaciones tipo WMS, opcionales por almacén. Tipos de estante (picking, reserva, " +
          "recepción, cuarentena, averías), orden de recorrido, generación en rejilla y " +
          "bitácora de todo lo que entró, salió o se movió.",
      },
      {
        nombre: "Reabastecimiento",
        estado: "parcial",
        detalle: "El stock por almacén admite mínimo y máximo.",
        falta:
          "No hay sugerencia de reposición ni generación automática de orden de compra al " +
          "llegar al mínimo.",
      },
      {
        nombre: "Valorización",
        estado: "disponible",
        ruta: "/inventory-costing",
        detalle:
          "Costeo por promedio ponderado o FIFO, por producto y por almacén, con kardex. " +
          "La suma de las valorizaciones cuadra con la cuenta de control del mayor.",
      },
    ],
  },

  {
    codigo: "05",
    nombre: "Operaciones",
    proposito: "El trabajo que hay que hacer y quién lo está haciendo.",
    capacidades: [
      {
        nombre: "Planificación",
        estado: "ausente",
        falta: "No hay programación de capacidad ni calendario de carga de trabajo.",
      },
      {
        nombre: "Órdenes de trabajo y servicio",
        estado: "parcial",
        ruta: "/appointments",
        detalle: "Citas y servicios con duración y responsable, y paneles por tipo de técnico.",
        falta:
          "No es una orden de trabajo con materiales, mano de obra y costo: es una cita " +
          "agendada.",
      },
      {
        nombre: "Asignación",
        estado: "disponible",
        ruta: "/assignment-rules",
        detalle: "Reglas de asignación automática por sector, carga y tipo de trabajo.",
      },
      {
        nombre: "Ejecución",
        estado: "parcial",
        ruta: "/technician-dashboard",
        detalle: "Paneles de técnico, médico y reparto donde cada quien ve y avanza lo suyo.",
        falta: "No se registra tiempo trabajado ni consumo de materiales contra la orden.",
      },
      {
        nombre: "Seguimiento",
        estado: "disponible",
        ruta: "/trips",
        detalle: "Viajes de reparto con estado, órdenes asignadas y avance.",
      },
      {
        nombre: "Control de costos",
        estado: "ausente",
        falta: "No hay costo real por orden ni comparación contra lo presupuestado.",
      },
      {
        nombre: "Incidencias",
        estado: "ausente",
        falta: "No hay registro de eventos que interrumpen la operación.",
      },
      {
        nombre: "Cierre",
        estado: "parcial",
        detalle: "El pedido y la cita tienen estado final.",
        falta: "No hay cierre formal con conformidad del cliente ni liquidación de la orden.",
      },
    ],
  },

  {
    codigo: "06",
    nombre: "Mercadeo",
    proposito: "Atraer y convertir.",
    capacidades: [
      { nombre: "Campañas", estado: "ausente", falta: "No hay gestión de campañas." },
      { nombre: "Segmentación", estado: "ausente", falta: "No hay segmentos de clientes definibles." },
      { nombre: "Leads", estado: "ausente", falta: "No hay captura ni calificación de leads." },
      {
        nombre: "Canales",
        estado: "parcial",
        detalle: "Catálogo público compartible y WhatsApp con respuestas automáticas.",
        falta: "No hay atribución de origen ni medición por canal.",
      },
      { nombre: "Presupuesto de mercadeo", estado: "ausente", falta: "El presupuesto es contable, no por campaña." },
      {
        nombre: "Promociones",
        estado: "parcial",
        detalle: "Puntos de lealtad con acreditación automática, y descuentos por línea en la venta.",
        falta: "No hay promociones con vigencia, condiciones ni combos.",
      },
      { nombre: "Contenido", estado: "ausente", falta: "No hay gestión de contenido de mercadeo." },
      { nombre: "Conversión", estado: "ausente", falta: "No se mide el embudo de conversión." },
      { nombre: "ROI de campañas", estado: "ausente", falta: "Sin campañas no hay retorno que calcular." },
    ],
  },

  {
    codigo: "07",
    nombre: "Recursos humanos",
    proposito: "La gente, desde que entra hasta que sale.",
    capacidades: [
      { nombre: "Reclutamiento", estado: "ausente", falta: "No hay vacantes ni postulaciones." },
      { nombre: "Selección", estado: "ausente", falta: "No hay proceso de selección ni evaluación de candidatos." },
      {
        nombre: "Expediente del empleado",
        estado: "parcial",
        ruta: "/employees",
        detalle: "Ficha con datos básicos, rol, sector asignado y almacén.",
        falta: "No hay documentos del expediente, historial laboral ni datos de contrato.",
      },
      { nombre: "Contratación", estado: "ausente", falta: "No hay registro de contratos ni sus vencimientos." },
      { nombre: "Inducción", estado: "ausente", falta: "No hay plan de inducción." },
      { nombre: "Asistencia", estado: "ausente", falta: "No hay marcaje de entrada/salida ni control de horas." },
      { nombre: "Vacaciones y permisos", estado: "ausente", falta: "No hay solicitud ni saldo de vacaciones." },
      {
        nombre: "Nómina",
        estado: "disponible",
        ruta: "/payroll",
        detalle:
          "Corrida de nómina con TSS, INFOTEP e ISR, volantes de pago por empleado y " +
          "asiento contable de la corrida.",
      },
      { nombre: "Beneficios", estado: "ausente", falta: "No hay administración de beneficios." },
      { nombre: "Evaluación de desempeño", estado: "ausente", falta: "No hay evaluaciones." },
      { nombre: "Capacitación", estado: "ausente", falta: "No hay plan ni registro de capacitación." },
      { nombre: "Seguridad y salud", estado: "ausente", falta: "No hay registro de incidentes laborales." },
      { nombre: "Desvinculación", estado: "ausente", falta: "No hay proceso de salida ni cálculo de prestaciones." },
    ],
  },

  {
    codigo: "08",
    nombre: "Administración",
    proposito: "Lo que sostiene la operación sin ser la operación.",
    capacidades: [
      { nombre: "Servicios generales", estado: "ausente", falta: "No hay gestión de servicios generales." },
      { nombre: "Contratos", estado: "ausente", falta: "No hay repositorio de contratos ni alertas de vencimiento." },
      { nombre: "Documentos", estado: "ausente", falta: "No hay gestión documental." },
      { nombre: "Correspondencia", estado: "ausente", falta: "No hay control de correspondencia." },
      { nombre: "Seguros", estado: "ausente", falta: "No hay pólizas ni sus vencimientos." },
      { nombre: "Mantenimiento", estado: "ausente", falta: "No hay mantenimiento preventivo ni correctivo de activos." },
      {
        nombre: "Gastos administrativos",
        estado: "parcial",
        ruta: "/payables",
        detalle: "Los gastos se registran como factura de proveedor y se contabilizan por su cuenta.",
        falta: "No hay control por centro de costo ni presupuesto de gasto por departamento.",
      },
    ],
  },

  {
    codigo: "09",
    nombre: "Servicio al cliente",
    proposito: "Lo que pasa después de vender.",
    capacidades: [
      {
        nombre: "Solicitudes",
        estado: "parcial",
        ruta: "/conversations",
        detalle:
          "Conversaciones de WhatsApp con asignación a agente, respuestas automáticas y " +
          "asistente que puede armar un pedido.",
        falta: "No hay solicitud formal con número, tipo ni tiempo de respuesta comprometido.",
      },
      { nombre: "Tickets", estado: "ausente", falta: "No hay sistema de tickets con estado y prioridad." },
      { nombre: "Quejas", estado: "ausente", falta: "No hay registro formal de quejas." },
      { nombre: "Reclamaciones", estado: "ausente", falta: "No hay proceso de reclamación." },
      { nombre: "Garantías", estado: "ausente", falta: "No hay control de garantías por producto vendido." },
      {
        nombre: "Devoluciones",
        estado: "disponible",
        ruta: "/sales-returns",
        detalle: "Devolución con nota de crédito y reingreso opcional al inventario.",
      },
      { nombre: "Satisfacción", estado: "ausente", falta: "No hay medición de satisfacción." },
    ],
  },

  {
    codigo: "10",
    nombre: "Calidad y mejora continua",
    proposito: "Que lo que salió mal deje rastro y se corrija.",
    capacidades: [
      { nombre: "Gestión documental", estado: "ausente", falta: "No hay control de versiones de procedimientos." },
      {
        nombre: "Indicadores",
        estado: "parcial",
        ruta: "/dashboard",
        detalle: "Indicadores financieros y operativos en el panel, con alertas por módulo.",
        falta: "No hay indicadores de calidad ni metas definidas por proceso.",
      },
      { nombre: "Auditorías", estado: "ausente", falta: "No hay programa ni hallazgos de auditoría." },
      { nombre: "No conformidades", estado: "ausente", falta: "No hay registro de no conformidades." },
      { nombre: "Acciones correctivas", estado: "ausente", falta: "No hay seguimiento de acciones correctivas." },
      { nombre: "Riesgos", estado: "ausente", falta: "No hay matriz de riesgos." },
      { nombre: "Planes de mejora", estado: "ausente", falta: "No hay planes de mejora." },
      { nombre: "Gestión de procesos", estado: "ausente", falta: "No hay mapa de procesos." },
    ],
  },

  {
    codigo: "11",
    nombre: "Tecnología",
    proposito: "Quién puede entrar, a qué, y qué se integra con qué.",
    capacidades: [
      {
        nombre: "Usuarios",
        estado: "disponible",
        ruta: "/team",
        detalle: "Alta de usuarios, estado y pertenencia a empresa.",
      },
      {
        nombre: "Roles y permisos",
        estado: "disponible",
        ruta: "/team",
        detalle:
          "Control de acceso por rol contra un catálogo de vistas: el menú de cada quien " +
          "sale de lo que tiene asignado, y el permiso se verifica en cada petición contra " +
          "la base, no contra el token — así revocar un acceso surte efecto de inmediato.",
      },
      { nombre: "Activos tecnológicos", estado: "ausente", falta: "No hay inventario de equipos ni licencias." },
      { nombre: "Mesa de ayuda", estado: "ausente", falta: "No hay mesa de ayuda interna." },
      { nombre: "Incidentes", estado: "ausente", falta: "No hay registro de incidentes de TI." },
      { nombre: "Cambios", estado: "ausente", falta: "No hay control de cambios." },
      {
        nombre: "Integraciones",
        estado: "parcial",
        ruta: "/whatsapp-settings",
        detalle: "WhatsApp Business, DGII para facturación electrónica, y tasas de cambio.",
        falta: "No hay panel de integraciones ni API pública documentada para terceros.",
      },
      {
        nombre: "Seguridad",
        estado: "parcial",
        detalle:
          "Aislamiento entre empresas a nivel de base de datos: cada petición corre bajo un " +
          "rol sin privilegios especiales, así que una consulta mal escrita no puede ver " +
          "datos de otra empresa. La llave privada del certificado no sale ni con un SELECT *.",
        falta: "No hay bitácora de auditoría de accesos ni doble factor de autenticación.",
      },
      { nombre: "Respaldos", estado: "ausente", falta: "El respaldo depende del proveedor de base de datos; no hay política ni restauración probada desde el sistema." },
    ],
  },

  {
    codigo: "12",
    nombre: "Dirección y estrategia",
    proposito: "Hacia dónde va la empresa y si está llegando.",
    capacidades: [
      { nombre: "Plan estratégico", estado: "ausente", falta: "No hay plan estratégico en el sistema." },
      { nombre: "Objetivos", estado: "ausente", falta: "No hay objetivos con responsable y plazo." },
      {
        nombre: "KPI",
        estado: "parcial",
        ruta: "/dashboard",
        detalle:
          "Ingresos, gastos, resultado y flujo de caja con variación mensual, más alertas " +
          "de lo que requiere atención en cada módulo.",
        falta: "No se pueden definir KPI propios ni fijarles meta.",
      },
      {
        nombre: "Presupuesto",
        estado: "disponible",
        ruta: "/budget",
        detalle: "Presupuesto por cuenta con reporte de variación.",
      },
      { nombre: "Proyectos", estado: "ausente", falta: "No hay gestión de proyectos." },
      { nombre: "Riesgos estratégicos", estado: "ausente", falta: "No hay matriz de riesgos." },
      {
        nombre: "Cuadro de mando",
        estado: "parcial",
        ruta: "/dashboard",
        detalle: "Panel con indicadores financieros, gráficos de tendencia y centro de atención por módulo.",
        falta: "No es configurable: no se pueden elegir ni ordenar los indicadores que se muestran.",
      },
    ],
  },
];

/** Cuenta por estado, para el resumen de cobertura. */
export function resumen() {
  let disponible = 0;
  let parcial = 0;
  let ausente = 0;
  for (const a of AREAS) {
    for (const c of a.capacidades) {
      if (c.estado === "disponible") disponible++;
      else if (c.estado === "parcial") parcial++;
      else ausente++;
    }
  }
  return { disponible, parcial, ausente, total: disponible + parcial + ausente };
}

export function resumenArea(area: Area) {
  const disponible = area.capacidades.filter((c) => c.estado === "disponible").length;
  const parcial = area.capacidades.filter((c) => c.estado === "parcial").length;
  return { disponible, parcial, total: area.capacidades.length };
}
