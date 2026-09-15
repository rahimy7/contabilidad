# Plan de prueba — Ciclo completo de un mes

**Empresa de prueba:** Distribuidora Caribe SRL (consumo masivo y electrodomésticos)
**Período simulado:** 1 al 31 de octubre de 2026, con los pagos a DGII/TSS de noviembre
**Modalidad:** mes comprimido con fechas de documento de octubre (se ejecuta en pocas horas)

Este plan recorre el flujo completo de la empresa: datos maestros, contratación,
abastecimiento, inventario, ventas, devoluciones, cuentas por cobrar y por pagar,
tesorería, nómina, activos fijos, cierre contable y fiscal del mes. Cada caso trae
los datos exactos a digitar y el resultado esperado. El mismo mes está automatizado
(`test/scenario/distribuidora-october.test.ts`) con los mismos códigos de caso, de
modo que un fallo del script apunta al caso que un probador ejecutaría a mano.

---

## 1. Cómo usar este plan

### 1.1 Dos formas de ejecutarlo

| Forma | Comando | Para qué |
|---|---|---|
| Automática (verificación) | `yarn test:mes` | Toma la base de `DATABASE_URL` en `.env`, corre el mes completo en una empresa temporal, verifica todos los controles y la borra al final. `SCENARIO_VERBOSE=1 yarn test:mes` muestra cada paso; `SCENARIO_KEEP=1` conserva la empresa. |
| Carga para prueba manual | `yarn seed:mes --reset` | Carga el mes en la empresa RNC 131900002, visible en la UI para el usuario de `ADMIN_USERNAME`, e imprime los controles de cierre. |
| Manual desde cero | Seguir las secciones 3 a 9 | Probar pantallas y permisos. Use otra empresa (otro RNC) para no mezclar con la carga automática. |

### 1.2 Marcado de resultados

Cada caso se marca **✅ Pasa**, **❌ Falla** o **⚠ Parcial**. Toda falla se registra en la
hoja de incidencias (sección 12) con pantalla, datos, resultado obtenido y esperado.

### 1.3 Regla de oro de la verificación

Todo caso que mueve dinero o mercancía se verifica en **tres lugares**:

1. **El documento** (factura, recepción, volante…): existe, con su número y montos.
2. **El auxiliar** (partida de CxC/CxP, existencia por almacén, movimiento bancario).
3. **El mayor** (el asiento, con las cuentas de la sección 10.2).

Al final del mes, el endpoint `GET /api/accounting/month-end-checklist?year=2026&month=10`
debe devolver `ok: true`, con todos los controles de la sección 10.1 cuadrados.

---

## 2. Ambiente (Día 0)

| # | Paso | Resultado esperado |
|---|---|---|
| D00-AMB-01 | Respaldar la base de datos (rama de Neon) antes de empezar. | Punto de restauración disponible. |
| D00-AMB-02 | Aplicar migraciones: `npx drizzle-kit migrate`. | Migraciones hasta `0064_subledger_document_cascade` aplicadas. |
| D00-AMB-03 | Crear la empresa: `POST /api/companies` con RNC y razón social. | Plan de cuentas, impuestos, reglas contables y períodos creados. |
| D00-CFG-01 | Abrir el ejercicio desde octubre: `POST /api/accounting/periods/2026/open {openFrom: "2026-10-01"}`. | Enero–septiembre quedan cerrados como pre-operación; octubre a diciembre abiertos. |
| D00-CFG-02 | Configurar la política de descuentos: `companies.settings.sales.maxDiscountPercent = 10`. | Descuentos sobre 10% requieren aprobación. |

---

## 3. Datos maestros

### 3.1 Usuarios y roles (D00-SEG-01)

| Usuario | Nombre | Rol | Qué prueba |
|---|---|---|---|
| gerente | Carlos Méndez | admin | Aprueba OC ≥ RD$500,000 y comisiones |
| contador | Laura Peña | accountant | Contabiliza nómina, cierra el mes |
| comprador | Luis Castillo | purchasing | Emite OC, aprueba requisiciones |
| almacenista | Ramón Díaz | warehouse | Requisiciones, recepciones, conteos |
| vendedor1 | José Martínez | seller | Ventas a crédito (llega a la meta) |
| vendedor2 | María Santos | seller | Ventas a crédito (no llega a la meta) |
| cajera | Rosa Jiménez | cashier | Ventas de contado y tarjeta |
| rrhh | Carmen Vargas | hr | Contrataciones y entradas de nómina |

### 3.2 Almacenes

| Código | Nombre | Rotación | Uso |
|---|---|---|---|
| CENTRAL | Almacén Central (Santo Domingo) | FEFO | Recibe compras; ventas mayoristas |
| TIENDA | Sala de ventas / mostrador | FIFO | Ventas de contado |
| SANTIAGO | Sucursal Santiago | FIFO | Ventas del norte; conteo cíclico |
| AVERIAS | Cuarentena y averías | FIFO | Mercancía dañada para devolver |

### 3.3 Productos

| Código | Producto | ITBIS | Precio | Costo | Costeo | Nota |
|---|---|---|---|---|---|---|
| P01 | Arroz Selecto 25 lb | Exento | 1,450 | 1,150 | Promedio | Prueba de exentos |
| P02 | Aceite vegetal 1 galón | 18% | 720 | 520 | Promedio | Variación de precio en compra |
| P03 | Café molido 1 lb | 16% | 360 | 260 | Promedio | Tasa reducida; oferta 10% |
| P04 | Leche en polvo 2.2 lb | Exento | 820 | 610 | FIFO | Lotes y vencimiento |
| P05 | Detergente 5 kg | 18% | 690 | 480 | Promedio | Ajuste por avería |
| P06 | Galletas surtidas caja 24 | 18% | 520 | 350 | FIFO | Lotes; 2x1; devolución a proveedor |
| P07 | Refresco 2 L paquete de 8 | 18% | 600 | 410 | Promedio | Devolución de cliente; faltante en conteo |
| P08 | Nevera 10 pies | 18% | 26,900 | 18,500 | FIFO | Alto valor |
| P09 | Televisor 55" | 18% | 34,500 | 24,000 | FIFO | Descuento de proveedor 5% |
| P10 | Licuadora | 18% | 3,250 | 2,100 | Promedio | Sobrante en conteo |
| SUM01 | Resma papel carta | 18% | — | 280 | Promedio | **Suministro** (cuenta 1.1.03.002) |
| S01 | Servicio de entrega e instalación | 18% | 1,500 | — | — | **Servicio**, sin inventario |

