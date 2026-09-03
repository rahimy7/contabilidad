# Auditoría del ERP y checklist de prueba de un mes operativo

> **Alcance**: sistema `WhatsappOrderManager` — ERP multiempresa (RD) con Finanzas,
> Fiscal (DGII / NCF / e-CF), Ventas (POS, Facturación, Devoluciones), Compras,
> Inventario/WMS, RRHH/Nómina/TSS, Tesorería, Activos Fijos, Consolidación,
> Presupuesto y canal WhatsApp con IA.
>
> **Método**: revisión estática del código (`server/`, `shared/schema/`, `client/src/pages/`),
> del catálogo interno de módulos ([client/src/pages/help/modules-catalog.ts](client/src/pages/help/modules-catalog.ts))
> y contraste contra el flujo ERP estándar. Se marca cada capacidad como
> **Disponible / Parcial / Ausente** y se propone un guion de prueba de 30 días
> que ejercite todos los caminos que sí existen.

---

## 1. Resumen ejecutivo del estado del sistema

### 1.1 Capacidades verificadas en el código

| Módulo | Estado | Ruta UI | Servicio / Ruta API |
|---|---|---|---|
| Plan de cuentas + asientos | Disponible | [/accounting/chart-of-accounts](client/src/pages/accounting/chart-of-accounts.tsx) | [server/accounting/posting-engine.ts](server/accounting/posting-engine.ts) |
| Estados financieros | Disponible | [/accounting/financial-statements](client/src/pages/accounting/financial-statements.tsx) | [server/accounting/financial-statements.ts](server/accounting/financial-statements.ts) |
| Balance de comprobación | Disponible | [/accounting/trial-balance](client/src/pages/accounting/trial-balance.tsx) | idem |
| Cierre de período contable | Disponible | — | [server/accounting/period-close.ts](server/accounting/period-close.ts) |
| Cuentas por cobrar (AR) | Disponible | [/receivables](client/src/pages/receivables.tsx) | [server/subledgers/receivables.ts](server/subledgers/receivables.ts) |
| Cuentas por pagar (AP) | Disponible | [/payables](client/src/pages/payables.tsx) | [server/subledgers/payables.ts](server/subledgers/payables.ts) |
| Facturación fiscal + NCF | Disponible | [/invoicing](client/src/pages/invoicing.tsx) | [server/fiscal/document-service.ts](server/fiscal/document-service.ts) |
| e-CF (firma, transmisión, contingencia) | Disponible* | [/fiscal/ecf](client/src/pages/fiscal) | [server/fiscal/ecf/](server/fiscal/ecf) |
| Reportes DGII 606 / 607 / 608 / 609 | Disponible | [/fiscal/reports](client/src/pages/fiscal) | [server/fiscal/dgii-reports.ts](server/fiscal/dgii-reports.ts) |
| Devoluciones de ventas (nota de crédito) | Disponible | [/sales-returns](client/src/pages/sales-returns.tsx) | vía document-service |
| Devoluciones a proveedor | Disponible ⚠ | [/purchase-returns](client/src/pages/purchase-returns.tsx) | [server/services/purchase-returns.ts](server/services/purchase-returns.ts) |
| Cotizaciones a cliente | Disponible ⚠ | [/quotes](client/src/pages/quotes.tsx) | [server/services/sales-quotes.ts](server/services/sales-quotes.ts) |
| Requisiciones internas | Disponible ⚠ | — | [server/services/requisitions.ts](server/services/requisitions.ts) |
| RFQ a proveedores | Disponible ⚠ | — | [server/services/supplier-rfqs.ts](server/services/supplier-rfqs.ts) |
| Órdenes de compra + recepción | Disponible | [/purchase-management](client/src/pages/purchase-management.tsx) | [server/routes/purchase-management-routes.ts](server/routes/purchase-management-routes.ts) |
| Landed costs (costos de importación) | Disponible | [/landed-costs](client/src/pages/landed-costs.tsx) | [server/services/landed-costs.ts](server/services/landed-costs.ts) |
| Costeo inventario (Promedio / FIFO) | Disponible | [/inventory-costing](client/src/pages/inventory-costing.tsx) | [server/inventory/costing.ts](server/inventory/costing.ts) |
| Ajustes de inventario | Disponible | [/inventory-adjustment](client/src/pages/inventory-adjustment.tsx) | [server/routes/inventory-adjustment-routes.ts](server/routes/inventory-adjustment-routes.ts) |
| Conteo físico (ciego, cíclico, general) | Disponible | [/inventory-count](client/src/pages/inventory-count.tsx) | [server/inventory/counts.ts](server/inventory/counts.ts) |
| Ubicaciones WMS | Disponible | [/warehouse-locations](client/src/pages/warehouse-locations.tsx) | [server/inventory/wms.ts](server/inventory/wms.ts) |
| Transferencias entre almacenes | Disponible | [/warehouse-transfers](client/src/pages/warehouse-transfers.tsx) | [server/routes/warehouse-routes.ts](server/routes/warehouse-routes.ts) |
| Lotes / vencimientos / FEFO | Disponible | [/inventory-traceability](client/src/pages/inventory-traceability.tsx) | idem |
| Picking (lista de despacho) | Disponible ⚠ | [/picking](client/src/pages/picking.tsx) | [server/routes/picking-routes.ts](server/routes/picking-routes.ts) |
| Punto de venta (POS) | Disponible | [/pos-screen](client/src/pages/pos-screen.tsx) | [server/routes/](server/routes/) |
| Caja: apertura, cierre, retiros | Disponible | [/cash-register](client/src/pages/cash-register.tsx) | [server/routes/cash-register-routes.ts](server/routes/cash-register-routes.ts) |
| Nómina RD (AFP, SFS, ISR, INFOTEP) | Disponible | [/payroll](client/src/pages/payroll.tsx) | [server/modules/payroll.ts](server/modules/payroll.ts) |
| Terminación / prestaciones / cesantía | Disponible ⚠ | — | [server/services/hr-termination.ts](server/services/hr-termination.ts) |
| Asistencia + vacaciones/permisos | Disponible ⚠ | — | [server/services/hr-attendance-leave.ts](server/services/hr-attendance-leave.ts) |
| Comisiones por vendedor | Disponible ⚠ | [/commissions](client/src/pages/commissions.tsx) | [server/services/commissions.ts](server/services/commissions.ts) |
| Empleados (expediente básico) | Parcial | [/hr-employees](client/src/pages/hr-employees.tsx) | [server/services/hr-employees.ts](server/services/hr-employees.ts) |
| Tesorería + conciliación bancaria | Disponible | [/treasury](client/src/pages/treasury.tsx), [/bank-reconciliation](client/src/pages/bank-reconciliation.tsx) | [server/treasury/banks.ts](server/treasury/banks.ts) |
| Tasa de cambio + revaluación FX | Disponible | [/exchange-rates](client/src/pages/exchange-rates.tsx), [/fx-revaluation](client/src/pages/fx-revaluation.tsx) | [server/services/fx-revaluation.ts](server/services/fx-revaluation.ts) |
| Activos fijos + depreciación | Disponible | [/fixed-assets](client/src/pages/fixed-assets.tsx) | [server/modules/fixed-assets.ts](server/modules/fixed-assets.ts) |
| Presupuesto y variación | Disponible | [/budget](client/src/pages/budget.tsx) | [server/modules/budget.ts](server/modules/budget.ts) |
| Consolidación multi-empresa | Disponible | [/consolidation](client/src/pages/consolidation.tsx) | [server/consolidation/consolidate.ts](server/consolidation/consolidate.ts) |
| Aprobaciones (motor) | Disponible | [/approvals](client/src/pages/approvals.tsx) | [server/services/approvals.ts](server/services/approvals.ts) |
| Puntos de lealtad | Disponible | — | [server/services/loyalty-points-service.ts](server/services/loyalty-points-service.ts) |
| Roles y permisos | Disponible | [/team](client/src/pages/team.tsx) | [server/routes/roles-management-routes.ts](server/routes/roles-management-routes.ts) |
| Doble factor (2FA) | Disponible | [/security-2fa](client/src/pages/security-2fa.tsx) | [server/services/two-factor.ts](server/services/two-factor.ts) |
| Bitácora de auditoría | Disponible | [/audit-log](client/src/pages/audit-log.tsx) | [server/routes/audit-log-routes.ts](server/routes/audit-log-routes.ts) |
| Alertas | Disponible | [/alerts](client/src/pages/alerts.tsx) | [server/services/alerts.ts](server/services/alerts.ts) |
| WhatsApp + IA | Disponible | [/whatsapp-settings](client/src/pages/whatsapp-settings.tsx) | [server/whatsapp-ai-integration-v2.ts](server/whatsapp-ai-integration-v2.ts) |

