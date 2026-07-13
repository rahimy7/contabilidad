/**
 * Schema barrel.
 *
 * Every consumer imports `@shared/schema`, so this file is the contract. Domain
 * files can be carved out of `legacy.ts` without touching a single call site.
 *
 * `legacy.ts` is the original single-file schema, moved here verbatim: the POS,
 * catalog, WhatsApp and inventory tables inherited from Metabella. It still
 * names its tenant column `store_id`. New domains below are written against
 * `companies` and the money builders in `columns.ts`; nothing new goes into
 * `legacy.ts`.
 */

export * from "./columns";
export * from "./core";
export * from "./legacy";
export * from "./accounting";
export * from "./fiscal";
export * from "./subledgers";
export * from "./fixed-assets";
export * from "./budget";
export * from "./payroll";
export * from "./treasury";
export * from "./inventory";
export * from "./consolidation";