### 3.4 Clientes y condiciones comerciales

| Código | Cliente | RNC/Cédula | Comprobante | Crédito | Límite | Retenciones |
|---|---|---|---|---|---|---|
| C01 | Supermercado La Económica SRL | 130555001 | B01 | 30 días | 900,000 | — |
| C02 | Colmado Don Pepe (Pedro Almonte) | 00112345678 | B01 | 15 días | 60,000 | — |
| C03 | Hotel Playa Dorada SA | 130555003 | B01 | 30 días | 400,000 | — |
| C04 | Ministerio de Educación | 401000011 | B15 | 45 días | 1,000,000 | ITBIS 30%, ISR 5% |
| C05 | Consumidor final | — | B02 | Contado | — | — |
| C06 | Rosa Jiménez (empleada) | 00133344455 | B02 | Contado | — | Descuento empleado 10% |
| C07 | Tienda Mi Barrio SRL | 130555007 | B01 | 30 días | 80,000 | Prueba de límite de crédito |

### 3.5 Proveedores

| Código | Proveedor | RNC/Cédula | Tipo | Operación | Plazo | Tipo 606 | Retención esperada |
|---|---|---|---|---|---|---|---|
| V01 | Distribuidora Nacional de Alimentos SRL | 101555001 | Jurídica | Bienes | 30 | 09 | — |
| V02 | ElectroImport del Caribe SRL | 101555002 | Jurídica | Bienes | 45 | 09 | — |
| V03 | Transporte Juan Pérez | 00198765432 | Física | Servicios | 15 | 02 | ITBIS 100% + ISR 10% |
| V04 | Inmobiliaria Rosado (Ana Rosado) | 00255566677 | Física | Servicios | 5 | 03 | ITBIS 100% + ISR 10% (alquileres) |
| V05 | Empresa Distribuidora de Electricidad del Este | 101555005 | Jurídica | Servicios | 20 | 02 | — |
| V06 | Contadores y Auditores Asociados SRL | 101555006 | Jurídica | Servicios | 30 | 02 | ITBIS 30% |
| V07 | Autos del Este SRL | 101555007 | Jurídica | Bienes | 15 | 10 | — (activo fijo) |
| V08 | Papelería Nacional SRL | 101555008 | Jurídica | Bienes | 30 | 02 | — (suministros) |
| V09 | CompuOffice SRL | 101555009 | Jurídica | Bienes | 30 | 10 | — (activo fijo) |

### 3.6 Fiscal, bancos y políticas

| # | Configuración | Valor |
|---|---|---|
| D00-FIS-01 | Secuencias NCF (vencen 2027-12-31) | B01 1–500, B02 1–2000, B03 1–100, B04 1–200, B14 1–100, B15 1–100 |
| D00-TES-01 | Cuentas bancarias | BRV-001 Banreservas corriente; POP-001 Banco Popular corriente (ambas a 1.1.01.003) |
| D00-APR-01 | Regla de aprobación de OC | Desde RD$500,000 aprueba el gerente general |
| D00-APR-02 | Regla de aprobación de requisiciones | Aprueba el comprador |
| D00-COM-01 | Regla de comisión | 3% sobre ventas netas, rol vendedor; meta RD$400,000 con 10% de bono |
| D00-PRO-01 | Oferta "Café 10%" | P03, 20–31 oct, porcentaje |
| D00-PRO-02 | Oferta "2x1 galletas" | P06, 20–31 oct, lleve 2 pague 1 |

---

## 4. Contratación de personal por área (D00-RH-01)

Se contrata por **RRHH → Empleados** (`POST /api/hr/employees`). Al guardar, el empleado
aparece automáticamente en la nómina de la empresa activa (`payroll_employees` enlazado
al expediente).

| Código | Empleado | Departamento | Cargo | Ingreso | Salario base | Variable de octubre |
|---|---|---|---|---|---|---|
| E01 | Carlos Méndez | Gerencia | Gerente General | 2019-01-15 | 180,000 | — |
| E02 | Laura Peña | Administración y Finanzas | Contadora | 2021-03-01 | 85,000 | — |
| E03 | Pedro Gil | Administración y Finanzas | Auxiliar contable | 2023-06-01 | 38,000 | — |
| E04 | Ana Rosario | Ventas | Gerente de Ventas | 2022-02-01 | 70,000 | Incentivo 7,000 |
| E05 | José Martínez | Ventas | Vendedor | 2024-01-10 | 25,000 | Comisión 3% + bono por meta |
| E06 | María Santos | Ventas | Vendedora | 2024-05-02 | 25,000 | Comisión 3% |
| E07 | Luis Castillo | Compras | Comprador | 2022-09-01 | 45,000 | — |
| E08 | Ramón Díaz | Almacén y Logística | Jefe de almacén | 2020-07-01 | 40,000 | 10 h extra al 35% |
| E09 | Félix Reyes | Almacén y Logística | Almacenista | 2023-02-15 | 22,000 | 12 h al 35%, 4 h al 100%, descuento préstamo 1,500 |
| E10 | Rosa Jiménez | Caja | Cajera | 2024-08-01 | 21,000 | Incentivo por cuadre 2,000 |
| E11 | Miguel Ortiz | Almacén y Logística | Chofer repartidor | 2021-11-01 | 23,000 | Incentivo por entregas 3,500 |
| E12 | Carmen Vargas | Recursos Humanos | Encargada de RRHH | 2022-04-01 | 55,000 | Bonificación 5,000 |
| E13 | Juan Paredes | Almacén y Logística | Ayudante de almacén | **2026-10-15** | 20,000 | Ingreso a mitad de mes (prorrateo) |

**Conceptos de nómina y su tratamiento** (catálogo `GET /api/modules/payroll/concepts`):

