import {
  pgTable,
  serial,
  integer,
  smallint,
  text,
  boolean,
  timestamp,
  bigint,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { money } from "./columns";
import { companies } from "./core";
import { journalEntries } from "./accounting";

/**
 * Payroll for the Dominican Republic.
 *
 * The statutory deductions (AFP pension, SFS/ARS health, ISR income tax) and
 * employer contributions (AFP, SFS, INFOTEP) are computed by the payroll module;
 * these tables record the result. A run produces one payslip per active
 * employee and one journal entry for the whole run.
 */
export const payrollEmployees = pgTable(
  "payroll_employees",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    cedula: text("cedula"),
    position: text("position"),
    baseSalary: money("base_salary").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("payroll_employees_code_uq").on(t.companyId, t.code)],
);

export const payrollRuns = pgTable(
  "payroll_runs",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    fiscalYear: smallint("fiscal_year").notNull(),
    month: smallint("month").notNull(),
    status: text("status").notNull().default("draft"), // draft | posted
    grossTotal: money("gross_total").notNull().default("0"),
    netTotal: money("net_total").notNull().default("0"),
    journalEntryId: bigint("journal_entry_id", { mode: "number" }).references(() => journalEntries.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("payroll_runs_uq").on(t.companyId, t.fiscalYear, t.month)],
);

export const payslips = pgTable(
  "payslips",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    runId: integer("run_id").references(() => payrollRuns.id, { onDelete: "cascade" }).notNull(),
    employeeId: integer("employee_id").references(() => payrollEmployees.id).notNull(),
    grossSalary: money("gross_salary").notNull(),
    // Employee deductions.
    afpEmployee: money("afp_employee").notNull().default("0"),
    sfsEmployee: money("sfs_employee").notNull().default("0"),
    isr: money("isr").notNull().default("0"),
    otherDeductions: money("other_deductions").notNull().default("0"),
    // Employer contributions (cost, not deducted from the employee).
    afpEmployer: money("afp_employer").notNull().default("0"),
    sfsEmployer: money("sfs_employer").notNull().default("0"),
    infotep: money("infotep").notNull().default("0"),
    netPay: money("net_pay").notNull(),
  },
  (t) => [
    uniqueIndex("payslips_uq").on(t.runId, t.employeeId),
    index("payslips_company_idx").on(t.companyId, t.runId),
  ],
);

export type PayrollEmployee = typeof payrollEmployees.$inferSelect;
export type PayrollRun = typeof payrollRuns.$inferSelect;
export type Payslip = typeof payslips.$inferSelect;
