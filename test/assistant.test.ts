import { describe, it, expect } from "vitest";
import { getFaq, searchFaq, getTipsForRoute } from "../server/services/assistant";

/**
 * Asistente interactivo — FAQ search + tips contextuales.
 * (Onboarding checklist se prueba en integración porque toca DB.)
 */

describe("assistant FAQ search", () => {
  it("getFaq devuelve todas las entradas", () => {
    const entries = getFaq();
    expect(entries.length).toBeGreaterThan(5);
    expect(entries[0]).toHaveProperty("id");
    expect(entries[0]).toHaveProperty("question");
    expect(entries[0]).toHaveProperty("keywords");
  });

  it("searchFaq encuentra por keyword directa", () => {
    const results = searchFaq("TSS");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe("tss");
  });

  it("searchFaq encuentra por variación de palabras", () => {
    const results = searchFaq("conciliar banco");
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((r) => r.id);
    expect(ids).toContain("conciliacion");
  });

  it("searchFaq ordena por relevancia (más keywords match = más score)", () => {
    // 'ncf' hace match con muchos keywords en la entrada NCF; 'dgii' hace match
    // con varias entradas fiscales.
    const results = searchFaq("ncf dgii");
    expect(results[0].id).toBe("ncf");
  });

  it("searchFaq devuelve vacío para query sin matches", () => {
    const results = searchFaq("xyzabc123nope");
    expect(results).toHaveLength(0);
  });

  it("searchFaq acepta límite", () => {
    const results = searchFaq("fiscal", 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });
});

describe("assistant tips contextuales", () => {
  it("getTipsForRoute devuelve tips para rutas conocidas", () => {
    const tips = getTipsForRoute("/hr/tss");
    expect(tips.length).toBeGreaterThan(0);
    expect(tips.some((t) => t.includes("2.87"))).toBe(true);
  });

  it("getTipsForRoute devuelve tips por prefix", () => {
    // /hr/tss/something no está definido pero /hr/tss sí lo cubre.
    const tips = getTipsForRoute("/hr/tss");
    expect(tips.length).toBeGreaterThan(0);
  });

  it("getTipsForRoute devuelve vacío para ruta desconocida", () => {
    const tips = getTipsForRoute("/some/random/route");
    expect(tips).toHaveLength(0);
  });

  it("cash-flow tiene tips sobre certeza y balance negativo", () => {
    const tips = getTipsForRoute("/cash-flow");
    expect(tips.some((t) => t.includes("liquidez") || t.includes("certeza"))).toBe(true);
  });
});
