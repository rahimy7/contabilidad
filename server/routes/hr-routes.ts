import express, { type Response } from "express";
import { z } from "zod";
import { authenticateToken, type AuthenticatedRequest } from "../authMiddleware";
import { masterPool } from "../multi-tenant-db";
import {
  hireEmployee, getEmployee, listEmployees, updatePosition, addEmployeeDocument,
  documentsExpiring, contractsExpiring, addEmergencyContact, getEmployeeFull,
} from "../services/hr-employees";
import {
  clockIn, clockOut, attendanceSummary, closeAttendancePeriod,
  seedDefaultTimeOffTypes, requestTimeOff, syncTimeOffApproval, getBalances,
  grantAnnualBalance,
} from "../services/hr-attendance-leave";
import {
  computeTermination, saveTermination, approveTermination, markTerminationPaid,
  getTermination, calculateBenefits,
} from "../services/hr-termination";

const router = express.Router();

const storeIdOf = (req: AuthenticatedRequest) => {
  const s = req.user!.storeId;
  return typeof s === "string" ? parseInt(s) : s;
};

// ── Empleados ───────────────────────────────────────────────────────────────

const hireBody = z.object({
  userId: z.number().int().positive().optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  cedula: z.string().optional(),
  passport: z.string().optional(),
  tssNumber: z.string().optional(),
  nationality: z.string().optional(),
  birthDate: z.string().optional(),
  gender: z.enum(["M", "F", "O"]).optional(),
  maritalStatus: z.string().optional(),
  personalEmail: z.string().email().optional(),
  personalPhone: z.string().optional(),
  homeAddress: z.string().optional(),
  homeProvince: z.string().optional(),
  homeMunicipality: z.string().optional(),
  homeSector: z.string().optional(),
  hireDate: z.string(),
  contractType: z.string().optional(),
  department: z.string().optional(),
  positionTitle: z.string().optional(),
  supervisorId: z.number().int().positive().optional(),
  workLocation: z.string().optional(),
  monthlySalary: z.number().nonnegative(),
  paymentFrequency: z.enum(["monthly", "biweekly", "weekly", "daily"]).optional(),
  paymentMethod: z.string().optional(),
  notes: z.string().optional(),
});

router.get("/hr/employees", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const storeId = storeIdOf(req);
  const result = await listEmployees(masterPool, storeId, {
    status: req.query.status ? String(req.query.status) : undefined,
    department: req.query.department ? String(req.query.department) : undefined,
    search: req.query.search ? String(req.query.search) : undefined,
  });
  res.json(result);
});

router.post("/hr/employees", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = hireBody.parse(req.body);
    const emp = await hireEmployee(masterPool, { storeId: storeIdOf(req), ...body });
    res.status(201).json(emp);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    console.error("[hr] hire failed:", err);
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/hr/employees/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await getEmployee(masterPool, Number(req.params.id)));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("no existe")) return res.status(404).json({ error: msg });
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/hr/employees/:id/full", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await getEmployeeFull(masterPool, Number(req.params.id)));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("no existe")) return res.status(404).json({ error: msg });
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/hr/employees/:id/position", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      positionTitle: z.string().min(1),
      department: z.string().optional(),
      supervisorId: z.number().int().positive().optional(),
      monthlySalary: z.number().nonnegative(),
      effectiveFrom: z.string(),
      changeReason: z.enum(["promotion", "demotion", "transfer", "raise", "adjustment", "other"]),
      notes: z.string().optional(),
    }).parse(req.body);
    res.json(await updatePosition(masterPool, { employeeId: Number(req.params.id), ...body }));
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/hr/employees/:id/documents", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      documentType: z.string().min(1),
      title: z.string().min(1),
      fileUrl: z.string().url(),
      fileSizeBytes: z.number().int().nonnegative().optional(),
      mimeType: z.string().optional(),
      issuedAt: z.string().optional(),
      expiresAt: z.string().optional(),
      description: z.string().optional(),
    }).parse(req.body);
    res.status(201).json(await addEmployeeDocument(masterPool, {
      storeId: storeIdOf(req),
      employeeId: Number(req.params.id),
      uploadedBy: req.user!.id,
      ...body,
    }));
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/hr/employees/:id/emergency-contact", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      name: z.string().min(1),
      relationship: z.string().min(1),
      phonePrimary: z.string().min(6),
      phoneSecondary: z.string().optional(),
      email: z.string().email().optional(),
      address: z.string().optional(),
      isPrimary: z.boolean().optional(),
    }).parse(req.body);
    res.status(201).json(await addEmergencyContact(masterPool, {
      employeeId: Number(req.params.id), ...body,
    }));
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/hr/documents-expiring", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const days = req.query.days ? Number(req.query.days) : 30;
  res.json(await documentsExpiring(masterPool, storeIdOf(req), days));
});

router.get("/hr/contracts-expiring", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const days = req.query.days ? Number(req.query.days) : 60;
  res.json(await contractsExpiring(masterPool, storeIdOf(req), days));
});

// ── Asistencia ──────────────────────────────────────────────────────────────

router.post("/hr/attendance/clock-in", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      employeeId: z.number().int().positive(),
      workDate: z.string().optional(),
      expectedStartTime: z.string().optional(),
      checkMethod: z.enum(["manual", "biometric", "geolocated", "system"]).optional(),
      locationLat: z.number().optional(),
      locationLng: z.number().optional(),
    }).parse(req.body);
    res.status(201).json(await clockIn(masterPool, {
      storeId: storeIdOf(req),
      ipAddress: req.headers["x-forwarded-for"]?.toString(),
      ...body,
    }));
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/hr/attendance/clock-out", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      employeeId: z.number().int().positive(),
      workDate: z.string().optional(),
      breakMinutes: z.number().int().nonnegative().optional(),
    }).parse(req.body);
    res.json(await clockOut(masterPool, body));
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("no hay marca")) return res.status(409).json({ error: msg });
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/hr/attendance/summary", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const from = String(req.query.from);
  const to = String(req.query.to);
  const employeeId = req.query.employeeId ? Number(req.query.employeeId) : undefined;
  res.json(await attendanceSummary(masterPool, { storeId: storeIdOf(req), from, to, employeeId }));
});

