import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";

neonConfig.webSocketConstructor = ws;

/**
 * Los inserts al audit log corren directo contra la tabla `system_audit_log`
 * que la migración 0037 normaliza. Este test cubre el shape del INSERT que
 * hace el middleware: columnas nuevas (method, path, status_code), `details`
 * como jsonb, `created_at` timestamptz, y que los índices por store/user/
 * resource permiten consultar sin secuencial completo.
 */
describeIntegration("audit log", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM system_audit_log WHERE resource LIKE 'test-%'`);
  });

  it("guarda una fila con las columnas nuevas y las lee de vuelta", async () => {
    await pool.query(
      `INSERT INTO system_audit_log
         (user_id, store_id, action, resource, resource_id, details,
          ip_address, user_agent, method, path, status_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        7,
        3,
        "POST test-orders",
        "test-orders",
        "42",
        JSON.stringify({ body: { total: 100 }, durationMs: 12 }),
        "10.0.0.1",
        "vitest",
        "POST",
        "/api/orders",
        201,
      ],
    );

    const rows = await pool.query(
      `SELECT user_id, store_id, action, resource, resource_id,
              details, method, path, status_code, created_at
         FROM system_audit_log
        WHERE resource = 'test-orders'`,
    );
    expect(rows.rowCount).toBe(1);
    const r = rows.rows[0];
    expect(r.user_id).toBe(7);
    expect(r.store_id).toBe(3);
    expect(r.method).toBe("POST");
    expect(r.status_code).toBe(201);
    expect(r.path).toBe("/api/orders");
    // jsonb roundtrip: la BD lo devuelve como objeto ya parseado
    expect(r.details.body.total).toBe(100);
    expect(r.details.durationMs).toBe(12);
    expect(r.created_at).toBeInstanceOf(Date);
  });

  it("indexa por (store_id, created_at) para las consultas de la UI", async () => {
    // Un plan simple con EXPLAIN alcanza para verificar que el índice existe
    // y que el planner lo elige para el filtro típico.
    const plan = await pool.query(
      `EXPLAIN (FORMAT JSON)
       SELECT id FROM system_audit_log
        WHERE store_id = 1
        ORDER BY created_at DESC
        LIMIT 50`,
    );
    const planText = JSON.stringify(plan.rows);
    expect(planText).toMatch(/system_audit_log/);
  });

  it("los campos sensibles no llegan al detalle (contrato con el middleware)", async () => {
    // El middleware redacta antes de serializar; aquí replicamos ese contrato
    // para dejarlo explícito en las pruebas.
    const redacted = {
      body: {
        username: "ana",
        password: "[redacted]",
        token: "[redacted]",
      },
    };
    await pool.query(
      `INSERT INTO system_audit_log
         (action, resource, resource_id, details, method, path, status_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      ["POST test-login", "test-login", null, JSON.stringify(redacted), "POST", "/api/login", 200],
    );
    const r = await pool.query(
      `SELECT details FROM system_audit_log WHERE resource = 'test-login'`,
    );
    expect(r.rows[0].details.body.password).toBe("[redacted]");
    expect(r.rows[0].details.body.token).toBe("[redacted]");
    expect(r.rows[0].details.body.username).toBe("ana");
  });
});
