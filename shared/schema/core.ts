import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  varchar,
  char,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import { rate } from "./columns";
import { users } from "./legacy";

/**
 * Tenancy.
 *
 * One `companies` row = one legal entity = one RNC = one tenant. Isolation is a
 * `company_id` discriminator, backed by Postgres row-level security rather than
 * by discipline in query builders (see server/db.ts). Schema-per-tenant was
 * rejected: a consolidated trial balance across a group has to aggregate
 * journal lines from several companies in one statement, which a `search_path`
 * switch cannot do, and `search_path` leaks across reused pooled connections.
 */

/** Grupo empresarial. Exists only so companies can consolidate. */
export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  /** Presentation currency of the consolidated statements. */
  baseCurrency: char("base_currency", { length: 3 }).notNull().default("DOP"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companies = pgTable(
  "companies",
  {
    id: serial("id").primaryKey(),
    /** Null for a standalone company that belongs to no group. */
    groupId: integer("group_id").references(() => groups.id),
    legalName: text("legal_name").notNull(),
    tradeName: text("trade_name"),
    /** RNC (9) or cédula (11). Unique across the platform: one taxpayer, one tenant. */
    rnc: varchar("rnc", { length: 11 }).notNull(),
    fiscalRegime: text("fiscal_regime").notNull().default("ordinario"),
    /** Currency the books are kept in. Journal lines balance in this currency. */
    functionalCurrency: char("functional_currency", { length: 3 }).notNull().default("DOP"),
    /** Actividad económica per DGII. */
    economicActivityCode: text("economic_activity_code"),
    isActive: boolean("is_active").notNull().default(true),
    /** Per-company configuration: logo, invoice footer, business hours, etc. */
    settings: jsonb("settings").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("companies_rnc_uq").on(t.rnc), index("companies_group_idx").on(t.groupId)],
);

/**
 * Which companies a user may act on. Users are global; access is per company.
 * A user with no row here can reach no tenant data at all.
 */
export const userCompanies = pgTable(
  "user_companies",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    companyId: integer("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    /** Company selected on login when the user has several. */
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("user_companies_uq").on(t.userId, t.companyId),
    index("user_companies_user_idx").on(t.userId),
  ],
);

/** How a company rolls up into its group's consolidated statements. */
export const companyConsolidationMap = pgTable(
  "company_consolidation_map",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .references(() => groups.id, { onDelete: "cascade" })
      .notNull(),
    companyId: integer("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    /** Drives minority interest. 1.0000 = wholly owned. */
    ownershipPct: rate("ownership_pct").notNull().default("1.0000"),
    /** full | equity | proportional */
    consolMethod: text("consol_method").notNull().default("full"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("company_consolidation_map_uq").on(t.groupId, t.companyId)],
);

// ────────────────────────────────────────────────────────────────────────────
// Validators
// ────────────────────────────────────────────────────────────────────────────

/**
 * RNC is 9 digits, cédula is 11. DGII rejects anything else, so reject it here
 * rather than at the point a 607 file is generated for a whole month.
 */
export const rncSchema = z
  .string()
  .regex(/^\d{9}$|^\d{11}$/, "RNC debe tener 9 dígitos o cédula 11 dígitos");

export const insertGroupSchema = z.object({
  name: z.string().min(1),
  baseCurrency: z.string().length(3).default("DOP"),
});

export const insertCompanySchema = z.object({
  groupId: z.number().int().positive().nullable().optional(),
  legalName: z.string().min(1),
  tradeName: z.string().optional(),
  rnc: rncSchema,
  fiscalRegime: z.string().default("ordinario"),
  functionalCurrency: z.string().length(3).default("DOP"),
  economicActivityCode: z.string().optional(),
  settings: z.record(z.unknown()).default({}),
});

export type Group = typeof groups.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type UserCompany = typeof userCompanies.$inferSelect;
export type CompanyConsolidationMap = typeof companyConsolidationMap.$inferSelect;