| Concepto | Cuenta de gasto | Cotiza TSS | Paga ISR | Base INFOTEP |
|---|---|---|---|---|
| SUELDO (salario ordinario) | 5.2.01.001 | Sí | Sí | Sí |
| HE35 / HE100 (horas extras) | 5.2.01.004 | Sí | Sí | Sí |
| COMISION | 5.2.01.005 | Sí | Sí | Sí |
| INCENTIVO | 5.2.01.006 | Sí | Sí | Sí |
| BONIFICACION | 5.2.01.006 | No | Sí | No |
| REGALIA | 5.2.01.007 | No | No | No |
| PRESTAMO / DESC_COMPRAS (deducciones) | abona 1.1.05.001 | — | — | — |

> **Validar con el contador antes de producción:** criterio TSS/ISR de la bonificación,
> salario mínimo cotizable (tope AFP 434,880 / SFS 217,440 / SRL 86,976), tasa SRL de la
> empresa (1.30% configurado) y tramos de ISR 2026. Todos son parámetros en
> `server/payroll/rates.ts` y se pueden sobrescribir por empresa.

---

## 5. Calendario del mes — abastecimiento e inventario

| Caso | Fecha | Pantalla / endpoint | Acción y datos | Resultado esperado |
|---|---|---|---|---|
| D01-TES-01 | 1-oct | Tesorería → Movimientos | Depósito de capital RD$6,000,000 en BRV (contrapartida 3.1.01.001). Transferencia BRV→POP RD$1,500,000 (`POST /api/treasury/transfers`). Fondos de caja 30,000 (1.1.01.001) y caja chica 20,000 (1.1.01.002) | Banco BRV 4,450,000; POP 1,500,000; un asiento por movimiento; la transferencia no afecta resultados |
| D01-AF-01 | 1-oct | CxP → Registrar factura | V07, NCF B0100007001, tipo **activo fijo**, cuenta vehículos 1.2.01.002, camión 2,200,000 + ITBIS 18%, vida 60 meses, residual 200,000 | Dr 1.2.01.002 2,200,000; Dr 1.1.04.001 396,000; Cr 2.1.01.001 2,596,000; activo creado en el registro |
| D01-AF-02 | 1-oct | Activos fijos → Nuevo | Mobiliario de oficina 150,000, 60 meses, capitalizado contra 3.1.01.001 (aporte en especie) | Dr 1.2.01.001 / Cr 3.1.01.001 150,000 |
| D02-COM-01 | 2-oct | Requisiciones | Almacenista pide 20 neveras (P08) para CENTRAL | Requisición pendiente de aprobación |
| D02-COM-02 | 2-oct | Aprobaciones | El **almacenista** intenta aprobar su propia requisición | **Rechazado**: "quien solicita no puede aprobar" |
| D02-COM-03 | 2-oct | Aprobaciones | El comprador aprueba | Requisición aprobada |
| D02-COM-04 | 2-oct | RFQ | RFQ de neveras: V02 a 18,500 y otro proveedor a 19,250; adjudicar V02 | Cotización de V02 adjudicada |
| D02-COM-05 | 2-oct | Compras → OC | OC-1 a V01 (CENTRAL): P01 200×1,150; P02 300×520; P03 250×260; P04 150×610; P05 200×480; P06 180×350; P07 300×410 | Número `OC-<empresa>-2026-000001`; subtotal 824,500; ITBIS 89,240; total **913,740**; queda **pendiente de aprobación** |
| D02-COM-06 | 2-oct | Compras → OC | OC-2 a V02 (enlazada a la requisición y la cotización): P08 20×18,500; P09 15×24,000 con 5% descuento; P10 60×2,100 | Subtotal 838,000; ITBIS 150,840; total **988,840**; pendiente de aprobación |
| D02-COM-07 | 2-oct | Compras → OC | OC-3 a V08: SUM01 100×280 | Total 33,040; no requiere aprobación |
| D02-COM-08 | 2-oct | Recepción | Intentar recibir OC-1 antes de aprobarla | **Rechazado**: "no está aprobada" |
| D02-COM-09 | 2-oct | Aprobaciones | Gerente aprueba OC-1 y OC-2 | Estado de aprobación `approved` |
| D03-INV-01 | 3-oct | Compras → Recibir | OC-1 al 60%: P01 120, P02 180, P03 150, P04 90 (lote LCH-2610, vence 2027-03-31), P05 120, P06 100 (lote GAL-A, vence 2026-12-15), P07 180 | OC-1 `partial`; Dr 1.1.03.001 / Cr **2.1.01.002 Recepciones por facturar**; existencias en CENTRAL en valuación, `warehouse_stock`, catálogo y kárdex |
| D03-INV-02 | 3-oct | Compras → Recibir | OC-2 completa; OC-3 completa (suministro → 1.1.03.002) | OC-2 y OC-3 `received` |
| D03-INV-03 | 4-oct | Compras → Recibir | Intentar recibir 81 arroces de OC-1 (quedan 80) | **Rechazado**: no se recibe más de lo ordenado |
| D05-INV-04 | 5-oct | Compras → Recibir | Resto de OC-1: P01 80, P02 120, P03 100, P04 60 (lote LCH-2611, vence 2027-04-30), P05 80, P06 80 (lote GAL-B, vence 2027-01-20), P07 120 | OC-1 `received`; la recepción anterior **no se vuelve a sumar** |
| D05-CXP-01 | 5-oct | CxP → Registrar factura (con OC) | V01 NCF B0100001001 contra OC-1; P02 facturado a **525** (pactado 520); resto igual | Total 915,510; Dr 2.1.01.002 824,500 (lo recibido) + Dr 5.1.01.002 **1,500** (variación de precio) + Dr 1.1.04.001 89,510 / Cr 2.1.01.001 915,510 |
| D05-CXP-02 | 5-oct | CxP → Registrar factura (con OC) | V02 B0100002001 (P09 con descuento 18,000) y V08 B0100008001 | Casan exacto: sin variación; 2.1.01.002 queda en **0** |
| D05-CXP-03 | 5-oct | CxP → Registrar factura | V04 alquiler octubre, NCF B1100000001 (B11), 60,000 + ITBIS, gasto 5.2.02.001, con retenciones, concepto alquileres | Retención ISR 6,000 (2.1.02.003) e ITBIS 10,800 (2.1.02.002); por pagar 54,000 |
| D05-CXP-04 | 5-oct | CxP → Pagos | Pago del camión 2,596,000 desde BRV | Dr 2.1.01.001 / Cr 1.1.01.003; movimiento en BRV visible en conciliación |
| D06-INV-02 | 6-oct | Transferencias | CENTRAL→TIENDA: P01 30, P02 50, P03 40, P04 20, P05 30, P06 30, P07 60, P10 10. CENTRAL→SANTIAGO: P02 60, P07 60, P08 6, P09 5, P10 15 | **Sin asiento**; valor que sale = valor que entra; stock actualizado en ambos almacenes |
| D06-CXP-05 | 6-oct | CxP → Registrar factura | V03 flete 12,000 + ITBIS (B11), gasto 5.2.02.005, retenciones (persona física) | ISR 1,200; ITBIS retenido 2,160; por pagar 10,800 |
| D15-INV-05 | 15-oct | Transferencias | CENTRAL→AVERIAS: 10 cajas P06 dañadas | Salen de CENTRAL por FEFO (lote GAL-A primero) |
| D16-COM-10 | 16-oct | Devoluciones a proveedor | Devolución de las 10 cajas desde AVERIAS contra la factura de V01, NC del proveedor B0400000501 | NC por 4,130 (3,500 + ITBIS 630); inventario baja 3,500 al costo; CxP de V01 baja 4,130; reverso de 630 de ITBIS adelantado; aparece en el 606 con el NCF modificado |
| D18-INV-03 | 18-oct | Conteo físico | Conteo **cíclico ciego** en SANTIAGO de P02, P07, P10. Contado: P02 20, P07 58, P10 16 | La hoja no muestra lo esperado; al aplicar: faltante 2×410 = **820** a 5.1.02.001, sobrante 1×2,100 = **2,100** a 4.2.02.001 |
| D18-INV-04 | 18-oct | Ajustes de inventario | TIENDA, P05 stock real 26 (sistema 27), motivo avería | Faltante **480 al costo** (no al precio de venta) a 5.1.02.001 |
| D18-AF-03 | 18-oct | CxP → Registrar factura | V09 computadoras 6×30,000 + ITBIS, activo fijo cuenta 1.2.01.004, vida 36 meses | Activo creado; por convención de medio mes deprecia desde noviembre |
| D20-INV-06 | 20-oct | Costeo → Salida | Consumo de 15 resmas SUM01 de CENTRAL | Dr **5.2.02.004** / Cr 1.1.03.002 4,200 (gasto, no costo de ventas) |

