import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import {
  hireEmployee, listEmployees, updatePosition, addEmployeeDocument,
  documentsExpiring, contractsExpiring, addEmergencyContact, getEmployeeFull,
} from "../server/services/hr-employees";
import { saveTermination, approveTermination } from "../server/services/hr-termination";
import {
  seedDefaultTimeOffTypes, requestTimeOff, grantAnnualBalance, getBalances,
  syncTimeOffApproval,
} from "../server/services/hr-attendance-leave";
import { resolveApproval } from "../server/services/approvals";

neonConfig.webSocketConstructor = ws;

describeIntegration("HR employees + lifecycle", () => {
  let pool: Pool;
  const storeId = 999_601;
  let approverId: number;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
    await cleanup();

    const boss = await pool.query(
      `INSERT INTO users (username, password, name, role, status)
       VALUES ('hr-boss', 'x', 'HR Boss', 'admin', 'active') RETURNING id`,
    );
    approverId = boss.rows[0].id;

    // Regla de aprobación para permisos.
    await pool.query(
      `INSERT INTO approval_rules
         (store_id, document_type, min_amount, max_amount, approver_role, required_approvals, priority)
       VALUES ($1, 'time_off', 0, NULL, 'admin', 1, 100)`,
      [storeId],
    );
  });

  afterAll(async () => {
    await cleanup();
    await pool.query(`DELETE FROM users WHERE id = $1`, [approverId]);
    await pool.end();
  });

  async function cleanup() {
    await pool.query(`DELETE FROM hr_terminations WHERE store_id = $1`, [storeId]);
    await pool.query(`DELETE FROM hr_time_off_requests WHERE store_id = $1`, [storeId]);
    await pool.query(`DELETE FROM hr_time_off_balances WHERE employee_id IN (SELECT id FROM hr_employees WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM hr_time_off_types WHERE store_id = $1`, [storeId]);
    await pool.query(`DELETE FROM approval_actions WHERE request_id IN (SELECT id FROM approval_requests WHERE store_id=$1 AND document_type='time_off')`, [storeId]);
    await pool.query(`DELETE FROM approval_requests WHERE store_id = $1 AND document_type='time_off'`, [storeId]);
    await pool.query(`DELETE FROM approval_rules WHERE store_id = $1 AND document_type='time_off'`, [storeId]);
    await pool.query(`DELETE FROM hr_employee_documents WHERE store_id = $1`, [storeId]);
    await pool.query(`DELETE FROM hr_employment_contracts WHERE employee_id IN (SELECT id FROM hr_employees WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM hr_positions WHERE employee_id IN (SELECT id FROM hr_employees WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM hr_emergency_contacts WHERE employee_id IN (SELECT id FROM hr_employees WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM hr_dependents WHERE employee_id IN (SELECT id FROM hr_employees WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM hr_bank_accounts WHERE employee_id IN (SELECT id FROM hr_employees WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM hr_employees WHERE store_id = $1`, [storeId]);
    await pool.query(`DELETE FROM hr_employee_sequences WHERE store_id = $1`, [storeId]);
  }

  beforeEach(async () => {
    await cleanup();
  });

  it("contratar crea empleado, contrato vigente y puesto vigente en un paso", async () => {
    const emp = await hireEmployee(pool, {
      storeId, firstName: "Juan", lastName: "Pérez",
      cedula: "402-1234567-8",
      hireDate: "2024-01-01",
      monthlySalary: 30000,
      positionTitle: "Vendedor",
      department: "Comercial",
    });
    expect(emp.employeeCode).toBe("EMP-000001");
    expect(emp.employmentStatus).toBe("active");

    const contracts = await pool.query(
      `SELECT is_current FROM hr_employment_contracts WHERE employee_id = $1`, [emp.id],
    );
    expect(contracts.rows.length).toBe(1);
    expect(contracts.rows[0].is_current).toBe(true);

    const positions = await pool.query(
      `SELECT is_current, change_reason FROM hr_positions WHERE employee_id = $1`, [emp.id],
    );
    expect(positions.rows.length).toBe(1);
    expect(positions.rows[0].change_reason).toBe("hiring");
  });

  it("cambio de puesto cierra el anterior y crea uno nuevo vigente", async () => {
    const emp = await hireEmployee(pool, {
      storeId, firstName: "Ana", lastName: "Reyes",
      hireDate: "2024-01-01", monthlySalary: 25000,
      positionTitle: "Cajera",
    });
    await updatePosition(pool, {
      employeeId: emp.id,
      positionTitle: "Supervisora de Caja",
      monthlySalary: 35000,
      effectiveFrom: "2025-06-01",
      changeReason: "promotion",
    });
    const positions = await pool.query(
      `SELECT position_title, monthly_salary::text, is_current, effective_to::text
         FROM hr_positions WHERE employee_id = $1 ORDER BY effective_from`,
      [emp.id],
    );
    expect(positions.rows.length).toBe(2);
    expect(positions.rows[0].is_current).toBe(false);
    expect(positions.rows[0].effective_to).toBe("2025-05-31");
    expect(positions.rows[1].is_current).toBe(true);
    expect(positions.rows[1].position_title).toBe("Supervisora de Caja");

    // El expediente debe reflejar el nuevo puesto y sueldo.
    const upd = await pool.query(
      `SELECT position_title, monthly_salary::text FROM hr_employees WHERE id = $1`,
      [emp.id],
    );
    expect(upd.rows[0].position_title).toBe("Supervisora de Caja");
    expect(Number(upd.rows[0].monthly_salary)).toBe(35000);
  });

  it("agregar documento con vencimiento aparece en 'expiring'", async () => {
    const emp = await hireEmployee(pool, {
      storeId, firstName: "Luis", lastName: "Torres",
      hireDate: "2024-01-01", monthlySalary: 25000,
    });
    const soon = new Date();
    soon.setDate(soon.getDate() + 15);
    await addEmployeeDocument(pool, {
      storeId, employeeId: emp.id,
      documentType: "medical_certificate",
      title: "Carné médico",
      fileUrl: "https://example.com/doc.pdf",
      expiresAt: soon.toISOString().slice(0, 10),
      uploadedBy: approverId,
    });
    const list = await documentsExpiring(pool, storeId, 30);
    expect(list.rows.length).toBe(1);
    expect(list.rows[0].daysLeft).toBeGreaterThanOrEqual(0);
    expect(list.rows[0].daysLeft).toBeLessThanOrEqual(30);
  });

  it("contratos con vencimiento aparecen en 'contracts-expiring'", async () => {
    const emp = await hireEmployee(pool, {
      storeId, firstName: "Ivan", lastName: "Guerrero",
      hireDate: "2024-01-01", monthlySalary: 25000,
      contractType: "fixed_term",
    });
    const soon = new Date();
    soon.setDate(soon.getDate() + 40);
    await pool.query(
      `UPDATE hr_employment_contracts SET end_date = $2, is_indefinite = false
        WHERE employee_id = $1 AND is_current = true`,
      [emp.id, soon.toISOString().slice(0, 10)],
    );
    const list = await contractsExpiring(pool, storeId, 60);
    expect(list.rows.length).toBe(1);
  });

  it("emergency contact queda enlazado y `getEmployeeFull` lo trae", async () => {
    const emp = await hireEmployee(pool, {
      storeId, firstName: "Marta", lastName: "Alba",
      hireDate: "2024-01-01", monthlySalary: 25000,
    });
    await addEmergencyContact(pool, {
      employeeId: emp.id, name: "Pedro Alba", relationship: "spouse",
      phonePrimary: "809-555-1234", isPrimary: true,
    });
    const full = await getEmployeeFull(pool, emp.id);
    expect(full.emergencyContacts.length).toBe(1);
    expect(full.emergencyContacts[0].name).toBe("Pedro Alba");
  });

  it("time-off request con motor de aprobaciones sincroniza al aprobarse", async () => {
    const emp = await hireEmployee(pool, {
      storeId, firstName: "Sofia", lastName: "Mena",
      hireDate: "2024-01-01", monthlySalary: 30000,
    });
    await seedDefaultTimeOffTypes(pool, storeId);
    await grantAnnualBalance(pool, emp.id, storeId, 2026);

    const types = await pool.query(
      `SELECT id FROM hr_time_off_types WHERE store_id=$1 AND code='vacation'`,
      [storeId],
    );
    const vacTypeId = types.rows[0].id;

    const req = await requestTimeOff(pool, {
      storeId, employeeId: emp.id, typeId: vacTypeId,
      startDate: "2026-07-01", endDate: "2026-07-05", totalDays: 5,
      reason: "Descanso",
    });
    expect(req.requiresApproval).toBe(true);

    // Antes de aprobar el balance debe estar pendiente.
    const beforeBal = await getBalances(pool, emp.id, 2026);
    const vBefore = beforeBal.rows.find((b: any) => b.code === "vacation");
    expect(Number(vBefore?.daysPending)).toBe(5);

    const approvals = await pool.query(
      `SELECT id FROM approval_requests WHERE store_id=$1 AND document_type='time_off' AND document_id=$2`,
      [storeId, String(req.requestId)],
    );
    await resolveApproval(pool, approvals.rows[0].id, approverId, "approve");
    await syncTimeOffApproval(pool, req.requestId);

    const afterBal = await getBalances(pool, emp.id, 2026);
    const vAfter = afterBal.rows.find((b: any) => b.code === "vacation");
    expect(Number(vAfter?.daysPending)).toBe(0);
    expect(Number(vAfter?.daysUsed)).toBe(5);
  });

  it("terminación aprobada marca empleado como `terminated` y cierra su contrato", async () => {
    const emp = await hireEmployee(pool, {
      storeId, firstName: "Carla", lastName: "Núñez",
      hireDate: "2020-01-01", monthlySalary: 40000,
    });
    const { terminationId, calculation } = await saveTermination(pool, {
      storeId, employeeId: emp.id, terminationDate: "2026-01-01",
      terminationType: "employer_dismissal_no_cause",
      preparedBy: approverId,
    });
    expect(calculation.yearsOfService).toBe(6);
    expect(calculation.severanceDays).toBe(23 * 6);

    await approveTermination(pool, terminationId, approverId);

    const empAfter = await pool.query(
      `SELECT employment_status, termination_date::text FROM hr_employees WHERE id=$1`,
      [emp.id],
    );
    expect(empAfter.rows[0].employment_status).toBe("terminated");
    expect(empAfter.rows[0].termination_date).toBe("2026-01-01");

    const contract = await pool.query(
      `SELECT is_current, end_date::text FROM hr_employment_contracts WHERE employee_id=$1 ORDER BY start_date DESC LIMIT 1`,
      [emp.id],
    );
    expect(contract.rows[0].is_current).toBe(false);
    expect(contract.rows[0].end_date).toBe("2026-01-01");
  });

  it("no permite terminar un empleado ya terminado", async () => {
    const emp = await hireEmployee(pool, {
      storeId, firstName: "Luis", lastName: "Test",
      hireDate: "2024-01-01", monthlySalary: 20000,
    });
    const { terminationId } = await saveTermination(pool, {
      storeId, employeeId: emp.id, terminationDate: "2026-01-01",
      terminationType: "employee_resignation", preparedBy: approverId,
    });
    await approveTermination(pool, terminationId, approverId);
    await expect(saveTermination(pool, {
      storeId, employeeId: emp.id, terminationDate: "2026-06-01",
      terminationType: "employer_dismissal_no_cause", preparedBy: approverId,
    })).rejects.toThrow(/ya está terminado/);
  });

  it("listado filtra por status y search", async () => {
    await hireEmployee(pool, {
      storeId, firstName: "Roberto", lastName: "López",
      hireDate: "2024-01-01", monthlySalary: 20000, department: "Ventas",
    });
    await hireEmployee(pool, {
      storeId, firstName: "María", lastName: "Delgado",
      hireDate: "2024-01-01", monthlySalary: 25000, department: "Compras",
    });
    const all = await listEmployees(pool, storeId);
    expect(all.rows.length).toBe(2);
    const search = await listEmployees(pool, storeId, { search: "López" });
    expect(search.rows.length).toBe(1);
    const dept = await listEmployees(pool, storeId, { department: "Compras" });
    expect(dept.rows.length).toBe(1);
  });
});