⚠ = existe en código pero el [catálogo interno de módulos](client/src/pages/help/modules-catalog.ts)
lo declara como *ausente* o *parcial*. Es la **primera prueba obligatoria**: verificar
que la pantalla esté enlazada al menú, que responda con datos reales, y que si
funciona, actualizar el catálogo para dejar de mentirle al usuario.

### 1.2 Brechas confirmadas (según el catálogo interno + inspección)

Estas cosas **no existen** aún y el guion mensual las va a evidenciar:

- **Cotización → Pedido → Factura sin captura doble**: el servicio existe pero no está
  claro si la pantalla `/quotes` la convierte a pedido/factura en un clic.
- **Aprobación de precios/descuentos** fuera de política: hoy no hay tope.
- **Reserva de inventario en pedido**: dos vendedores pueden prometer la misma caja.
- **Sugerencia de reposición automática** al llegar a mínimo.
- **Órdenes de trabajo con costo real** (materiales + mano de obra por orden).
- **Cierre formal de orden de servicio** con conformidad del cliente.
- **Descuento interno a empleados como precio especial** con tope y reporte propio
  (hoy sólo hay descuento manual por línea; ver §7).
- **Nota de débito (B03/E33)** con flujo propio.
- **Series por unidad** (garantía individual): sólo hay lotes.
- **Estado de flujo de efectivo formal** (método directo o indirecto).
- **Proyección de caja** (cash forecast).
- **Cuota / pipeline / conversión** por vendedor.
- **Marcaje entrada/salida biométrico** enlazado a asistencia.
- **Contratos y sus vencimientos** (empleados, proveedores, seguros).
- **Garantías por producto vendido** (tracking).
- **Tickets / quejas / reclamaciones** con SLA.
- **Restauración de respaldo probada** desde el propio sistema.