router.post("/hr/attendance/close-period", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      periodStart: z.string(),
      periodEnd: z.string(),
    }).parse(req.body);
    res.json(await closeAttendancePeriod(masterPool, {
      storeId: storeIdOf(req), closedBy: req.user!.id, ...body,
    }));
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

// ── Vacaciones / permisos ──────────────────────────────────────────────────

router.post("/hr/time-off/seed-defaults", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  res.json(await seedDefaultTimeOffTypes(masterPool, storeIdOf(req)));
});

router.get("/hr/time-off/types", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const storeId = storeIdOf(req);
  const r = await masterPool.query(
    `SELECT id, code, name, description, is_paid AS "isPaid",
            requires_approval AS "requiresApproval",
            accrual_days_per_year::text AS "accrualDaysPerYear",
            requires_medical_certificate AS "requiresMedicalCertificate",
            is_active AS "isActive"
       FROM hr_time_off_types WHERE store_id = $1 AND is_active = true
       ORDER BY code`,
    [storeId],
  );
  res.json({ rows: r.rows });
});

router.get("/hr/employees/:id/time-off-balances", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const year = req.query.fiscalYear ? Number(req.query.fiscalYear) : undefined;
  res.json(await getBalances(masterPool, Number(req.params.id), year));
});

router.post("/hr/employees/:id/grant-annual-balance", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const year = Number(req.body?.fiscalYear ?? new Date().getFullYear());
  res.json(await grantAnnualBalance(masterPool, Number(req.params.id), storeIdOf(req), year));
});

router.post("/hr/time-off/requests", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      employeeId: z.number().int().positive(),
      typeId: z.number().int().positive(),
      startDate: z.string(),
      endDate: z.string(),
      totalDays: z.number().positive(),
      reason: z.string().optional(),
      medicalCertificateUrl: z.string().url().optional(),
    }).parse(req.body);
    res.status(201).json(await requestTimeOff(masterPool, {
      storeId: storeIdOf(req), ...body,
    }));
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("certificado") || msg.includes("no existe")) return res.status(400).json({ error: msg });
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/hr/time-off/requests/:id/sync", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  res.json(await syncTimeOffApproval(masterPool, Number(req.params.id)));
});

// ── Desvinculación ─────────────────────────────────────────────────────────

router.post("/hr/terminations/preview", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      employeeId: z.number().int().positive(),
      terminationDate: z.string(),
      terminationType: z.enum([
        "employer_dismissal_no_cause", "employer_dismissal_with_cause",
        "employee_resignation", "employee_resignation_justified",
        "mutual_agreement", "death", "retirement", "end_of_contract",
      ]),
      pendingSalary: z.number().nonnegative().optional(),
      otherBenefits: z.number().nonnegative().optional(),
      deductionsAmount: z.number().nonnegative().optional(),
    }).parse(req.body);
    res.json(await computeTermination(masterPool, {
      storeId: storeIdOf(req), preparedBy: req.user!.id, ...body,
    }));
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/hr/terminations", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      employeeId: z.number().int().positive(),
      terminationDate: z.string(),
      terminationType: z.enum([
        "employer_dismissal_no_cause", "employer_dismissal_with_cause",
        "employee_resignation", "employee_resignation_justified",
        "mutual_agreement", "death", "retirement", "end_of_contract",
      ]),
      reasonCode: z.string().optional(),
      reason: z.string().optional(),
      pendingSalary: z.number().nonnegative().optional(),
      otherBenefits: z.number().nonnegative().optional(),
      deductionsAmount: z.number().nonnegative().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    res.status(201).json(await saveTermination(masterPool, {
      storeId: storeIdOf(req), preparedBy: req.user!.id, ...body,
    }));
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("ya está terminado") || msg.includes("no existe")) return res.status(409).json({ error: msg });
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/hr/terminations/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const t = await getTermination(masterPool, Number(req.params.id));
  if (!t) return res.status(404).json({ error: "not found" });
  res.json(t);
});

router.post("/hr/terminations/:id/approve", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await approveTermination(masterPool, Number(req.params.id), req.user!.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("no existe")) return res.status(404).json({ error: msg });
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/hr/terminations/:id/paid", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      paymentMethod: z.string().min(1),
      referenceNumber: z.string().min(1),
    }).parse(req.body);
    await markTerminationPaid(masterPool, Number(req.params.id), body.paymentMethod, body.referenceNumber);
    res.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

// Cálculo puro para "simuladores" desde la UI sin persistir.
router.post("/hr/terminations/calculate", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      hireDate: z.string(),
      terminationDate: z.string(),
      monthlySalary: z.number().nonnegative(),
      terminationType: z.enum([
        "employer_dismissal_no_cause", "employer_dismissal_with_cause",
        "employee_resignation", "employee_resignation_justified",
        "mutual_agreement", "death", "retirement", "end_of_contract",
      ]),
      pendingSalary: z.number().nonnegative().optional(),
      otherBenefits: z.number().nonnegative().optional(),
      deductionsAmount: z.number().nonnegative().optional(),
      yearToDateEarnings: z.number().nonnegative().optional(),
    }).parse(req.body);
    res.json(calculateBenefits(body));
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
