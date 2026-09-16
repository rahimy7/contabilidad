import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import jwt from "jsonwebtoken";
import type { Server } from "http";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { createAccountingApp } from "../server/http/accounting-app";
import { FiscalDocumentService, CreditLimitError } from "../server/fiscal/document-service";
import { resolveApproval } from "../server/services/approvals";
import { syncCreditApplication } from "../server/sales/customers";
import { checkFiscalIdentity, isValidRnc, isValidCedula } from "../shared/customer-fiscal";

neonConfig.webSocketConstructor = ws;

it("valida el dígito verificador de RNC y cédula", () => {
  expect(isValidRnc("101010632")).toBe(true);
  expect(isValidRnc("101010633")).toBe(false);
  expect(isValidRnc("1-01-01063-2")).toBe(true);
  expect(isValidCedula("00100000009")).toBe(true);
  expect(isValidCedula("00100000008")).toBe(false);
});

it("exige coherencia entre persona, identificación, régimen y comprobante", () => {
  const base = { personType: "juridica" as const, taxIdType: "rnc" as const, rnc: "101010632", legalName: "X SRL", taxpayerType: "contribuyente" as const };
  expect(checkFiscalIdentity({ ...base, defaultNcfType: "B01" }).errors).toEqual([]);
  expect(checkFiscalIdentity({ ...base, taxIdType: "cedula", rnc: "00100000009" }).errors[0]).toMatch(/jurídica.*RNC/);
  expect(checkFiscalIdentity({ ...base, defaultNcfType: "B15" }).errors[0]).toMatch(/gubernamental/);
  expect(checkFiscalIdentity({ ...base, taxIdType: null, rnc: null, personType: "fisica", taxpayerType: "consumidor_final", defaultNcfType: "B01" }).errors[0]).toMatch(/B01 exige/);
  expect(checkFiscalIdentity({ ...base, itbisExempt: true }).errors[0]).toMatch(/exento/);
});

/**
 * La ficha maestra de extremo a extremo: HTTP real con JWT, empresa resuelta por
 * membresía, RLS, y la regla de crédito aplicada por el servicio de facturas.
 */