---

## 2. Recomendaciones de cosas que se mencionó "corto" y hay que probar también

El pedido inicial mencionó: alta de empleados, compras, ventas, AR/AP,
despachos parciales/completos, ajustes, devoluciones (ambos lados), nómina,
comisiones, vacaciones, TSS, cesantía, descuentos a empleados, proveedores,
contable/financiero. **Falta probar además** — y todo lo siguiente sí existe
en el código:

1. **NCF y consumo de rangos** (B01/B02/B04/B14/B15) — que no queme numeración
   si la operación falla y que respete el orden.
2. **e-CF: firma, envío, cola de reintentos, contingencia** (correr contra el
   DGII simulado incluido).
3. **Anulación de NCF/rango** y su reflejo en 608.
4. **Retenciones ITBIS/ISR** en factura de proveedor extranjero
   ([server/fiscal/foreign-payments.ts](server/fiscal/foreign-payments.ts)) y su reporte 609.
5. **Reporte 606 (compras) y 607 (ventas)** con notas de crédito en negativo.
6. **Landed costs**: prorrateo de flete/aduanas al costo del producto importado.
7. **Costeo Promedio vs FIFO** por producto y por almacén.
8. **Kardex** cuadrado contra la cuenta de control del mayor.
9. **Múltiples almacenes + ubicaciones + FIFO/FEFO en el despacho**.
10. **Transferencia entre almacenes** (sin asiento, cambia bodega, no cuenta).
11. **Conteo físico ciego → variación → aplicación** y su ajuste a *gasto por
    faltante* (no a costo de ventas).
12. **Multi-moneda**: factura, cobro y revaluación FX al cierre.
13. **Conciliación bancaria** con depósitos en tránsito y cheques pendientes.
14. **Depreciación mensual de activos fijos** y su asiento automático.
15. **Presupuesto vs real** por cuenta y por centro de costo.
16. **Consolidación** de dos compañías con eliminación intercompañía y
    conversión de moneda.
17. **Aprobaciones** (OC, precios, requisiciones, vacaciones, ajustes) — el motor
    existe: hay que probar el flujo hasta el aprobador correcto.
18. **Puntos de lealtad**: acreditación automática, canje, expiración.
19. **Alertas**: qué gatilla, a quién llega, dónde se ve.
20. **Roles y permisos**: revocar acceso en caliente y comprobar que la próxima
    petición ya no lo tiene (se verifica contra la BD, no contra el token).
21. **2FA**: activarlo y probar login con TOTP.
22. **Auditoría**: cada cambio sensible deja rastro con usuario, IP y payload.
23. **Aislamiento multi-empresa**: una consulta con `companyId` cruzado debe
    devolver *cero filas*, no error, para confirmar el aislamiento por rol de BD.
24. **WhatsApp + IA**: alta de cliente por chat, cotización armada por el asistente,
    pedido convertido a factura.
25. **Impresión POS 58mm** de ticket y de comprobante fiscal.
26. **Devolución con reingreso de mercancía al costo con que salió** (no al costo
    actual — esa es una prueba clásica que suele fallar en ERP).
27. **Bloqueo de cliente por crédito**: superar límite de crédito debe frenar la
    venta o requerir aprobación.
28. **Sobre-crédito en nota de crédito**: intentar acreditar más de lo facturado
    debe rechazarse por el servidor.
29. **Cierre de período** que impida asentar en meses cerrados.
30. **Backup y restauración** del período de prueba antes de empezar (no está en
    el sistema; hazlo tú desde el proveedor de BD).

