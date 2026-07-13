import { numeric } from "drizzle-orm/pg-core";

/**
 * Money and rate column builders.
 *
 * The legacy POS tables reach for `decimal(10,2)` (tops out near 99.9M) and
 * `decimal(12,2)` interchangeably. A ledger accumulates: an account balance is
 * the sum of every line ever posted to it, so a width that comfortably holds a
 * single invoice will not hold a year of them. Every financial column added
 * from here on goes through these builders, so the precision decision lives in
 * one place instead of being re-litigated at each column.
 */

/** Monetary amount. 14 integer digits, 4 decimal places. */
export const money = (name: string) => numeric(name, { precision: 18, scale: 4 });

/**
 * FX rate. 8 decimal places because DOP/USD quotes carry 4-6 and intermediate
 * cross-rates need headroom before rounding into `money`.
 */
export const fxRate = (name: string) => numeric(name, { precision: 18, scale: 8 });

/** Percentage held as a rate (0.1800 = 18%), not as 18.00. */
export const rate = (name: string) => numeric(name, { precision: 7, scale: 4 });

/** Quantity, e.g. inventory units. Fractional units are real (kg, litres). */
export const quantity = (name: string) => numeric(name, { precision: 18, scale: 4 });
