import { describe, it, expect } from "vitest";
import { calculatePayslip, workedDays, isrFor, DEFAULT_CONCEPTS } from "../server/payroll/engine";
import { ratesFor, ceilings } from "../server/payroll/rates";

/**
 * The payslip calculation, without a database. Figures worked by hand with the
 * 2026 parameters: AFP 2.87% / SFS 3.04% employee, ceilings 434,880 / 217,440,
 * monthly ISR scale 34,685 / 52,027 / 72,260.
 */
const rates = ratesFor("2026-10-31");
const OCT = { periodStart: "2026-10-01", periodEnd: "2026-10-31", concepts: DEFAULT_CONCEPTS, rates };

describe("motor de nómina", () => {
  it("un salario de 50,000 sin variables da el volante clásico", () => {
    const p = calculatePayslip({ ...OCT, monthlySalary: "50000", inputs: [] });
    expect(p.earningsTotal).toBe("50000");
    expect(p.afpEmployee).toBe("1435");
    expect(p.sfsEmployee).toBe("1520");
    expect(p.isr).toBe("1854");
    expect(p.netPay).toBe("45191");
    expect(p.infotep).toBe("500");
  });

  it("las horas extra y la comisión cotizan y pagan ISR; la bonificación solo ISR", () => {
    const p = calculatePayslip({
      ...OCT, monthlySalary: "40000",
      inputs: [
        { code: "HE35", quantity: "10" },
        { code: "COMISION", amount: "5000" },
        { code: "BONIFICACION", amount: "3000" },
      ],
    });
    const hourly = 40000 / 23.83 / 8;
    const he = Math.round(10 * hourly * 1.35 * 100) / 100;
    expect(Number(p.earningsTotal)).toBeCloseTo(40000 + he + 5000 + 3000, 2);
    // TSS base excludes the bonificación.
    expect(Number(p.tssBase)).toBeCloseTo(40000 + he + 5000, 2);
    expect(Number(p.afpEmployee)).toBeCloseTo(Math.round((40000 + he + 5000) * 0.0287 * 100) / 100, 2);
    // ISR base includes it.
    expect(Number(p.isrBase)).toBeCloseTo(40000 + he + 5000 + 3000 - Number(p.afpEmployee) - Number(p.sfsEmployee), 2);
    expect(Number(p.infotep)).toBeCloseTo(Math.round((40000 + he + 5000) * 0.01 * 100) / 100, 2);
  });

  it("aplica los topes de AFP y SFS en salarios altos", () => {
    const p = calculatePayslip({ ...OCT, monthlySalary: "500000", inputs: [] });
    const cap = ceilings(rates);
    expect(Number(p.afpEmployee)).toBeCloseTo(Number(cap.afp) * 0.0287, 2);
    expect(Number(p.sfsEmployee)).toBeCloseTo(Number(cap.sfs) * 0.0304, 2);
    expect(Number(p.srl)).toBeCloseTo(Number(cap.srl) * Number(rates.srl), 2);
  });

  it("prorratea a un empleado que ingresa a mitad de mes", () => {
    // 15–31 oct 2026: 12 días hábiles + 3 sábados como medio día = 13.5.
    expect(workedDays("2026-10-01", "2026-10-31", "2026-10-15", null)).toBe("13.5");
    const p = calculatePayslip({ ...OCT, monthlySalary: "20000", hireDate: "2026-10-15", inputs: [] });
    expect(Number(p.baseSalary)).toBeCloseTo(Math.round((20000 / 23.83) * 13.5 * 100) / 100, 2);
  });

  it("un mes completo paga el salario exacto, sin redondeo de prorrateo", () => {
    expect(workedDays("2026-10-01", "2026-10-31", "2020-01-01", null)).toBeNull();
    expect(calculatePayslip({ ...OCT, monthlySalary: "33333.33", inputs: [] }).baseSalary).toBe("33333.33");
  });

  it("descuenta préstamos del neto sin tocar la base de impuestos", () => {
    const sin = calculatePayslip({ ...OCT, monthlySalary: "30000", inputs: [] });
    const con = calculatePayslip({ ...OCT, monthlySalary: "30000", inputs: [{ code: "PRESTAMO", amount: "2500" }] });
    expect(con.isr).toBe(sin.isr);
    expect(Number(sin.netPay) - Number(con.netPay)).toBeCloseTo(2500, 2);
  });

  it("rechaza deducciones mayores que los ingresos y conceptos desconocidos", () => {
    expect(() => calculatePayslip({ ...OCT, monthlySalary: "10000", inputs: [{ code: "PRESTAMO", amount: "20000" }] })).toThrow(/superan/);
    expect(() => calculatePayslip({ ...OCT, monthlySalary: "10000", inputs: [{ code: "XYZ", amount: "1" }] })).toThrow(/desconocido/);
  });

  it("recorre la escala mensual de ISR", () => {
    expect(isrFor("34685", rates)).toBe("0");
    expect(isrFor("52027", rates)).toBe("2601.3");
    expect(isrFor("72260", rates)).toBe("6647.9");
    expect(isrFor("112908", rates)).toBe("16809.9");
  });
});