---

## 3. Preparación del ambiente de prueba (Día 0)

Antes de empezar el guion de 30 días:

- [ ] **Respaldo lógico** de la BD del ambiente donde vas a probar (fuera del
  sistema — el catálogo declara "respaldos: ausente").
- [ ] Ambiente aislado (staging), **no producción**.
- [ ] Fecha del sistema: puedes usar fecha real y probar en un mes calendario
  cualquiera; si necesitas simular fechas pasadas, hazlo por endpoint de
  facturación pasando `document_date`, no cambiando el reloj del servidor.
- [ ] **Dos empresas** creadas ([/companies](client/src/pages/companies.tsx)) para probar consolidación y aislamiento.
- [ ] **Plan de cuentas** cargado (semilla o import).
- [ ] **Períodos contables** abiertos para el mes de prueba.
- [ ] **Secuencias NCF** cargadas (B01, B02, B04, B14 mínimo) con rango vigente.
- [ ] **Certificado e-CF** cargado (o modo simulado activo).
- [ ] **Tasas de cambio** del mes cargadas (o servicio de tasa activo).
- [ ] **Impuestos**: ITBIS 18 % y su regla de retención cargados.
- [ ] **Al menos 3 almacenes**: principal, secundario y "cuarentena/averías".
- [ ] **Al menos 4 usuarios** con roles distintos: `admin`, `cajero`,
  `almacenista`, `contador`.
- [ ] **2FA** activado en al menos un usuario.
- [ ] Cargar los datos maestros: **20 productos**, **10 clientes**, **5 proveedores**,
  **8 empleados** con sueldos distintos.
- [ ] Anotar los saldos iniciales de cada cuenta antes de empezar — sin esto no
  sabes si al final del mes cuadra.

---

## 4. Checklist mensual — simulación de 30 días

> Marca cada punto ✅ / ❌ / ⚠ y anota **incidencias** con captura + endpoint /
> nombre de la pantalla. Todo movimiento contable debe verificarse mirando el
> asiento generado (`journal_entries` / `journal_entry_lines`).

### Semana 1 — Configuración y alta operativa

**Día 1 — Configuración y RRHH**

- [ ] Crear/editar **empresa** con RNC, moneda funcional, período fiscal.
- [ ] Crear **plan de cuentas** o verificar semilla; validar que sólo las cuentas
  hoja acepten posteo (regla del `chartOfAccounts`).
- [ ] Crear **roles**: cajero, almacenista, contador, admin. Asignar vistas
  desde el catálogo.
- [ ] Crear **4 usuarios**. Activar 2FA en `admin`. Probar login con TOTP.
- [ ] **Revocar en caliente** una vista al usuario cajero: su siguiente request
  debe devolver 403 (se valida contra BD, no contra token).
- [ ] Alta de **8 empleados** con: cédula, cargo, sueldo, fecha de ingreso,
  tipo de contrato, cuenta bancaria, AFP y ARS.
- [ ] Configurar tipos de permiso por defecto (semilla `seedDefaultTimeOffTypes`).
- [ ] Verificar aislamiento multi-empresa: iniciar sesión con usuario de empresa
  B y confirmar que **no ve** clientes/productos/nada de empresa A.

**Día 2 — Compras y proveedores**

- [ ] Alta de **5 proveedores** con RNC, condición de pago, moneda.
- [ ] Registrar **1 requisición interna** desde bodega hacia compras
  (`requisitions` service). Aprobarla desde `/approvals`.
- [ ] Enviar **1 RFQ** a 3 proveedores. Elegir ganador.
- [ ] Emitir **OC #1** al proveedor local (RD$) con 5 líneas + ITBIS 18 %.
- [ ] Emitir **OC #2** al proveedor extranjero (USD) — misma orden, dos monedas.
- [ ] Emitir **OC #3** de gastos (servicio, no mercancía).

**Día 3 — Recepciones y costos de importación**

- [ ] **Recepción parcial** de OC #1 (60 % de las cantidades). Verificar que:
  - AP quede con partida abierta por el valor recibido.
  - Inventario suba sólo por lo recibido.
  - La OC queda en estado "recepción parcial".
- [ ] Recepción **con lote y vencimiento** en algunos productos.
- [ ] Ingresar la mercancía a **una ubicación específica** (WMS).
- [ ] Recibir OC #2 (USD) y aplicar **landed cost**: flete, aduanas y agente. El
  costo unitario en inventario debe subir por el prorrateo.
- [ ] Ver kardex del producto importado y confirmar el costo nuevo.

**Día 4 — Devolución a proveedor y CxP**

