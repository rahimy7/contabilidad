import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import jwt from "jsonwebtoken";
import type { Server } from "http";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { createAccountingApp } from "../server/http/accounting-app";

neonConfig.webSocketConstructor = ws;

/**
 * The multi-company flow over HTTP: a user creates a company, it is seeded and
 * becomes theirs, and no other user can see or act on it. This is the signup
 * path a new Dominican taxpayer takes.
 */
describeIntegration("multi-company HTTP flow", () => {
  let pool: Pool;
  let server: Server;
  let base: string;
  let userA: number;
  let userB: number;

  const SECRET = process.env.JWT_SECRET || "dev-secret";
  const RNC = "112233445";
  const RNC2 = "556677889";
  const token = (id: number) => jwt.sign({ userId: id, role: "admin", storeId: 1 }, SECRET);
  const authH = (id: number) => ({ authorization: `Bearer ${token(id)}`, "content-type": "application/json" });

  async function cleanup() {
    const rncs = [RNC, RNC2];
    await pool.query(`DELETE FROM journal_entries WHERE company_id IN (SELECT id FROM companies WHERE rnc = ANY($1))`, [rncs]);
    await pool.query(`DELETE FROM user_companies WHERE user_id IN (SELECT id FROM users WHERE username = ANY($1))`, [["co-a", "co-b"]]);
    await pool.query(`DELETE FROM companies WHERE rnc = ANY($1)`, [rncs]);
    await pool.query(`DELETE FROM users WHERE username = ANY($1)`, [["co-a", "co-b"]]);
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await cleanup();
    const a = await pool.query(`INSERT INTO users (username,password,name,role,status) VALUES ('co-a','x','A','admin','active') RETURNING id`);
    const b = await pool.query(`INSERT INTO users (username,password,name,role,status) VALUES ('co-b','x','B','admin','active') RETURNING id`);
    userA = a.rows[0].id;
    userB = b.rows[0].id;

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
    await cleanup();
    await pool.end();
  });

  const post = (path: string, body: unknown, uid: number) =>
    fetch(`${base}${path}`, { method: "POST", headers: authH(uid), body: JSON.stringify(body) });
  const get = (path: string, uid: number, extra: Record<string, string> = {}) =>
    fetch(`${base}${path}`, { headers: { ...authH(uid), ...extra } });

  let companyId: number;

  it("a user with no companies gets an empty list", async () => {
    const res = await get("/api/companies", userA);
    expect(res.status).toBe(200);
    expect((await res.json()).companies).toEqual([]);
  });

  it("creating a company seeds it and makes the creator its default member", async () => {
    const res = await post("/api/companies", { legalName: "Contribuyente A SRL", rnc: RNC }, userA);
    expect(res.status).toBe(201);
    const body = await res.json();
    companyId = body.company.id;
    expect(body.company.rnc).toBe(RNC);

    // It now appears in the user's list, as default.
    const list = await (await get("/api/companies", userA)).json();
    expect(list.companies).toHaveLength(1);
    expect(list.companies[0].is_default).toBe(true);

    // It was seeded: the chart of accounts is reachable when scoped to it.
    const accounts = await (await get("/api/accounting/accounts", userA, { "x-company-id": String(companyId) })).json();
    expect(accounts.accounts.length).toBe(77);
  });

  it("rejects a second company with the same RNC", async () => {
    const res = await post("/api/companies", { legalName: "Duplicada", rnc: RNC }, userA);
    expect(res.status).toBe(409);
  });

  it("a second user cannot see the first user's company", async () => {
    const list = await (await get("/api/companies", userB)).json();
    expect(list.companies).toEqual([]);
  });

  it("a second user cannot act on the first user's company via X-Company-Id", async () => {
    const res = await get("/api/accounting/accounts", userB, { "x-company-id": String(companyId) });
    expect(res.status).toBe(403);
  });

  it("a user can belong to more than one company and switch between them", async () => {
    const second = await post("/api/companies", { legalName: "Contribuyente A2 SRL", rnc: RNC2 }, userA);
    expect(second.status).toBe(201);
    const secondId = (await second.json()).company.id;

    const list = await (await get("/api/companies", userA)).json();
    expect(list.companies).toHaveLength(2);

    // Acting scoped to each returns that company's own (freshly seeded) data.
    const a = await (await get("/api/accounting/accounts", userA, { "x-company-id": String(companyId) })).json();
    const b = await (await get("/api/accounting/accounts", userA, { "x-company-id": String(secondId) })).json();
    expect(a.accounts.length).toBe(77);
    expect(b.accounts.length).toBe(77);
  });

  it("without X-Company-Id, requests fall back to the user's default company", async () => {
    // userA's default is the first company; a trial balance must resolve without
    // an explicit header.
    const res = await get(`/api/accounting/trial-balance?year=${new Date().getFullYear()}`, userA);
    expect(res.status).toBe(200);
  });
});
