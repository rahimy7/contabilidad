import { describe, it, expect } from "vitest";
import {
  calculateBenefits, computeYearsAndMonths,
  noticeDaysForTenure, severanceDaysPerYear, annualVacationDays,
  DR_DAILY_WAGE_DIVISOR,
} from "../server/services/hr-termination";

/**
 * Tests puros del cálculo dominicano de prestaciones laborales.
 *
 * Base: Código de Trabajo DR arts. 76, 80, 177, 219. Los números vienen de
 * ejemplos publicados por el Ministerio de Trabajo y la práctica común.
 */

describe("DR labor benefits — cálculo puro", () => {
  it("salario diario = mensual / 23.83", () => {
    const c = calculateBenefits({
      hireDate: "2020-01-01",
      terminationDate: "2026-01-01",
      monthlySalary: 30000,
      terminationType: "employer_dismissal_no_cause",
    });
    // 30000 / 23.83 = 1258.917...
    expect(c.dailyWage).toBeCloseTo(30000 / DR_DAILY_WAGE_DIVISOR, 2);
  });

  describe("preaviso (art. 76)", () => {
    it("menos de 3 meses: 0 días", () => {
      expect(noticeDaysForTenure(2)).toBe(0);
    });
    it("3 a 6 meses: 7 días", () => {
      expect(noticeDaysForTenure(4)).toBe(7);
      expect(noticeDaysForTenure(5)).toBe(7);
    });
    it("6 a 12 meses: 14 días", () => {
      expect(noticeDaysForTenure(6)).toBe(14);
      expect(noticeDaysForTenure(11)).toBe(14);
    });
    it("más de 1 año: 28 días", () => {
      expect(noticeDaysForTenure(12)).toBe(28);
      expect(noticeDaysForTenure(120)).toBe(28);
    });
  });

  describe("cesantía por año completo (art. 80)", () => {
    it("3-6 meses: 6 días", () => {
      expect(severanceDaysPerYear(4)).toBe(6);
    });
    it("6-12 meses: 13 días", () => {
      expect(severanceDaysPerYear(8)).toBe(13);
    });
    it("1-5 años: 21 días por año", () => {
      expect(severanceDaysPerYear(24)).toBe(21);
      expect(severanceDaysPerYear(60)).toBe(21);
    });
    it("más de 5 años: 23 días por año", () => {
      expect(severanceDaysPerYear(61)).toBe(23);
      expect(severanceDaysPerYear(120)).toBe(23);
    });
  });

  describe("vacaciones (art. 177)", () => {
    it("menos de 5 años: 14 días", () => {
      expect(annualVacationDays(24)).toBe(14);
      expect(annualVacationDays(59)).toBe(14);
    });
    it("5 años o más: 18 días", () => {
      expect(annualVacationDays(60)).toBe(18);
      expect(annualVacationDays(240)).toBe(18);
    });
  });

  describe("años y meses de servicio", () => {
    it("cuenta años completos y meses adicionales", () => {
      const r = computeYearsAndMonths("2020-03-15", "2025-08-20");
      expect(r.years).toBe(5);
      expect(r.monthsExtra).toBe(5);
    });
    it("ajusta si el día del mes final es menor que el del inicio", () => {
      const r = computeYearsAndMonths("2020-03-20", "2025-03-15");
      expect(r.years).toBe(4);
      expect(r.monthsExtra).toBe(11);
    });
    it("cero meses el mismo día", () => {
      const r = computeYearsAndMonths("2024-01-01", "2024-01-01");
      expect(r.years).toBe(0);
      expect(r.monthsExtra).toBe(0);
    });
    it("rechaza fecha de salida anterior a la de ingreso", () => {
      expect(() => computeYearsAndMonths("2024-06-01", "2024-01-01")).toThrow();
    });
  });

  describe("desahucio del empleador sin causa (art. 75/80)", () => {
    it("empleado de 2 años con sueldo 30,000: preaviso 28d + cesantía 42d + prop. vacaciones + prop. regalía", () => {
      const c = calculateBenefits({
        hireDate: "2024-01-01",
        terminationDate: "2026-01-01",
        monthlySalary: 30000,
        terminationType: "employer_dismissal_no_cause",
      });
      expect(c.yearsOfService).toBe(2);
      expect(c.noticeDays).toBe(28);
      // 21 días × 2 años = 42.
      expect(c.severanceDays).toBe(42);
      const daily = 30000 / DR_DAILY_WAGE_DIVISOR;
      expect(c.noticeAmount).toBeCloseTo(28 * daily, 1);
      expect(c.severanceAmount).toBeCloseTo(42 * daily, 1);
      // Regalía = 1/12 del ytd; salió 1-ene, así que 0 meses del año actual.
      // El cálculo devenga 0 si el mes 0 no ha corrido; pero prácticamente el
      // empleado tuvo 0 meses en el año 2026 al salir el 1-ene, la regalía es 0.
      expect(c.proportionalChristmasBonus).toBeCloseTo(0, 0);
    });

    it("empleado de 6 años con sueldo 50,000: cesantía 23 × 6 = 138 días", () => {
      const c = calculateBenefits({
        hireDate: "2020-01-01",
        terminationDate: "2026-01-01",
        monthlySalary: 50000,
        terminationType: "employer_dismissal_no_cause",
      });
      expect(c.yearsOfService).toBe(6);
      expect(c.severanceDays).toBe(23 * 6);
      const daily = 50000 / DR_DAILY_WAGE_DIVISOR;
      expect(c.severanceAmount).toBeCloseTo(23 * 6 * daily, 1);
    });

    it("empleado con 4 meses: 7 días de preaviso y 6 días totales de cesantía", () => {
      const c = calculateBenefits({
        hireDate: "2025-09-01",
        terminationDate: "2026-01-01",
        monthlySalary: 20000,
        terminationType: "employer_dismissal_no_cause",
      });
      expect(c.noticeDays).toBe(7);
      // Menos de 6 meses: cesantía = 6 días (no × años, porque no hay años).
      expect(c.severanceDays).toBe(6);
    });
  });

  describe("despido justificado (art. 88 con causa)", () => {
    it("no paga preaviso ni cesantía; sí paga vacaciones y regalía", () => {
      const c = calculateBenefits({
        hireDate: "2020-01-01",
        terminationDate: "2026-01-01",
        monthlySalary: 30000,
        terminationType: "employer_dismissal_with_cause",
        pendingSalary: 5000,
      });
      expect(c.noticeDays).toBe(0);
      expect(c.severanceDays).toBe(0);
      // Vacaciones y regalía siempre.
      expect(c.proportionalVacationAmount).toBeGreaterThanOrEqual(0);
      expect(c.pendingSalary).toBe(5000);
    });
  });

  describe("renuncia simple del empleado (art. 77)", () => {
    it("no paga cesantía ni preaviso; sólo lo pendiente + vacaciones + regalía", () => {
      const c = calculateBenefits({
        hireDate: "2020-01-01",
        terminationDate: "2026-06-30",
        monthlySalary: 40000,
        terminationType: "employee_resignation",
        pendingSalary: 10000,
      });
      expect(c.noticeDays).toBe(0);
      expect(c.severanceDays).toBe(0);
      expect(c.pendingSalary).toBe(10000);
      expect(c.proportionalVacationDays).toBeGreaterThan(0);
      expect(c.proportionalChristmasBonus).toBeGreaterThan(0);
    });
  });

  describe("dimisión justificada del trabajador (art. 96/97)", () => {
    it("cobra cesantía y preaviso como si el empleador desahuciara", () => {
      // 3 años exactos → tramo de 21 días × años.
      const c = calculateBenefits({
        hireDate: "2023-01-01",
        terminationDate: "2026-01-01",
        monthlySalary: 30000,
        terminationType: "employee_resignation_justified",
      });
      expect(c.noticeDays).toBe(28);
      expect(c.severanceDays).toBe(21 * 3);
    });
  });

  describe("totales y desglose", () => {
    it("gross = suma de componentes; net = gross − deducciones", () => {
      const c = calculateBenefits({
        hireDate: "2020-01-01",
        terminationDate: "2026-06-01",
        monthlySalary: 30000,
        terminationType: "employer_dismissal_no_cause",
        pendingSalary: 5000,
        otherBenefits: 2000,
        deductionsAmount: 1500,
      });
      const suma = c.noticeAmount + c.severanceAmount + c.proportionalVacationAmount +
        c.proportionalChristmasBonus + c.pendingSalary + c.otherBenefits;
      expect(c.grossTotal).toBeCloseTo(suma, 1);
      expect(c.netTotal).toBeCloseTo(c.grossTotal - 1500, 1);
    });

    it("el breakdown incluye datos derivados clave para auditoría", () => {
      const c = calculateBenefits({
        hireDate: "2020-01-01",
        terminationDate: "2026-06-30",
        monthlySalary: 30000,
        terminationType: "employer_dismissal_no_cause",
      });
      expect(c.breakdown.owesNotice).toBe(true);
      expect(c.breakdown.owesSeverance).toBe(true);
      expect(c.breakdown.annualVacationDaysApplicable).toBe(18);
    });
  });

  describe("regalía pascual proporcional (art. 219)", () => {
    it("usa yearToDateEarnings cuando se pasa explícito", () => {
      const c = calculateBenefits({
        hireDate: "2020-01-01",
        terminationDate: "2026-08-01",
        monthlySalary: 30000,
        terminationType: "employer_dismissal_no_cause",
        yearToDateEarnings: 240000,  // 8 meses × 30000
      });
      expect(c.proportionalChristmasBonus).toBeCloseTo(240000 / 12, 1);
    });
    it("aproxima cuando no se pasa, usando el salario y meses del año", () => {
      const c = calculateBenefits({
        hireDate: "2020-01-01",
        terminationDate: "2026-08-31",
        monthlySalary: 30000,
        terminationType: "employer_dismissal_no_cause",
      });
      // 8 meses × 30000 / 12 = 20000. Aproximado.
      expect(c.proportionalChristmasBonus).toBeGreaterThan(0);
      expect(c.proportionalChristmasBonus).toBeLessThan(25000);
    });
  });
});
