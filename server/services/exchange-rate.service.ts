// server/services/exchange-rate.service.ts

import { eq, and, desc } from "drizzle-orm";
import { exchangeRates } from "@shared/schema";
import type { PgDatabase } from "drizzle-orm/pg-core";

export interface ExchangeRate {
  id: number;
  baseCurrency: string;
  targetCurrency: string;
  rate: string;
  updatedAt: Date;
  createdAt: Date;
  isActive: boolean;
  storeId: number;
  updatedBy?: number;
}

export class ExchangeRateService {
  constructor(private db: PgDatabase<any>) {}

  /**
   * Obtiene la tasa de cambio actual entre dos monedas
   */
  async getCurrentRate(from: string, to: string, storeId: number): Promise<number> {
    try {
      // Si son la misma moneda, retorna 1
      if (from === to) return 1;

      const rate = await this.db
        .select()
        .from(exchangeRates)
        .where(
          and(
            eq(exchangeRates.baseCurrency, from),
            eq(exchangeRates.targetCurrency, to),
            eq(exchangeRates.storeId, storeId),
            eq(exchangeRates.isActive, true)
          )
        )
        .orderBy(desc(exchangeRates.updatedAt))
        .limit(1);

      if (rate.length === 0) {
        // Intentar la conversión inversa
        const inverseRate = await this.db
          .select()
          .from(exchangeRates)
          .where(
            and(
              eq(exchangeRates.baseCurrency, to),
              eq(exchangeRates.targetCurrency, from),
              eq(exchangeRates.storeId, storeId),
              eq(exchangeRates.isActive, true)
            )
          )
          .orderBy(desc(exchangeRates.updatedAt))
          .limit(1);

        if (inverseRate.length === 0) {
          throw new Error(`No se encontró tasa de cambio para ${from} a ${to}`);
        }

        // Calcular la tasa inversa
        return 1 / parseFloat(inverseRate[0].rate);
      }

      return parseFloat(rate[0].rate);
    } catch (error) {
      console.error('Error obteniendo tasa de cambio:', error);
      throw error;
    }
  }

  /**
   * Actualiza o crea una tasa de cambio
   */
  async updateRate(
    from: string, 
    to: string, 
    rate: number, 
    storeId: number, 
    updatedBy: number
  ): Promise<ExchangeRate> {
    try {
      // Validar que la tasa sea positiva
      if (rate <= 0) {
        throw new Error('La tasa de cambio debe ser mayor a 0');
      }

      // Validar que las monedas sean diferentes
      if (from === to) {
        throw new Error('Las monedas base y objetivo deben ser diferentes');
      }

      // Desactivar tasas anteriores
      await this.db
        .update(exchangeRates)
        .set({ isActive: false })
        .where(
          and(
            eq(exchangeRates.baseCurrency, from),
            eq(exchangeRates.targetCurrency, to),
            eq(exchangeRates.storeId, storeId)
          )
        );

      // Insertar nueva tasa
      const newRate = await this.db
        .insert(exchangeRates)
        .values({
          baseCurrency: from,
          targetCurrency: to,
          rate: rate.toString(),
          storeId,
          updatedBy,
          isActive: true,
          updatedAt: new Date(),
          createdAt: new Date()
        })
        .returning();

      return newRate[0] as ExchangeRate;
    } catch (error) {
      console.error('Error actualizando tasa de cambio:', error);
      throw error;
    }
  }

  /**
   * Convierte un precio de una moneda a otra
   */
  async convertPrice(
    price: number, 
    fromCurrency: string, 
    toCurrency: string, 
    storeId: number
  ): Promise<number> {
    try {
      if (fromCurrency === toCurrency) return price;

      const rate = await this.getCurrentRate(fromCurrency, toCurrency, storeId);
      return price * rate;
    } catch (error) {
      console.error('Error convirtiendo precio:', error);
      throw error;
    }
  }

  /**
   * Obtiene todas las tasas de cambio activas para una tienda
   */
  async getAllRates(storeId: number): Promise<ExchangeRate[]> {
    try {
      const rates = await this.db
        .select()
        .from(exchangeRates)
        .where(
          and(
            eq(exchangeRates.storeId, storeId),
            eq(exchangeRates.isActive, true)
          )
        )
        .orderBy(desc(exchangeRates.updatedAt));

      return rates as ExchangeRate[];
    } catch (error) {
      console.error('Error obteniendo todas las tasas:', error);
      throw error;
    }
  }

  /**
   * Obtiene el historial de tasas para un par de monedas
   */
  async getHistoricalRates(
    from: string, 
    to: string, 
    storeId: number, 
    limit: number = 10
  ): Promise<ExchangeRate[]> {
    try {
      const rates = await this.db
        .select()
        .from(exchangeRates)
        .where(
          and(
            eq(exchangeRates.baseCurrency, from),
            eq(exchangeRates.targetCurrency, to),
            eq(exchangeRates.storeId, storeId)
          )
        )
        .orderBy(desc(exchangeRates.createdAt))
        .limit(limit);

      return rates as ExchangeRate[];
    } catch (error) {
      console.error('Error obteniendo historial:', error);
      throw error;
    }
  }

  /**
   * Obtiene el factor de conversión para usar en frontend
   */
  async getConversionFactor(from: string, to: string, storeId: number): Promise<number> {
    return this.getCurrentRate(from, to, storeId);
  }

  /**
   * Valida si una tasa está dentro de rangos aceptables
   */
  validateRate(from: string, to: string, rate: number): { valid: boolean; message?: string } {
    // Rangos aceptables aproximados (ajustar según necesidades)
    const acceptableRanges: Record<string, { min: number; max: number }> = {
      'USD_DOP': { min: 40, max: 70 }, // 1 USD = 40-70 DOP
      'DOP_USD': { min: 0.014, max: 0.025 }, // 1 DOP = 0.014-0.025 USD
    };

    const pair = `${from}_${to}`;
    const range = acceptableRanges[pair];

    if (!range) {
      return { valid: true }; // Si no hay rango definido, aceptar
    }

    if (rate < range.min || rate > range.max) {
      return {
        valid: false,
        message: `La tasa ${rate} está fuera del rango aceptable (${range.min} - ${range.max})`
      };
    }

    return { valid: true };
  }
}