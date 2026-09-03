/**
 * Qué módulos no caben en la franja de módulos.
 *
 * La versión anterior contaba cuántos entraban y escondía el resto con estado.
 * Eso tenía un modo de fallo silencioso y pegajoso: si la barra se medía cuando
 * todavía no estaba dispuesta —al arrancar, o con la ventana bajo 1024px, donde
 * la franja está en `display:none` y todo mide 0— el cálculo concluía que cabía
 * un solo módulo, y como la medición ya no se repetía, la barra se quedaba con
 * Ventas y nada más aunque después hubiera sitio de sobra.
 *
 * La regla ahora es al revés: **sin medición fiable no se esconde nada**. Un
 * módulo desbordado se sigue montando y ocupando su sitio; sólo se vuelve
 * invisible y se ofrece en el menú "Más". Si la medida falla, el peor caso es
 * una barra recortada, nunca una barra vacía.
 */
export interface NavItemBox {
  key: string;
  /** Distancia del borde izquierdo del contenedor al del elemento. */
  left: number;
  width: number;
}

export function hiddenModuleKeys(boxes: NavItemBox[], available: number): Set<string> {
  const hidden = new Set<string>();

  // Sin ancho útil, o con elementos que aún no tienen caja, no hay nada que
  // decidir: mostrarlos todos es la respuesta segura.
  if (!Number.isFinite(available) || available <= 0) return hidden;
  if (boxes.length === 0 || boxes.some((b) => b.width <= 0)) return hidden;

  for (const b of boxes) {
    if (b.left + b.width > available) hidden.add(b.key);
  }

  // Esconderlos todos dejaría la barra en blanco: en ese caso el problema es la
  // medición, no el espacio.
  return hidden.size === boxes.length ? new Set() : hidden;
}

/** Dos conjuntos con las mismas claves — para no re-renderizar de más. */
export function sameKeys(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const k of a) if (!b.has(k)) return false;
  return true;
}