- [ ] **Devolución al proveedor** de 2 líneas de OC #1 (calidad deficiente).
  Verificar que:
  - Sale la mercancía del inventario al **costo con que entró**.
  - Se registra la nota de crédito esperada del proveedor.
  - AP baja por ese monto.
- [ ] Registrar **factura de servicios** (OC #3) por RD$ — sin inventario.
- [ ] Registrar **pago parcial** a proveedor de OC #1 desde tesorería. Ver AP:
  la partida queda abierta por el saldo.
- [ ] Registrar **pago total** con retención ITBIS/ISR (proveedor de servicio
  con RNC específico que retiene). Verificar 609 y su asiento.

**Día 5 — Datos maestros de ventas**

- [ ] Alta de **10 clientes** — mezcla: con RNC, con cédula, extranjero,
  crédito y contado.
- [ ] Definir **límites de crédito** distintos por cliente.
- [ ] Cargar **listas de precios** ([/price-lists](client/src/pages/price-lists.tsx))
  y **promociones**.
- [ ] Definir **reglas de comisión** por vendedor
  ([server/services/commissions.ts](server/services/commissions.ts)).

### Semana 2 — Ciclo de ventas completo

**Día 6 — Cotización y pedido**

- [ ] Emitir **cotización** al cliente A por 3 productos.
- [ ] Convertirla a **pedido**. Confirmar que copia líneas, precios y descuento.
- [ ] Emitir **pedido de web/WhatsApp** desde `/public-order` para el cliente B.
- [ ] Emitir pedido desde el **asistente de WhatsApp** (canal IA) — el asistente
  debe armar el pedido con productos válidos.

**Día 7 — Venta POS y caja**

- [ ] **Abrir caja** (`/cash-register`) con monto inicial.
- [ ] Vender 5 tickets en el **POS**: mezcla efectivo, tarjeta, mixto.
- [ ] Ticket con **cambio de moneda** (USD → RD$).
- [ ] Ticket con **cliente con RNC** para B01, y otro para consumidor final B02.
- [ ] Imprimir ticket en **impresora 58mm** (POS58).
- [ ] Registrar un **retiro de caja** justificado.
- [ ] **Cerrar caja**. Verificar arqueo, diferencia y asiento a bancos.

**Día 8 — Facturación formal**

- [ ] Emitir **factura B01** al cliente A desde `/invoicing`. El NCF se debe
  consumir **al final** (regla del ncf-service): fuerza un error a propósito
  y confirma que **no consumió** el número.
- [ ] Emitir factura con **descuento por línea** dentro de política.
- [ ] Intentar factura con **descuento fuera de política** — hoy no hay tope; documenta
  el hallazgo.
- [ ] Emitir factura **a crédito** que exceda el límite del cliente — debe
  detenerse o requerir aprobación.
- [ ] Emitir factura en **USD** al cliente extranjero (B14/B15 según aplique).

**Día 9 — Despacho y picking**

- [ ] Generar **lista de picking** ([/picking](client/src/pages/picking.tsx))
  para los pedidos del día 6 – 8.
- [ ] Ejecutar **picking FIFO / FEFO** en almacén con ubicaciones: el sistema
  debe indicar de qué estante sacar cada unidad.
- [ ] Ejecutar **despacho parcial** de un pedido con 10 productos: entregar 6.
  Verificar que el pedido quede en estado "parcialmente despachado" y que sólo
  se descuente lo despachado.
- [ ] Completar el **despacho pendiente** al día siguiente (backorder manual).
- [ ] Confirmar **entrega** desde `/trips` o `/delivery-dashboard`.

**Día 10 — Cobros**

- [ ] Registrar **cobro total** de una factura desde `/receivables`.
- [ ] Registrar **cobro parcial** — la partida queda abierta por el saldo.
- [ ] Registrar cobro que **aplica a varias facturas** del mismo cliente.
- [ ] Registrar **anticipo de cliente** (sin factura previa). Aplicarlo después.
- [ ] Ver **antigüedad de saldos** ([/receivables](client/src/pages/receivables.tsx)):
  la suma debe cuadrar con la cuenta de control del mayor.

### Semana 3 — Devoluciones, inventario y ajustes

**Día 11 — Devolución de cliente**

- [ ] Desde [/sales-returns](client/src/pages/sales-returns.tsx), elegir la
  factura B01 del día 8 y devolver 2 líneas parciales.
- [ ] Confirmar que:
  - Se emite **nota de crédito B04** contra la factura original.
  - No se puede acreditar **más de lo vendido** (control de sobre-crédito).
  - La mercancía **reingresa al costo con que salió** (validar en kardex).
  - AR baja y aparece la nota en 607 con signo negativo.

**Día 12 — Ajustes e inventario**

- [ ] Iniciar **conteo cíclico** de 5 productos en `/inventory-count`. El
  conteo es ciego (no muestra el saldo del sistema).
- [ ] Ingresar cantidades con diferencia deliberada (2 sobrantes, 3 faltantes).
- [ ] Revisar variación y **aplicar** el conteo. Verificar que el faltante va a
  **gasto por faltante**, no a costo de ventas.
- [ ] Registrar **ajuste manual** con motivo "avería" en almacén de cuarentena.
- [ ] Ver reporte de **valorización** por almacén: suma = cuenta de control.

**Día 13 — Transferencias y multi-almacén**

- [ ] Ejecutar **transferencia** almacén principal → secundario. Aprobación +
  confirmación de recibido. **No debe generar asiento**.
- [ ] Ver [/inventory-costing](client/src/pages/inventory-costing.tsx) por almacén.
- [ ] Ver kardex del producto: ambos movimientos (salida y entrada) al mismo costo.

**Día 14 — Compras: reposición, RFQ y aprobaciones**

- [ ] Revisar productos que llegaron al **mínimo**. Emitir OC #4 manualmente
  (el sistema no genera automática — documenta la brecha).
- [ ] Solicitar aprobación de OC #4 desde `/approvals`.
- [ ] Enviar OC. Recibir 100 %.

**Día 15 — Corte de mitad de mes**

- [ ] Ejecutar **conciliación bancaria** parcial hasta el 15
  ([/bank-reconciliation](client/src/pages/bank-reconciliation.tsx)):
  registrar depósitos en tránsito y cheques pendientes; la diferencia debe
  poder cerrarse en cero.
- [ ] Revisar [/executive-dashboard](client/src/pages/executive-dashboard.tsx):
  ingresos, gastos, resultado, flujo de caja del mes.
- [ ] Descargar reporte de ventas del período.

### Semana 4 — RRHH, tesorería, cierre y fiscal

**Día 16 — Asistencia y permisos**

- [ ] Registrar **entrada/salida** de un empleado (attendance).
- [ ] Solicitar **vacaciones** de 3 días para un empleado con antigüedad
  (`requestTimeOff`). Aprobarlas desde `/approvals`.
- [ ] Verificar que **no se descuenta el saldo** hasta la aprobación.
- [ ] Solicitar licencia médica (requiere certificado) — probar que no deja
  sin URL de certificado.
- [ ] Marcar día completo como `leave` en asistencia y confirmar que aparece
  en el resumen.

**Día 17 — Comisiones**

- [ ] Ver comisiones acumuladas del vendedor desde `/commissions`.
- [ ] **Cerrar período de comisión** del mes (`closeCommissionPeriod`).
- [ ] Aprobar el cálculo (`approveCommissionEarning`).
- [ ] Confirmar que aparece **pendiente para nómina**
  (`pendingCommissionForPayroll`).

**Día 18 — Descuento interno a empleado (compra a la empresa)**

- [ ] Vender a un empleado con **descuento interno** (hoy sólo hay descuento
  por línea — documenta si se maneja como cliente-empleado con lista de precios
  distinta o como descuento manual, ambos son válidos pero hay que decidirlo).
- [ ] Si el descuento se cobra por **descuento en nómina**, registrarlo como
  "otras deducciones" en el volante del empleado el día de la corrida.

**Día 19 — Nómina**

- [ ] Correr la **nómina del mes** desde `/payroll`.
- [ ] Verificar por empleado:
  - Sueldo bruto correcto.
  - AFP empleado 2.87 %, SFS 3.04 %, ISR según tabla.
  - Aporte patronal AFP 7.10 %, SFS 7.09 %, INFOTEP 1 %.
  - Comisiones del mes sumadas al bruto.
  - Descuentos internos en "otras deducciones".
- [ ] **Postear la corrida**: debe crear un solo asiento por toda la nómina.
- [ ] Descargar volantes de pago (payslips).

**Día 20 — TSS**

- [ ] Generar **archivo TSS** del mes ([server/services/hr-tss.ts](server/services/hr-tss.ts)).
- [ ] Verificar formato y totales.
- [ ] Verificar que sólo incluye empleados en `active` u `on_leave`.

**Día 21 — Terminación de contrato**

- [ ] Simular **desahucio del empleador** para un empleado con >5 años:
  desde [/employees](client/src/pages/employees.tsx) o llamando a
  `computeTermination` / `saveTermination`.
- [ ] Validar cálculo:
  - Preaviso según antigüedad.
  - Cesantía por años (7/14/21/23 según tabla RD).
  - Vacaciones proporcionales.
  - Regalía pascual proporcional.
- [ ] Simular **renuncia justificada** — debe pagar preaviso y cesantía.
- [ ] Simular **renuncia sin justa causa** — NO paga preaviso ni cesantía.
- [ ] **Aprobar terminación** (`approveTermination`). Debe:
  - Actualizar `employment_status` a `terminated`.
  - Cerrar la asistencia posterior a la fecha.
  - Excluir al empleado de la próxima nómina y del TSS.

**Día 22 — Activos fijos y depreciación**

- [ ] Registrar **1 activo fijo** nuevo comprado en el mes.
- [ ] Correr **depreciación mensual** de todos los activos.
- [ ] Verificar el asiento generado (gasto depreciación / depreciación
  acumulada).
- [ ] Verificar que el balance general refleja el nuevo valor neto.

**Día 23 — Multi-moneda y revaluación**

- [ ] Cargar la **tasa de cierre** del mes.
- [ ] Correr **revaluación FX** ([/fx-revaluation](client/src/pages/fx-revaluation.tsx)).
- [ ] Verificar el asiento de diferencia por cambio realizada / no realizada.

**Día 24 — Presupuesto vs real**

- [ ] Cargar **presupuesto** por cuenta para el mes en `/budget`.
- [ ] Ver **reporte de variación** — presupuesto vs real.
- [ ] Verificar variaciones significativas y anotar razón.

**Día 25 — Puntos de lealtad**

- [ ] Verificar que las ventas del mes **acreditaron puntos** al cliente.
- [ ] Canjear puntos en una venta nueva.
- [ ] Simular **expiración** (o revisar política) — hay servicio dedicado.

### Semana 5 — Cierre, fiscal y consolidación

**Día 26 — Reportes DGII**

- [ ] Generar **606** (compras) del mes. Verificar que las devoluciones a
  proveedores aparecen en negativo.
- [ ] Generar **607** (ventas) del mes. Notas de crédito B04 en negativo.
- [ ] Generar **608** (comprobantes anulados). Anular una factura NCF sin uso
  y confirmar que sale en 608.
- [ ] Generar **609** (pagos al exterior). El pago del día 4 al proveedor USD
  debe aparecer.
- [ ] Generar **IT-1** e **IR-17** — deben tomar el mismo saldo del mayor
  que los estados financieros.

**Día 27 — e-CF**

- [ ] Enviar 3 comprobantes electrónicos (E31/E32/E34) al DGII simulado.
- [ ] Forzar 1 rechazo — verificar cola de reintentos.
- [ ] Simular caída del DGII — modo contingencia.
- [ ] Consultar bandeja de recibidos + acuse.
- [ ] Anular un e-CF ya emitido y confirmar reflejo en 608 y en el 607.

**Día 28 — Conciliación bancaria final y tesorería**

- [ ] Cerrar **conciliación bancaria** del mes completo. Diferencia = 0.
- [ ] Ver [/treasury](client/src/pages/treasury.tsx): saldo en libros = saldo
  conciliado + tránsito - pendientes.
- [ ] Cargar **saldo real del estado de cuenta** y confirmar match.

**Día 29 — Cierre contable y estados financieros**

- [ ] Ejecutar **cierre de período** ([server/accounting/period-close.ts](server/accounting/period-close.ts)):
  - Intento fallido: postear un asiento manual con fecha del mes ya cerrado —
    debe rechazarse.
- [ ] Emitir **balance de comprobación**. Debe cuadrar (debe = haber).
- [ ] Emitir **estado de resultados** del mes.
- [ ] Emitir **balance general** al cierre.
- [ ] Verificar en el mayor que:
  - Cuenta de control AR = suma de partidas abiertas AR.
  - Cuenta de control AP = suma de partidas abiertas AP.
  - Cuenta de control inventario = suma de valorización por almacén.
  - Bancos = saldo conciliado por cuenta.

**Día 30 — Consolidación multi-empresa**

- [ ] Repetir un mini-flujo en la **empresa B** (compra y venta intercompañía
  con empresa A).
- [ ] Ejecutar **consolidación** ([/consolidation](client/src/pages/consolidation.tsx)):
  - Conversión de moneda al tipo de cambio de cierre.
  - Eliminación de la operación intercompañía.
  - Estados consolidados.
- [ ] Comparar con la suma manual de los dos EFR individuales para verificar
  las eliminaciones.

### Después del mes — verificaciones cruzadas

- [ ] **Aislamiento multi-empresa**: consulta directa a BD con el rol del app —
  al filtrar `companyId = 2` desde una sesión de empresa 1 debe devolver
  **cero filas**.
- [ ] **Auditoría** ([/audit-log](client/src/pages/audit-log.tsx)): buscar la
  factura del día 8, la devolución del día 11, la terminación del día 21.
  Deben aparecer con usuario, IP, timestamp y payload.
- [ ] **Alertas**: revisar `/alerts` — vencimientos, crédito excedido, mínimo
  de stock, etc.
- [ ] **Impresión** de comprobantes fiscales generados.
- [ ] **API pública** (si aplica): consumir 3 endpoints con `x-api-key` y
  confirmar que respeta el aislamiento por empresa.

---

## 5. Verificaciones contables cruzadas (obligatorias, no negociables)

Estas son las pruebas de que **el sistema no se contradice a sí mismo**. Si
alguna falla, hay un problema serio que va más allá de la UI.

| Verificación | Fuente A | Fuente B | Deben coincidir |
|---|---|---|---|
| AR | Cuenta control mayor | Σ `ar_open_items` abiertas | Sí |
| AP | Cuenta control mayor | Σ `ap_open_items` abiertas | Sí |
| Inventario | Cuenta control mayor | Σ `inventory_valuation` | Sí |
| Bancos | Cuenta control mayor | Σ saldos conciliados | Sí |
| Ventas mes | ER (ingresos) | Σ facturas emitidas - N.C. | Sí |
| Compras mes | ER (costo/gasto) | Σ facturas recibidas - devoluciones | Sí |
| ITBIS por pagar | Cuenta mayor | 607 - 606 (ITBIS neto) | Sí |
| Nómina | Cuenta gasto sueldos | Σ payslips.gross | Sí |
| Depreciación | Cuenta gasto | Σ movimientos activos fijos del mes | Sí |
| Balance | Debe | Haber | Sí |
| Consolidado | Suma no consolidada - eliminaciones | Consolidado | Sí |

---

## 6. Pruebas de seguridad y control

- [ ] **Aislamiento por empresa**: sesión de empresa A no ve nada de B (probar
  en 5 endpoints distintos).
- [ ] **Roles**: cajero NO puede acceder a `/payroll`, `/accounting/*`,
  `/fixed-assets`, `/consolidation`.
- [ ] **Revocación en caliente**: quitar una vista a un rol y su próximo
  request de esa vista devuelve 403 sin necesidad de re-login.
- [ ] **2FA**: login sin código falla; con código pasa.
- [ ] **Cierre de período**: postear a mes cerrado debe rechazarse.
- [ ] **NCF**: no debe consumir número si la operación termina en error.
- [ ] **Sobre-crédito**: n.c. mayor a lo facturado debe rechazarse en servidor.
- [ ] **Rate limit / inyección** en endpoints públicos (`/api-public-routes`).
- [ ] **API keys**: rotar y verificar que la vieja deja de funcionar.

---

## 7. Cosas que el usuario mencionó y hay que confirmar cómo se implementan

1. **Descuentos internos a empleados**: no hay un módulo específico. Dos formas
   válidas de manejarlo:
   - Cliente = empleado con **lista de precios especial** (`priceListId`).
   - Venta a crédito **descontada por nómina** (registrar en volante como "otras
     deducciones").
   Decidir cuál y probarla. Recomiendo la segunda: deja rastro en RRHH y no
   ensucia el catálogo de clientes.

2. **Despachos parciales**: se hacen desde el pedido/factura, no desde una
   pantalla dedicada. El sistema **sí** soporta despachar menos de lo pedido y
   dejar backorder, pero **no** genera automáticamente una lista de picking
   priorizada por ruta. Probarlo con al menos un pedido de 10 líneas.

3. **Comisiones de vendedores**: existe motor. Requiere definir **reglas de
   comisión** por vendedor/producto/monto antes de vender, o no calcula nada.

4. **Vacaciones y cesantía**: la lógica RD está completa
   ([server/services/hr-termination.ts](server/services/hr-termination.ts) y
   [server/services/hr-attendance-leave.ts](server/services/hr-attendance-leave.ts))
   pero el catálogo interno todavía dice "ausente" — hay que probar la UI para
   ver si están enlazadas.

5. **TSS**: se genera archivo. Verificar que el formato es el que actualmente
   acepta la TSS (puede cambiar).

---

## 8. Entregable esperado al terminar la prueba

1. Este checklist con cada punto marcado ✅ / ❌ / ⚠.
2. Lista de **incidencias** con: pantalla, endpoint, payload de entrada,
   respuesta obtenida, respuesta esperada, criticidad (bloqueante / mayor / menor).
3. Un **dump de la BD** al día 30 antes del cierre y otro después del cierre,
   para poder repetir las verificaciones si algo se cuestiona.
4. **Capturas** de los 4 estados financieros del cierre.
5. **Reportes DGII** exportados (606/607/608/609) del mes.
6. **Log de auditoría** filtrado a las operaciones del mes.
7. Actualización propuesta del [modules-catalog.ts](client/src/pages/help/modules-catalog.ts)
   para las capacidades marcadas ⚠ que en la prueba resultaron funcionales.