---

## 6. Calendario del mes — ventas, devoluciones y cobros

Todas las ventas se registran por **Facturación** o **Punto de venta**; ambas usan
`POST /api/sales/checkout`, que hace pedido + NCF + asiento + costo + CxC en una transacción.

| Caso | Fecha | Documento | Datos | Resultado esperado |
|---|---|---|---|---|
| D07-VTA-01 | 7-oct | S1 B01 crédito, CENTRAL, vendedor1 | C01: P01 40, P02 60 con descuento 2,160, P07 50 | Total **141,827.20**; Dr 1.1.02.001 / Cr 4.1.01.001 y 2.1.02.001; costo a 5.1.01.001; **partida de CxC abierta** con vencimiento a 30 días |
| D07-VTA-02 | 7-oct | S2 B02 contado, TIENDA, cajera | C05: P02 5, P05 3, P01 2 | Dr Caja 1.1.01.001; stock TIENDA baja **una sola vez** |
| D08-VTA-03 | 8-oct | Cotización → S3 B01 crédito | Cotización aceptada a C03: P08 2×26,900, P10 5×3,250 con 10%; se factura desde la cotización y se agrega S01 servicio 2×1,500 | La cotización pasa a `converted` con el ID de la factura; el servicio no mueve inventario |
| D09-VTA-04 | 9-oct | S4 **B15** crédito gubernamental | C04: P05 50, P03 60 (16%), P06 40 (FIFO) | ITBIS 13,410; total 90,310 |
| D09-VTA-05 | 9-oct | S5 B02 contado empleada | C06: licuadora 3,250 con descuento 325 (10%) | Aceptado (dentro de la política) |
| D09-VTA-06 | 9-oct | Venta contado | Licuadora con descuento 650 (20%) sin autorización | **Rechazado**: requiere aprobación |
| D10-VTA-07 | 10-oct | S6 B01 crédito TIENDA, vendedor2 | C02: P01 10, P02 10, P07 10 | Dentro del límite de 60,000 |
| D11-VTA-08 | 11-oct | Venta crédito | C07: 3 televisores (122,130) con límite 80,000 | **Rechazado** por límite de crédito; **el NCF no se consume** |
| D11-VTA-09 | 11-oct | S7 B01 crédito | C07: 1 televisor (40,710) | Aceptado |
| D12-VTA-10 | 12-oct | S8 B02 **tarjeta** | C05: P04 5, P06 6 | Dr **1.1.01.004 Tarjetas por liquidar** |
| D12-DEV-01 | 12-oct | R1 NC **B04** de S1 con reingreso | Devuelve 5 refrescos P07 | NC 3,540; **reduce la partida de CxC de S1** (Cr 1.1.02.001, no caja); el producto vuelve a CENTRAL **al costo con que salió** (Dr 1.1.03.001 / Cr 5.1.01.001) |
| D12-DEV-02 | 12-oct | NC sobre S1 | Intentar acreditar 46 refrescos (quedan 45) | **Rechazado**: sobre-crédito |
| D13-VTA-11 | 13-oct | S9 B01 crédito, SANTIAGO | C01: P08 3, P09 2 con descuento 1,380, P02 40 | Sale del stock de SANTIAGO al costo de SANTIAGO |
| D13-DEV-03 | 13-oct | R2 NC B04 de S3 sin reingreso | Rebaja por empaque golpeado 2,000 + ITBIS | No mueve inventario; reduce la partida de C03 |
| D14-VTA-12 | 14-oct | S10 B01 y **anulación** | 20 refrescos facturados al cliente equivocado; anular (`POST /api/fiscal/documents/:id/cancel`) y reemitir S10B a C03 | Se revierte ingreso **y costo**, el inventario vuelve, la partida de CxC queda `cancelled`; el NCF anulado aparece en el **608** |
| D15-CXC-01 | 15-oct | Cobro por banco | C01 abona 50,000 a S1 en BRV | Dr 1.1.01.003 / Cr 1.1.02.001; movimiento en BRV; partida `partial` |
| D15-TES-02 | 15-oct | Liquidación de tarjeta | Depósito en POP del total de S8 menos 3% de comisión | Dr banco / Cr 1.1.01.004; comisión Dr 5.3.01.002; 1.1.01.004 queda en 0 |
| D15-TES-03 | 8, 10, 23-oct | Depósitos de caja | Depositar en BRV el contado de S2, S5 y S13 | Caja general vuelve a su fondo |
| D10-TES-04 | 10-oct | Avance a empleado | 3,000 a Félix Reyes desde BRV (1.1.05.001) | Se descuenta 1,500 en la nómina |
| D16-VTA-13 | 16-oct | S11 B01 crédito, vendedor1 | C01: P01 60, P05 40, P03 50 | — |
| D17-CXC-02 | 17-oct | Cobro total | C03 paga el saldo de S3 (neto de R2) | Partida `paid` |
| D20-VTA-14 | 20-oct | S12 B01 crédito, vendedor1 | C03: P09 3, P08 2 | vendedor1 supera la meta de 400,000 |
| D20-CXC-03 | 20-oct | Cobro con retenciones | C04 paga S4 reteniendo ITBIS 30% (4,023) e ISR 5% (3,845) | Banco 82,442; Dr 1.1.04.003 4,023; Dr 1.1.04.002 3,845; partida `paid` |
| D22-VTA-15 | 22-oct | S13 B02 contado con **ofertas** | C05: P07 12, P03 10, P01 5, P06 4 | Descuento automático 360 (café 10%) + 1,040 (2x1 galletas) = **1,400** |
| D22-CXC-04 | 22-oct | Anticipo de cliente | C02 deposita 20,000 sin factura | Cr **2.1.04.001 Anticipos de clientes** |
| D25-VTA-16 | 25-oct | D1 **Nota de débito B03** a crédito | Flete no facturado de S6: 800 + ITBIS | Abre partida de CxC propia |
| D26-CXC-05 | 26-oct | Aplicar anticipo | Aplicar el anticipo de 20,000 a la partida de S6 | Dr 2.1.04.001 / Cr 1.1.02.001 |
| D27-VTA-17 | 27-oct | S14 B15 crédito, vendedor2 | C04: P01 50, P06 30 | — |
| D29-CXC-06 | 29-oct | Cobro a varias facturas | C01 paga el resto de S1 y 100,000 de S9 en un solo recibo | Dos aplicaciones, un depósito |
| D30-CXC-07 | 30-oct | Cobro total | C07 paga S7 en POP | — |

