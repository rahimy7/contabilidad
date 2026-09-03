import { describe, expect, it } from "vitest";
import { hiddenModuleKeys, sameKeys } from "../client/src/components/layout/nav-overflow";

/**
 * El caso que rompió la barra en producción: la franja de módulos se mide
 * cuando todavía no está dispuesta (al arrancar, o con la ventana bajo 1024px,
 * donde está en `display:none`). Ahí `clientWidth` y todos los anchos valen 0.
 *
 * La versión anterior concluía que cabía un módulo y escondía los otros siete
 * para siempre. La regla ahora es que sin medición no se esconde nada.
 */
const box = (key: string, left: number, width: number) => ({ key, left, width });

const MODULES = [
  box("ventas", 0, 80),
  box("compras", 82, 90),
  box("inventario", 174, 100),
  box("contabilidad", 276, 110),
];

describe("hiddenModuleKeys", () => {
  it("no esconde nada cuando el contenedor todavía no tiene ancho", () => {
    expect(hiddenModuleKeys(MODULES, 0).size).toBe(0);
  });

  it("no esconde nada cuando los elementos aún no tienen caja", () => {
    const sinCaja = MODULES.map((m) => ({ ...m, width: 0 }));
    expect(hiddenModuleKeys(sinCaja, 900).size).toBe(0);
  });

  it("no esconde nada con un ancho no numérico", () => {
    expect(hiddenModuleKeys(MODULES, Number.NaN).size).toBe(0);
  });

  it("no esconde nada cuando todo cabe", () => {
    expect(hiddenModuleKeys(MODULES, 400).size).toBe(0);
  });

  it("esconde sólo los que sobrepasan el borde", () => {
    // 280px deja entrar hasta `inventario` (174 + 100 = 274).
    const hidden = hiddenModuleKeys(MODULES, 280);
    expect([...hidden]).toEqual(["contabilidad"]);
  });

  it("esconde el que queda cortado a la mitad, no sólo el que empieza fuera", () => {
    // 200px corta `inventario`, que empieza dentro pero termina fuera.
    const hidden = hiddenModuleKeys(MODULES, 200);
    expect([...hidden].sort()).toEqual(["contabilidad", "inventario"]);
  });

  it("prefiere mostrar de más antes que dejar la barra vacía", () => {
    // Un ancho absurdamente pequeño escondería todo: eso es un fallo de
    // medición, no falta de espacio.
    expect(hiddenModuleKeys(MODULES, 1).size).toBe(0);
  });

  it("no se queda pegado: al ensancharse vuelve a mostrar", () => {
    expect(hiddenModuleKeys(MODULES, 200).size).toBe(2);
    expect(hiddenModuleKeys(MODULES, 900).size).toBe(0);
  });
});

describe("sameKeys", () => {
  it("distingue conjuntos con las mismas claves de los distintos", () => {
    expect(sameKeys(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(true);
    expect(sameKeys(new Set(["a"]), new Set(["a", "b"]))).toBe(false);
    expect(sameKeys(new Set(["a"]), new Set(["b"]))).toBe(false);
  });
});