describeIntegration("maestro de clientes y línea de crédito", () => {
  let pool: Pool;
  let server: Server;
  let base: string;
  let companyId: number;
  let sellerId: number;
  let managerId: number;

  const STORE = 999_655;
  const RNC = "143655001";
  const USERS = ["cm-seller", "cm-manager"];
  const SECRET = process.env.JWT_SECRET || "dev-secret";
  const YEAR = new Date().getUTCFullYear();
  const MONTH = String(new Date().getUTCMonth() + 1).padStart(2, "0");
  const DATE = `${YEAR}-${MONTH}-10`;
  const stamp = String(Date.now()).slice(-6);

  const headers = (id: number, role: string) => ({
    authorization: `Bearer ${jwt.sign({ userId: id, role, storeId: STORE }, SECRET)}`,
    "content-type": "application/json",
  });
  const call = async (method: string, path: string, who: [number, string], body?: unknown) => {
    const res = await fetch(`${base}/api/customer-master${path}`, {
      method, headers: headers(...who), body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  const seller = () => [sellerId, "seller"] as [number, string];
  const manager = () => [managerId, "admin"] as [number, string];

  const customerBody = (over: Record<string, unknown> = {}) => ({
    personType: "juridica",
    taxIdType: "rnc",
    rnc: "1-01-01063-2",
    legalName: "Comercial Prueba SRL",
    tradeName: "Comercial Prueba",
    taxpayerType: "contribuyente",
    defaultNcfType: "B01",
    phone: `809${stamp}01`,
    email: `cm${stamp}@prueba.do`,
    province: "Distrito Nacional",
    municipality: "Santo Domingo de Guzmán",
    sector: "Naco",
    address: "Av. Tiradentes 10",
    terms: { itbisRetentionPercent: 30, gracePeriodDays: 5 },
    ...over,
  });

  async function cleanup() {
    const companies = `SELECT id FROM companies WHERE rnc=$1`;
    await pool.query(`DELETE FROM fiscal_documents WHERE company_id IN (${companies})`, [RNC]);
    await pool.query(`DELETE FROM journal_entries WHERE company_id IN (${companies})`, [RNC]);
    await pool.query(`DELETE FROM approval_requests WHERE store_id=$1`, [STORE]);
    await pool.query(`DELETE FROM customers WHERE store_id=$1`, [STORE]);
    await pool.query(`DELETE FROM user_companies WHERE user_id IN (SELECT id FROM users WHERE username = ANY($1))`, [USERS]);
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [RNC]);
    await pool.query(`DELETE FROM users WHERE username = ANY($1)`, [USERS]);
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await cleanup();
    const c = await pool.query(`INSERT INTO companies (legal_name, rnc) VALUES ('Clientes SRL',$1) RETURNING id`, [RNC]);
    companyId = c.rows[0].id;
    await seedCompanyDefaults(pool, companyId);
    await pool.query(`INSERT INTO ncf_sequences (company_id, ncf_type, range_from, range_to, next_number) VALUES ($1,'B01',1,500,1)`, [companyId]);
    const s = await pool.query(`INSERT INTO users (username, password, name, role, status) VALUES ('cm-seller','x','Vendedora','seller','active') RETURNING id`);
    sellerId = s.rows[0].id;
    const m = await pool.query(`INSERT INTO users (username, password, name, role, status) VALUES ('cm-manager','x','Gerente de Crédito','admin','active') RETURNING id`);
    managerId = m.rows[0].id;
    for (const u of [sellerId, managerId]) {
      await pool.query(`INSERT INTO user_companies (user_id, company_id, is_default) VALUES ($1,$2,true)`, [u, companyId]);
    }
    const app = createAccountingApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (pool) {
      await cleanup();
      await pool.end();
    }
  });

  async function inTx<T>(fn: (c: any) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  const creditSale = (customerId: number, unitPrice: string, creditApprovedBy?: number) =>
    inTx((c) =>
      new FiscalDocumentService(c).issueInvoice({
        companyId, issuerRnc: RNC, ncfType: "B01", date: DATE, buyerRnc: "101010632",
        paymentMethod: "credit", customerId, creditApprovedBy,
        lines: [{ description: "Mercancía", quantity: "1", unitPrice, taxCode: "ITBIS18" }],
      }),
    );

  let customerId: number;

  it("crea la ficha con datos fiscales, código y condiciones", async () => {
    const created = await call("POST", "/", seller(), customerBody());
    expect(created.status).toBe(201);
    customerId = created.body.id;

    const { status, body } = await call("GET", `/${customerId}`, seller());
    expect(status).toBe(200);
    expect(body.customer).toMatchObject({
      name: "Comercial Prueba", legalName: "Comercial Prueba SRL", rnc: "101010632",
      taxIdType: "rnc", personType: "juridica", defaultNcfType: "B01", province: "Distrito Nacional",
      createdByName: "Vendedora",
    });
    expect(body.customer.code).toMatch(/^CL-\d{6}$/);
    expect(body.terms).toMatchObject({ itbisRetentionPercent: 30, gracePeriodDays: 5 });
    expect(body.credit).toMatchObject({ status: "none", limit: "0.00", available: "0.00" });
  });

  it("rechaza identidades fiscales incoherentes y avisa del RNC duplicado", async () => {
    const bad = await call("POST", "/", seller(), customerBody({ taxIdType: "cedula", rnc: "00100000008", phone: `809${stamp}02`, email: null }));
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe("fiscal_identity");

    const dup = await call("POST", "/", seller(), customerBody({ legalName: "Sucursal Norte", tradeName: null, phone: `809${stamp}03`, email: null }));
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("duplicate_tax_id");

    const confirmed = await call("POST", "/", seller(), customerBody({ legalName: "Sucursal Norte", tradeName: null, phone: `809${stamp}03`, email: null, confirmDuplicateTaxId: true }));
    expect(confirmed.status).toBe(201);
  });

  it("no vende a crédito a quien no tiene línea aprobada", async () => {
    await expect(creditSale(customerId, "1000.00")).rejects.toThrow(/no tiene una línea de crédito aprobada/);
  });

  it("aprueba la línea con segregación de funciones y un límite no mayor al solicitado", async () => {
    const req = await call("POST", `/${customerId}/credit/applications`, seller(), {
      requestedLimit: 50000, requestedDays: 30, justification: "Cliente con 3 años de compras de contado",
      guaranteeType: "pagare", guaranteeAmount: 50000, reviewDate: `${YEAR + 1}-01-31`,
    });
    expect(req.status).toBe(201);
    const appId = req.body.applicationId;

    const again = await call("POST", `/${customerId}/credit/applications`, seller(), {
      requestedLimit: 10000, requestedDays: 15, justification: "Segunda solicitud simultánea",
    });
    expect(again.status).toBe(409);

    const selfApprove = await call("POST", `/credit/applications/${appId}/resolve`, seller(), { action: "approve" });
    expect(selfApprove.status).toBe(403);

    const tooMuch = await call("POST", `/credit/applications/${appId}/resolve`, manager(), { action: "approve", approvedLimit: 60000 });
    expect(tooMuch.status).toBe(422);

    const ok = await call("POST", `/credit/applications/${appId}/resolve`, manager(), {
      action: "approve", approvedLimit: 40000, approvedDays: 30, comment: "Aprobado con límite menor",
    });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("approved");

    const { body } = await call("GET", `/${customerId}`, seller());
    expect(body.credit).toMatchObject({ status: "active", limit: "40000.00", days: 30 });
    expect(body.customer.creditApprovedByName).toBe("Gerente de Crédito");
    expect(body.customer.creditReviewDate).toBe(`${YEAR + 1}-01-31`);
    expect(body.applications[0]).toMatchObject({ status: "approved", approvedLimit: "40000.00", requestedLimit: "50000.00" });
    expect(body.events.map((e: any) => e.event)).toEqual(["approved", "requested"]);
    // Las condiciones comerciales sobrevivieron a la nueva versión de términos.
    expect(body.terms).toMatchObject({ itbisRetentionPercent: 30, gracePeriodDays: 5 });
  });

  it("guardar la ficha no toca el límite ni el plazo aprobados", async () => {
    const put = await call("PUT", `/${customerId}`, seller(), customerBody({ terms: { itbisRetentionPercent: 0, gracePeriodDays: 10, creditLimit: 999999 } }));
    expect(put.status).toBe(200);
    const { body } = await call("GET", `/${customerId}`, seller());
    expect(body.credit).toMatchObject({ limit: "40000.00", days: 30 });
    expect(body.terms).toMatchObject({ gracePeriodDays: 10, itbisRetentionPercent: 0 });
  });

  it("la factura respeta el límite, la suspensión y el bloqueo", async () => {
    const sale = await creditSale(customerId, "10000.00"); // 11,800 con ITBIS
    expect(sale.openItemId).toBeTruthy();

    // 11,800 + 35,400 = 47,200 > 40,000
    await expect(creditSale(customerId, "30000.00")).rejects.toBeInstanceOf(CreditLimitError);

    const statement = await call("GET", `/${customerId}/statement`, seller());
    expect(statement.body.openItems).toHaveLength(1);
    expect(statement.body.aging.total).toBe("11800.0000");
    const detail = await call("GET", `/${customerId}`, seller());
    expect(detail.body.credit).toMatchObject({ used: "11800.0000", available: "28200.00" });

    const noReason = await call("POST", `/${customerId}/credit/status`, manager(), { status: "suspended", reason: "" });
    expect(noReason.status).toBe(400);
    expect((await call("POST", `/${customerId}/credit/status`, manager(), { status: "suspended", reason: "Mora de 45 días" })).status).toBe(200);
    await expect(creditSale(customerId, "100.00")).rejects.toThrow(/suspendida/);
    // Un supervisor puede autorizar una venta puntual sobre una línea suspendida.
    await expect(creditSale(customerId, "100.00", managerId)).resolves.toBeTruthy();

    expect((await call("POST", `/${customerId}/credit/status`, manager(), { status: "blocked", reason: "Cheque devuelto" })).status).toBe(200);
    await expect(creditSale(customerId, "100.00", managerId)).rejects.toThrow(/bloqueada/);

    // Sacar una línea de un bloqueo es de administradores, también hacia "suspendida".
    const sellerReactivates = await call("POST", `/${customerId}/credit/status`, seller(), { status: "active", reason: "Pagó el cheque" });
    expect(sellerReactivates.status).toBe(403);
    const sellerDowngrades = await call("POST", `/${customerId}/credit/status`, seller(), { status: "suspended", reason: "Pagó el cheque" });
    expect(sellerDowngrades.status).toBe(403);
    expect((await call("POST", `/${customerId}/credit/status`, manager(), { status: "active", reason: "Pagó el cheque" })).status).toBe(200);
    await expect(creditSale(customerId, "100.00")).resolves.toBeTruthy();

    const del = await call("DELETE", `/${customerId}`, manager());
    expect(del.status).toBe(409);
    expect(del.body.code).toBe("has_movements");
  });

  it("una aprobación dada en la bandeja de Aprobaciones pone la línea en vigor", async () => {
    const created = await call("POST", "/", seller(), customerBody({
      rnc: "130000001", legalName: "Bandeja SRL", tradeName: null, phone: `809${stamp}04`, email: null,
    }));
    const id = created.body.id;
    const req = await call("POST", `/${id}/credit/applications`, seller(), {
      requestedLimit: 25000, requestedDays: 15, justification: "Distribuidor nuevo con referencias",
    });
    await resolveApproval(pool as any, req.body.approvalRequestId, managerId, "approve", "ok");
    expect(await inTx((c) => syncCreditApplication(c, req.body.applicationId))).toBe("approved");
    // Idempotente.
    expect(await inTx((c) => syncCreditApplication(c, req.body.applicationId))).toBe("approved");

    const { body } = await call("GET", `/${id}`, seller());
    expect(body.credit).toMatchObject({ status: "active", limit: "25000.00", days: 15 });

    const list = await call("GET", `/?credit=active&search=${encodeURIComponent("1-30-00000-1")}`, seller());
    expect(list.body.rows.map((r: any) => r.id)).toEqual([id]);
  });

  it("administra los contactos con un solo principal", async () => {
    const a = await call("POST", `/${customerId}/contacts`, seller(), { name: "Ana Compras", role: "buyer", isPrimary: true, receivesInvoices: true });
    const b = await call("POST", `/${customerId}/contacts`, seller(), { name: "Luis Contador", role: "accountant", isPrimary: true, receivesStatements: true });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const { body } = await call("GET", `/${customerId}`, seller());
    expect(body.contacts.filter((c: any) => c.isPrimary).map((c: any) => c.name)).toEqual(["Luis Contador"]);
    expect((await call("DELETE", `/${customerId}/contacts/${a.body.id}`, seller())).status).toBe(200);
    expect((await call("GET", `/${customerId}`, seller())).body.contacts).toHaveLength(1);
  });
});