---

## 7. Gastos, cuentas por pagar y tesorería

| Caso | Fecha | Acción | Resultado esperado |
|---|---|---|---|
| D10-CXP-06 | 10-oct | Pagar alquiler 54,000 desde BRV | Partida de V04 `paid` |
| D15-CXP-07 | 15-oct | Abono de 400,000 a V01 desde POP | Partida `partial` |
| D20-CXP-08 | 20-oct | Pagar V02 (988,840) y flete V03 (10,800) desde POP | — |
| D20-GAS-01 | 20-oct | Gastos de caja chica 1,200 (asiento manual 5.2.02.004 / 1.1.01.002) | — |
| D25-GAS-02 | 25-oct | Electricidad V05 18,500 + ITBIS, gasto 5.2.02.002 | — |
| D25-GAS-03 | 25-oct | Honorarios V06 45,000 + ITBIS, servicios con retención | ITBIS retenido 30% = 2,430 |
| D28-CXP-09 | 28-oct | Pagar electricidad desde POP | Queda como **cheque en tránsito** en la conciliación |
| D29-CXP-10 | 29-oct | Pagar saldo de V01 desde BRV | Queda como **pago en tránsito** en la conciliación |
| D31-TES-05 | 31-oct | Cargos bancarios 850 en BRV (5.3.01.002) | — |
| D00-TES-06 | cualquier día | Intentar un movimiento de tesorería contra 2.1.01.001 (Proveedores) | **Rechazado**: los pagos a proveedores se hacen desde CxP para liquidar la partida |

---

## 8. Comisiones y nómina de octubre

| Caso | Fecha | Acción | Resultado esperado |
|---|---|---|---|
| D30-COM-01 | 30-oct | Comisiones → Cerrar período de vendedor1 y vendedor2 | Calculadas sobre **facturas y notas de débito menos notas de crédito** del vendedor, con margen real |
| D30-COM-02 | 30-oct | vendedor1 intenta aprobar su propia comisión | **Rechazado** |
| D30-COM-03 | 30-oct | Gerente aprueba ambas | Estado `approved` |
| D30-NOM-01 | 30-oct | `POST /api/modules/payroll/runs {year:2026, month:10}` | Corrida en borrador |
| D30-NOM-02 | 30-oct | `PUT …/runs/:id/inputs`: horas extra, incentivos, bonificación, préstamo (sección 4) | Entradas guardadas |
| D30-NOM-03 | 30-oct | `POST …/import-commissions` | Comisiones aprobadas como concepto COMISION |
| D30-NOM-04 | 30-oct | `POST …/calculate` y revisar volantes | Coinciden con la tabla 8.2 |
| D30-NOM-05 | 30-oct | `POST …/post {date:"2026-10-30"}` | Un asiento por la corrida (tabla 8.3); comisiones pasan a `paid` |
| D30-NOM-06 | 30-oct | `POST …/pay {bankAccountId: BRV}` | Dr 2.1.03.001 / Cr banco por el neto |

### 8.1 Comisiones esperadas

| Vendedor | Ventas netas del mes | Comisión 3% | Meta 400,000 | Bono 10% | Total |
|---|---|---|---|---|---|
| José Martínez (vendedor1) | 527,340.00 | 15,820.20 | Sí | 1,582.02 | **17,402.22** |
| María Santos (vendedor2) | 375,145.00 | 11,254.35 | No | — | **11,254.35** |

Ventas netas de vendedor1 = S1 129,040 − R1 3,000 + S4 76,900 + S7 34,500 + S11 132,600 + S12 157,300.
Ventas netas de vendedor2 = S3 71,425 − R2 2,000 + S6 27,700 + D1 800 + S9 177,120 + S10B 12,000 + S14 88,100 (S10 anulada no cuenta).

### 8.2 Volantes esperadas (RD$)

