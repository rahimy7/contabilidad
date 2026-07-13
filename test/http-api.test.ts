import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import jwt from "jsonwebtoken";
import type { Server } from "http";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { createAccountingApp } from "../server/http/accounting-app";

neonConfig.webSocketConstructor = ws;

/**
 * Exercises the real HTTP stack: a signed JWT through the actual auth
 * middleware, the company-resolution bridge, row-level security, and the
 * services beneath. Boots the app on an ephemeral port and talks to it with
 * fetch — no mocks between the request and the database.
 */
describeIntegration("accounting + fiscal HTTP API", () => {
  let pool: Pool;
  let companyId: number;
  let otherCompanyId: number;
  let userId: number;
  let outsiderId: number;
  let server: Server;
  let base: string;

  const RNC = "130999888";
  const OTHER_RNC = "130777666";
  const SECRET = process.env.JWT_SECRET || "dev-secret";
  const YEAR = new Date().getUTCFullYear();
  const MONTH = new Date().getUTCMonth() + 1;
  const DATE = `${YEAR}-${String(MONTH).padStart(2, "0")}-14`;

  const token = (id: number) => jwt.sign({ userId: id, role: "admin", storeId: 1 }, SECRET);
  const auth = (id: number) => ({ authorization: `Bearer ${token(id)}` });

  /** Deletes in FK order: documents and entries before the companies/users they point at. */
  async function cleanup() {
    const rncs = [RNC, OTHER_RNC];
    const users = ["http-demo", "http-outsider"];
    await pool.query(`DELETE FROM fiscal_documents WHERE company_id IN (SELECT id FROM companies WHERE rnc = ANY($1))`, [rncs]);
    await pool.query(`DELETE FROM journal_entries WHERE company_id IN (SELECT id FROM companies WHERE rnc = ANY($1))`, [rncs]);
    await pool.query(`DELETE FROM user_companies WHERE user_id IN (SELECT id FROM users WHERE username = ANY($1))`, [users]);
    await pool.query(`DELETE FROM companies WHERE rnc = ANY($1)`, [rncs]);
    await pool.query(`DELETE FROM users WHERE username = ANY($1)`, [users]);
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await cleanup();

    const c = await pool.query(
      `INSERT INTO companies (legal_name, rnc) VALUES ('HTTP SRL', $1) RETURNING id`,
      [RNC],
    );
    companyId = c.rows[0].id;
    await seedCompanyDefaults(pool, companyId);
    await pool.query(
      `INSERT INTO ncf_sequences (company_id, ncf_type, range_from, range_to, next_number)
       VALUES ($1,'B01',1,100,1)`,
      [companyId],
    );

    const o = await pool.query(
      `INSERT INTO companies (legal_name, rnc) VALUES ('Other SRL', $1) RETURNING id`,
      [OTHER_RNC],
    );
    otherCompanyId = o.rows[0].id;
    await seedCompanyDefaults(pool, otherCompanyId);

    const u = await pool.query(
      `INSERT INTO users (username, password, name, role, status)
       VALUES ('http-demo','x','HTTP Demo','admin','active') RETURNING id`,
    );
    userId = u.rows[0].id;
    await pool.query(`INSERT INTO user_companies (user_id, company_id, is_default) VALUES ($1,$2,true)`, [
      userId,
      companyId,
    ]);

    // A user with a login but no company membership at all.
    const out = await pool.query(
      `INSERT INTO users (username, password, name, role, status)
       VALUES ('http-outsider','x','Outsider','admin','active') RETURNING id`,
    );
    outsiderId = out.rows[0].id;

    const app = createAccountingApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        base = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await cleanup();
    await pool.end();
  });

  const get = (path: string, headers: Record<string, string> = auth(userId)) =>
    fetch(`${base}${path}`, { headers });
  const post = (path: string, body: unknown, headers: Record<string, string> = auth(userId)) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  // ── auth & tenancy ──────────────────────────────────────────────────────

  it("rejects a request with no token", async () => {
    const res = await fetch(`${base}/api/accounting/accounts`);
    expect(res.status).toBe(401);
  });

  it("rejects a user who belongs to no company", async () => {
    const res = await get("/api/accounting/accounts", auth(outsiderId));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/no está asociado/);
  });

  it("serves the chart of accounts for the caller's company", async () => {
    const res = await get("/api/accounting/accounts");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accounts.length).toBe(73);
    expect(body.accounts.find((a: any) => a.code === "1.1.01.001").name).toBe("Caja general");
  });

  // ── fiscal ─────────────────────────────────────────────────────────────

  it("issues an invoice over HTTP, allocating an NCF and posting it", async () => {
    const res = await post("/api/fiscal/invoices", {
      ncfType: "B01",
      date: DATE,
      buyerRnc: "131000001",
      buyerName: "Cliente Uno",
      lines: [{ description: "Producto A", quantity: "2", unitPrice: "500.00", taxCode: "ITBIS18" }],
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ncf).toBe("B0100000001");
    expect(body.total).toBe("1180");
    expect(body.journalEntryId).toBeGreaterThan(0);
  });

  it("shows the invoice in the document list and its lines", async () => {
    const list = await (await get("/api/fiscal/documents?type=invoice")).json();
    expect(list.documents.length).toBeGreaterThanOrEqual(1);
    const id = list.documents[0].id;
    const detail = await (await get(`/api/fiscal/documents/${id}`)).json();
    expect(detail.document.ncf).toBe("B0100000001");
    expect(detail.lines[0].description).toBe("Producto A");
  });

  it("reflects the invoice in the trial balance, and it balances", async () => {
    const tb = await (await get(`/api/accounting/trial-balance?year=${YEAR}`)).json();
    expect(tb.balanced).toBe(true);
    const caja = tb.rows.find((r: any) => r.code === "1.1.01.001");
    expect(Number(caja.balance)).toBe(1180);
  });

  it("generates a 607 that includes the issued invoice", async () => {
    const r = await (await get(`/api/fiscal/reports/607?year=${YEAR}&month=${MONTH}`)).json();
    expect(r.recordCount).toBe(1);
    expect(r.lines[0]).toContain("B0100000001");
  });

  it("returns the 607 as an upload-ready file when asked", async () => {
    const res = await get(`/api/fiscal/reports/607?year=${YEAR}&month=${MONTH}&format=txt`);
    expect(res.headers.get("content-type")).toMatch(/text\/plain/);
    expect(res.headers.get("content-disposition")).toMatch(/attachment/);
    const text = await res.text();
    expect(text.split("\n")[0]).toBe(`607|${RNC}|${YEAR}${String(MONTH).padStart(2, "0")}|1`);
  });

  it("rejects an unknown NCF type by refusing to allocate", async () => {
    const res = await post("/api/fiscal/invoices", {
      ncfType: "B99",
      date: DATE,
      lines: [{ description: "X", quantity: "1", unitPrice: "100", taxCode: "ITBIS18" }],
    });
    expect(res.status).toBe(409); // NcfExhaustedError -> no sequence for B99
  });

  // ── accounting ───────────────────────────────────────────────────────────

  it("posts a manual balanced entry and rejects an unbalanced one", async () => {
    const ok = await post("/api/accounting/journal", {
      date: DATE,
      memo: "Ajuste manual",
      lines: [
        { accountCode: "1.1.01.001", debit: "500.00" },
        { accountCode: "4.1.01.001", credit: "500.00" },
      ],
    });
    expect(ok.status).toBe(201);
    expect((await ok.json()).entryNo).toMatch(/^\d{4}-\d{8}$/);

    const bad = await post("/api/accounting/journal", {
      date: DATE,
      lines: [
        { accountCode: "1.1.01.001", debit: "500.00" },
        { accountCode: "4.1.01.001", credit: "499.00" },
      ],
    });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/does not balance/);
  });

  it("reverses a posted entry via HTTP", async () => {
    const posted = await (
      await post("/api/accounting/journal", {
        date: DATE,
        lines: [
          { accountCode: "1.1.01.001", debit: "10.00" },
          { accountCode: "4.1.01.001", credit: "10.00" },
        ],
      })
    ).json();
    const rev = await post(`/api/accounting/journal/${posted.entryId}/reverse`, { reason: "prueba" });
    expect(rev.status).toBe(201);
    expect((await rev.json()).entryId).toBeGreaterThan(posted.entryId);
  });

  it("validates the manual-entry body", async () => {
    const res = await post("/api/accounting/journal", { date: "not-a-date", lines: [] });
    expect(res.status).toBe(400);
  });

  // ── the cross-tenant check that matters ────────────────────────────────

  it("with X-Company-Id for a company the user cannot enter, refuses", async () => {
    const res = await get("/api/accounting/accounts", {
      ...auth(userId),
      "x-company-id": String(otherCompanyId),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/no tienes acceso/);
  });

  it("never leaks another company's documents, even listing after issuing", async () => {
    // The other company has its own seeded accounts but no documents. The demo
    // user cannot see it at all, and its own list is unaffected.
    const mine = await (await get("/api/fiscal/documents")).json();
    for (const d of mine.documents) {
      const detail = await (await get(`/api/fiscal/documents/${d.id}`)).json();
      expect(detail.document.company_id).toBe(companyId);
    }
  });
});
