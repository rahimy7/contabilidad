import { describe, it, expect } from "vitest";
import { computeTssContributions, DEFAULT_RATES_2026 } from "../server/services/hr-tss";

/**
 * Cálculo TSS DR — Ley 87-01 y normativa vigente.
 *
 * Los porcentajes actuales:
 *   AFP  empleado 2.87%   empleador 7.10%
 *   SFS  empleado 3.04%   empleador 7.09%
 *   INFOTEP 1.00% (empleador)
 *   SRL 1.30% (empleador, base sectorial)
 *
 * Topes vigentes (con salario mínimo del sector no sectorizado):
 *   AFP  20 salarios mínimos
 *   SFS  10 salarios mínimos
 */

describe("TSS DR — cálculo de aportes", () => {
  const RATES = DEFAULT_RATES_2026;
  const MIN = RATES.minSalary;

  it("empleado con sueldo por debajo del tope: aportes se calculan sobre el sueldo completo", () => {
    const c = computeTssContributions(30000);
    expect(c.afpBase).toBe(30000);
    expect(c.sfsBase).toBe(30000);
    expect(c.afpEmployee).toBe(30000 * 0.0287);
    expect(c.afpEmployer).toBeCloseTo(30000 * 0.0710, 2);
    expect(c.sfsEmployee).toBeCloseTo(30000 * 0.0304, 2);
    expect(c.sfsEmployer).toBeCloseTo(30000 * 0.0709, 2);
    expect(c.infotep).toBeCloseTo(30000 * 0.01, 2);
    expect(c.srl).toBeCloseTo(30000 * 0.013, 2);
  });

  it("empleado con sueldo entre tope SFS y tope AFP: SFS se capea, AFP no", () => {
    // Con salario mínimo 15000: tope SFS = 150000, tope AFP = 300000
    const salary = 200000;
    const c = computeTssContributions(salary);
    expect(c.sfsBase).toBe(MIN * 10);
    expect(c.afpBase).toBe(salary);
    expect(c.sfsEmployee).toBeCloseTo(MIN * 10 * 0.0304, 2);
    expect(c.afpEmployee).toBeCloseTo(salary * 0.0287, 2);
  });

  it("empleado con sueldo por encima del tope AFP: ambos aportes se capean", () => {
    const salary = 500000;
    const c = computeTssContributions(salary);
    expect(c.sfsBase).toBe(MIN * 10);
    expect(c.afpBase).toBe(MIN * 20);
    expect(c.sfsEmployee).toBeCloseTo(MIN * 10 * 0.0304, 2);
    expect(c.afpEmployee).toBeCloseTo(MIN * 20 * 0.0287, 2);
    // INFOTEP y SRL sí van sobre el sueldo bruto sin cap.
    expect(c.infotep).toBeCloseTo(salary * 0.01, 2);
    expect(c.srl).toBeCloseTo(salary * 0.013, 2);
  });

  it("suma correcta: totalToTss = totalEmployee + totalEmployer", () => {
    const c = computeTssContributions(50000);
    expect(c.totalEmployee).toBeCloseTo(c.afpEmployee + c.sfsEmployee, 2);
    expect(c.totalEmployer).toBeCloseTo(
      c.afpEmployer + c.sfsEmployer + c.infotep + c.srl, 2,
    );
    expect(c.totalToTss).toBeCloseTo(c.totalEmployee + c.totalEmployer, 2);
  });

  it("empleado con salario mínimo aporta el mínimo", () => {
    const c = computeTssContributions(MIN);
    expect(c.afpBase).toBe(MIN);
    expect(c.sfsBase).toBe(MIN);
  });

  it("aceptar rates personalizadas para cuando cambie el salario mínimo", () => {
    const custom = { ...RATES, minSalary: 20000 };
    const c = computeTssContributions(500000, custom);
    expect(c.sfsBase).toBe(20000 * 10);
    expect(c.afpBase).toBe(20000 * 20);
  });

  it("empleado de sueldo alto: reproducibilidad línea por línea", () => {
    // Prueba explícita con montos que se pueden verificar a mano.
    const salary = 60000;
    const c = computeTssContributions(salary);
    // 60000 * 0.0287 = 1722.00
    expect(c.afpEmployee).toBe(1722);
    // 60000 * 0.0304 = 1824.00
    expect(c.sfsEmployee).toBe(1824);
    // 60000 * 0.0710 = 4260.00
    expect(c.afpEmployer).toBe(4260);
    // 60000 * 0.0709 = 4254.00
    expect(c.sfsEmployer).toBe(4254);
    // 60000 * 0.01 = 600.00
    expect(c.infotep).toBe(600);
    // 60000 * 0.013 = 780.00
    expect(c.srl).toBe(780);
  });
});