| Empleado | Depto. | Salario | Variable | Bruto | AFP 2.87% | SFS 3.04% | ISR | Neto | Patronal AFP+SFS+SRL | INFOTEP |
|---|---|---|---|---|---|---|---|---|---|---|
| E01 Carlos Méndez | Gerencia | 180,000.00 | — | 180,000.00 | 5,166.00 | 5,472.00 | 30,923.40 | 138,438.60 | 26,672.69 | 1,800.00 |
| E02 Laura Peña | Adm. y Finanzas | 85,000.00 | — | 85,000.00 | 2,439.50 | 2,584.00 | 8,577.03 | 71,399.47 | 13,166.50 | 850.00 |
| E03 Pedro Gil | Adm. y Finanzas | 38,000.00 | — | 38,000.00 | 1,090.60 | 1,155.20 | 160.38 | 35,593.82 | 5,886.20 | 380.00 |
| E04 Ana Rosario | Ventas | 70,000.00 | Incentivo 7,000 | 77,000.00 | 2,209.90 | 2,340.80 | 6,695.23 | 65,754.07 | 11,927.30 | 770.00 |
| E05 José Martínez | Ventas | 25,000.00 | Comisión 17,402.22 | 42,402.22 | 1,216.94 | 1,289.03 | 781.69 | 39,114.56 | 6,568.11 | 424.02 |
| E06 María Santos | Ventas | 25,000.00 | Comisión 11,254.35 | 36,254.35 | 1,040.50 | 1,102.13 | 0.00 | 34,111.72 | 5,615.80 | 362.54 |
| E07 Luis Castillo | Compras | 45,000.00 | — | 45,000.00 | 1,291.50 | 1,368.00 | 1,148.33 | 41,192.17 | 6,970.50 | 450.00 |
| E08 Ramón Díaz | Almacén | 40,000.00 | HE35 10 h | 42,832.56 | 1,229.29 | 1,302.11 | 842.42 | 39,458.74 | 6,634.76 | 428.33 |
| E09 Félix Reyes | Almacén | 22,000.00 | HE35 12 h, HE100 4 h, préstamo 1,500 | 24,792.70 | 711.55 | 753.70 | 0.00 | 21,827.45 | 3,840.39 | 247.93 |
| E10 Rosa Jiménez | Caja | 21,000.00 | Incentivo 2,000 | 23,000.00 | 660.10 | 699.20 | 0.00 | 21,640.70 | 3,562.70 | 230.00 |
| E11 Miguel Ortiz | Almacén | 23,000.00 | Incentivo 3,500 | 26,500.00 | 760.55 | 805.60 | 0.00 | 24,933.85 | 4,104.85 | 265.00 |
| E12 Carmen Vargas | RRHH | 55,000.00 | Bonificación 5,000 | 60,000.00 | 1,578.50 | 1,672.00 | 3,545.80 | 53,203.70 | 8,519.50 | 550.00 |
| E13 Juan Paredes | Almacén | 20,000.00 | Ingresó el 15: 13.5 días | 11,330.26 | 325.18 | 344.44 | 0.00 | 10,660.64 | 1,755.06 | 113.30 |
| **Total** | | | | **692,112.09** | **19,720.11** | **20,888.21** | **52,674.28** | **597,329.49** | **105,224.36** | **6,871.12** |

Fórmulas: salario diario = mensual / 23.83; hora = diario / 8; HE35 = horas × hora × 1.35;
HE100 = horas × hora × 2; días trabajados cuentan el sábado como medio día. AFP/SFS sobre la
base cotizable (sin bonificación) con topes; ISR sobre la base gravada menos AFP y SFS del
empleado, con la escala mensual 2026. INFOTEP 1% de la base que lo incluye. Tolerancia
aceptada: ±0.05 por redondeo.

### 8.3 Asiento de la nómina esperado

| Cuenta | Débito | Crédito |
|---|---|---|
| 5.2.01.001 Sueldos (incluye el prorrateo de E13) | Σ salario | |
| 5.2.01.004 Horas extras | Σ HE | |
| 5.2.01.005 Comisiones | 28,656.57 | |
| 5.2.01.006 Bonificaciones e incentivos | 17,500.00 | |
| 5.2.01.002 Aportes patronales TSS (AFP + SFS + SRL) | 105,224.36 | |
| 5.2.01.003 Aportes INFOTEP | 6,871.12 | |
| 2.1.03.001 Sueldos por pagar (neto) | | 597,329.49 |
| 2.1.03.002 TSS por pagar (empleado + empleador + SRL) | | 145,832.68 |
| 2.1.03.003 INFOTEP por pagar | | 6,871.12 |
| 2.1.03.004 ISR retenido a asalariados (IR-3) | | 52,674.28 |
| 1.1.05.001 CxC empleados (préstamo) | | 1,500.00 |

---

## 9. Cierre contable y fiscal del mes

| Caso | Fecha | Acción | Resultado esperado |
|---|---|---|---|
| D31-CIE-01 | 31-oct | Provisión de regalía pascual: Σ salarios / 12 (Dr 5.2.01.007 / Cr 2.1.03.005) | 58,916.67 |
| D31-AF-04 | 31-oct | `POST /api/modules/fixed-assets/depreciate {year:2026, period:10, convention:"mid_month"}` | Camión 33,333.33 + mobiliario 2,500.00 = **35,833.33**; computadoras no (adquiridas el 18) |
| D31-TES-07 | 31-oct | Conciliación BRV y POP: marcar como conciliado todo menos el pago a V01 (BRV) y el de electricidad (POP) | Diferencia **0**; pagos en tránsito listados; la conciliación se completa |
| D31-FIS-01 | 31-oct | Generar 606, 607, 608, IT-1, IR-17 (`/api/fiscal/reports/…?year=2026&month=10`) e IR-3 (`/api/modules/payroll/ir3`) | 606 incluye la NC del proveedor con NCF modificado y tipos 02/03/09/10; 607 incluye NC B04 y ND B03; 608 lista la factura anulada; IR-17 = 7,200 (6,000 alquiler + 1,200 flete) |
| D31-CIE-02 | 31-oct | `GET /api/accounting/month-end-checklist?year=2026&month=10` | Todos los controles de la sección 10.1 en OK |
| D31-CIE-03 | 31-oct | Balanza de comprobación, estado de resultados, balance general, flujo de efectivo | Balanza cuadra; activos = pasivos + patrimonio + resultado; efectivo final = saldos 1.1.01.x |
| D31-CIE-04 | 31-oct | `POST /api/accounting/periods/2026/10/close` | Octubre cerrado |
| D31-CIE-05 | 31-oct | Intentar un asiento manual con fecha 31-oct | **Rechazado**: período cerrado |
| D35-FIS-01 | 3-nov | Pagar TSS y INFOTEP de octubre (`POST /api/modules/payroll/statutory-payments`) | 2.1.03.002 y 2.1.03.003 en 0 |
| D35-FIS-02 | 10-nov | Pagar IR-3, IR-17 e ITBIS retenido | 2.1.03.004, 2.1.02.003 y 2.1.02.002 en 0 |
| D35-FIS-03 | 20-nov | IT-1: compensar el ITBIS retenido por clientes y el ITBIS adelantado contra el ITBIS facturado, **hasta lo facturado**; pagar solo si queda saldo | 2.1.02.001 en 0. En octubre el ITBIS de compras (incluye 396,000 del camión) supera lo facturado: no hay pago y el excedente queda en 1.1.04.001 como **saldo a favor** para noviembre |

