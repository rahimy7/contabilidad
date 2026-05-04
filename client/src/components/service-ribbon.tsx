interface ServiceRibbonProps {
  size?: 'sm' | 'md';
}

/**
 * Cinta diagonal "SERVICIO" para distinguir productos tipo servicio de los tangibles.
 * El elemento padre DEBE tener `relative overflow-hidden` para que se recorte correctamente.
 *
 * Ejemplo:
 *   <div className="relative overflow-hidden">
 *     <ServiceRibbon />
 *     contenido de la tarjeta
 *   </div>
 */
export function ServiceRibbon({ size = 'md' }: ServiceRibbonProps) {
  if (size === 'sm') {
    return (
      <div className="absolute top-[6px] left-[-20px] w-[72px] rotate-[-45deg] bg-blue-600 text-white text-[8px] font-bold text-center py-[2px] shadow-sm z-10 pointer-events-none select-none">
        SERVICIO
      </div>
    );
  }
  return (
    <div className="absolute top-[10px] left-[-24px] w-[90px] rotate-[-45deg] bg-blue-600 text-white text-[9px] font-bold text-center py-[3px] shadow-md z-10 pointer-events-none select-none tracking-wide">
      SERVICIO
    </div>
  );
}

/** Devuelve true si el producto es de tipo servicio */
export function isServiceProduct(product: { type?: string; category?: string }): boolean {
  return product.type === 'service';
}