---

## 10. Matriz de conciliación

### 10.1 Controles automáticos de cierre

`GET /api/accounting/month-end-checklist` calcula cada control con dos fuentes independientes:

> **Ejecución automática del 15-sep-2026:** los 24 controles de octubre cuadraron con diferencia 0.00 (balanza 22,740,503.32 = 22,740,503.32; CxC 551,151.60; CxP 296,110.00; inventario 986,490.00 + suministros 23,800.00; bancos 1,270,653.06; nómina bruta 692,112.09; TSS 145,832.68; IR-3 52,674.28; IR-17 7,200.00), y los pasivos 2.1.03.001–.004 y 2.1.02.001–.003 quedaron en cero tras los pagos de noviembre. El mes completo corrió en 263 segundos.

| Control | Fuente A | Fuente B |
|---|---|---|
| Balanza de comprobación | Σ débitos | Σ créditos |
| CxC | Cuenta 1.1.02.001 | Σ partidas abiertas |
| CxP | Cuenta 2.1.01.001 | Σ partidas abiertas |
| Recepciones por facturar | Cuenta 2.1.01.002 | Σ (recibido − facturado) × costo |
| Anticipos de clientes | Cuenta 2.1.04.001 | Σ anticipos sin aplicar |
| Inventario de mercancías | Cuenta 1.1.03.001 | Σ valuación |
| Inventario de suministros | Cuenta 1.1.03.002 | Σ valuación |
| Unidades por almacén | `warehouse_stock` | Valuación por almacén |
| Unidades de catálogo | `products.stock_quantity` | Σ por almacén |
| Capas FIFO | Σ capas | Valuación de productos FIFO |
| Bancos | Cuenta de cada banco | Σ movimientos de tesorería |
| Nómina: gasto | Gasto de personal de la corrida | Σ ingresos de volantes |
| Nómina: TSS, INFOTEP, IR-3 | Créditos del asiento | Σ volantes |
| IT-1: ITBIS facturado | Movimiento de 2.1.02.001 | 607 neto de NC |
| IT-1: ITBIS en compras | Movimiento de 1.1.04.001 | 606 neto de NC de proveedores |
| IR-17 | Créditos a 2.1.02.003 de compras | Total del IR-17 |
| 606 / 607 | Registros del formato | Comprobantes vigentes del mes |
| Documentos sin asiento | — | 0 |
| Ventas a crédito sin partida | — | 0 |
| Movimientos bancarios sin asiento | — | 0 |
| Depreciación | Cuenta 1.2.01.003 | Registro de activos |

### 10.2 Guía de asientos por evento

| Evento | Débito | Crédito |
|---|---|---|
| Recepción contra OC | 1.1.03.001 (o .002) | 2.1.01.002 |
| Factura de proveedor casada | 2.1.01.002; 5.1.01.002 si factura más; 1.1.04.001 | 2.1.01.001 (y retenciones 2.1.02.002/.003) |
| Factura de gasto o servicio | Cuenta de gasto elegida; 1.1.04.001 | 2.1.01.001 |
| NC de proveedor (devolución) | 2.1.01.001 | 1.1.03.00x; 1.1.04.001; 5.1.01.002 por diferencia |
| Pago a proveedor por banco | 2.1.01.001 | 1.1.01.003 |
| Venta contado / tarjeta / crédito | 1.1.01.001 / 1.1.01.004 / 1.1.02.001 | 4.1.01.001; 2.1.02.001 |
| Costo de la venta | 5.1.01.001 | 1.1.03.001 |
| NC de venta con reingreso | 4.1.01.001; 2.1.02.001; 1.1.03.001 | 1.1.02.001 (o caja); 5.1.01.001 |
| Cobro por banco con retenciones | 1.1.01.003; 1.1.04.003; 1.1.04.002 | 1.1.02.001 |
| Anticipo / aplicación | 1.1.01.003 / 2.1.04.001 | 2.1.04.001 / 1.1.02.001 |
| Faltante / sobrante de inventario | 5.1.02.001 / 1.1.03.001 | 1.1.03.001 / 4.2.02.001 |
| Consumo de suministros | 5.2.02.004 | 1.1.03.002 |
| Depreciación | 5.2.03.001 | 1.2.01.003 |
| Baja o venta de activo | 1.2.01.003; banco; 5.3.01.003 si pérdida | Cuenta del activo; 4.2.03.001 si ganancia |

---

## 11. Lo que se agregó a lo pedido

Además del recorrido solicitado, el plan cubre lo siguiente porque sin ello el mes no cierra
o la empresa incumple con la DGII/TSS:

1. **Requisición → RFQ → OC** con aprobación y **segregación de funciones** (nadie aprueba lo que pidió).
2. **Recepciones parciales** con control de sobre-recepción y **cruce de tres vías** (OC, recepción, factura).
3. **Variación de precio** entre lo pactado y lo facturado.
4. **Retenciones a proveedores** (persona física, servicios) y su **IR-17**.
5. **Suministros** separados de mercancía (se consumen a gasto, no a costo).
6. **Lotes, vencimientos y FEFO**; **conteo cíclico ciego**.
7. **Cotización → factura** sin redigitar.
8. **Límite de crédito** y **política de descuentos** con rechazo.
9. **Ventas con tarjeta** y su liquidación con comisión del adquirente.
10. **Comprobantes B15** (gobierno) con **retenciones sufridas**, **B03 nota de débito**, **B04** con y sin reingreso.
11. **Anulación de NCF** y el **608**.
12. **Anticipos de clientes**.
13. **Cobros a varias facturas** y **conciliación bancaria** con partidas en tránsito.
14. **Avances a empleados** descontados en nómina.
15. **Ingreso a mitad de mes** con prorrateo.
16. **Provisión de regalía pascual**.
17. **Activos fijos por clase** (vehículos, cómputo, mobiliario), **convención de medio mes** y **baja** de activos.
18. **Pagos de TSS, INFOTEP, IR-3, IR-17 e IT-1** en noviembre, con pasivos en cero.
19. **Cierre de período** y bloqueo de asientos en mes cerrado.
20. **Lista de verificación de cierre** automática.

### Pruebas adicionales recomendadas (fuera del script)

| Caso | Qué probar |
|---|---|
| EXT-SEG-01 | Revocar una vista a un rol y confirmar 403 en la siguiente petición. |
| EXT-SEG-02 | Activar 2FA en el contador y probar el inicio de sesión con código. |
| EXT-SEG-03 | Aislamiento: un usuario de otra empresa no ve documentos de esta. |
| EXT-AUD-01 | Bitácora: la factura S1, la anulación S10 y el cierre aparecen con usuario y fecha. |
| EXT-WMS-01 | Activar WMS en CENTRAL, recibir con ubicación y verificar el reporte de diferencias. |
| EXT-TER-01 | Calcular prestaciones de un desahucio (E03) y aprobarlo: sale de la próxima nómina. |
| EXT-FX-01 | Factura en USD a un cliente extranjero y revaluación cambiaria al cierre. |
| EXT-CON-01 | Consolidación con una segunda empresa del grupo. |
| EXT-ECF-01 | e-CF E31/E32/E34 contra el DGII simulado. |

---

## 12. Correcciones hechas al sistema para que el mes cierre

La exploración inicial mostró que el ciclo no podía cuadrar. Se corrigió:

| Área | Antes | Ahora |
|---|---|---|
| Fechas DGII | 606/607/608/IT-1 por fecha de captura (`emitted_at`) | Por **fecha del comprobante** (`document_date`); vigencia de NCF contra esa fecha |
| Períodos | Solo el año actual | Ejercicios a demanda y `openFrom` para empresas que inician a mitad de año |
| Stock | 4 tablas sin sincronía | Todo movimiento valorado mantiene valuación, `warehouse_stock`, catálogo y kárdex en la misma transacción |
| Transferencias y ajustes | Solo stock operativo, sin asiento, ajuste a precio de venta | Valorados al costo, con asiento de faltante/sobrante; ajuste por almacén y fecha |
| OC y recepción | Sin número, doble conteo en recepciones parciales, sin contabilidad | Numeradas, aprobación, recepciones por diferencia con "Recepciones por facturar" y cruce de tres vías |
| Devoluciones a proveedor | Sin asiento ni efecto en CxP | NC del proveedor: inventario, CxP, ITBIS y 606 |
| Ventas | POS e Facturación descontaban stock dos veces; POS sin NCF ni asiento | `POST /api/sales/checkout`: una transacción con NCF, asiento, costo y CxC |
| CxC | La factura a crédito no abría partida; la NC acreditaba caja | Partida automática, NC liquida la partida, anulación revierte costo e inventario; anticipos y retenciones sufridas |
| Cobros y pagos | Siempre por Caja general | Por cuenta bancaria, visibles en la conciliación; tesorería no puede tocar cuentas de control |
| Nómina | Solo salario base | Conceptos (horas extra, comisión, incentivo, bonificación, regalía, préstamos), prorrateo, SRL, IR-3 separado, pagos por tesorería, RRHH como maestro |
| Comisiones | Sobre pedidos del POS con margen supuesto de 30% | Sobre comprobantes fiscales, margen real, roles y vigencia, aprobación por un tercero |
| Activos fijos | Una sola cuenta, sin baja | Cuenta por clase, capitalización, medio mes, venta/baja con ganancia o pérdida |
| Flujo de efectivo | Cobros como inversión y ventas duplicadas | Clasificación por cuenta y sin duplicar asientos con dos líneas de caja |

### Limitaciones conocidas (pendientes)

| Tema | Situación | Cómo se prueba mientras tanto |
|---|---|---|
| Pedidos de WhatsApp/web | Siguen descontando solo el stock del catálogo | Facturarlos desde Facturación |
| Cierre de caja (arqueo) | No contabiliza sobrantes/faltantes de caja | Asiento manual a 4.2.02.002 / 5.3.01.004 |
| Propina legal | Se calcula en pantalla pero el checkout no la contabiliza | No usar en distribuidora |
| Nómina quincenal | Una corrida por mes | Correr la mensual |
| Prestaciones laborales | El cálculo existe; no genera asiento | Asiento manual al aprobar |
| Costos de importación | Reparten costo en la OC pero no revalúan inventario | Registrar el flete como gasto 5.2.02.005 |
| Manufactura | No pasa por el libro valorado | Fuera del alcance de este mes |
| Archivos SUIR+ y TXT exactos de DGII | Totales y formato de trabajo | Validar el layout vigente antes de enviar |
| Cierre anual | Sin arrastre a resultados acumulados | Fuera del alcance de octubre |

---

## 13. Hoja de incidencias y criterios de aceptación

**Registro de incidencia:** ID · caso · fecha · usuario · pantalla/endpoint · datos de entrada ·
resultado obtenido · resultado esperado · captura · severidad (bloqueante / mayor / menor) · estado.

**El mes se acepta cuando:**

1. Todos los casos de las secciones 5 a 9 están en ✅ o tienen incidencia menor aceptada.
2. La lista de verificación de cierre de octubre devuelve `ok: true`.
3. Los pasivos 2.1.03.001–.004 y 2.1.02.001–.003 quedan en cero tras los pagos de noviembre.
4. Las volantes coinciden con la tabla 8.2 (±0.05) y las comisiones con la 8.1.
5. Los formatos 606, 607, 608, IT-1, IR-17 e IR-3 están generados y archivados.
6. Existe un respaldo de la base antes y después del cierre.
