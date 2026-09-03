import { ReactNode } from "react";
import { useLocation } from "wouter";
import { useNavViews } from "@/components/layout/nav-model";

/**
 * Encabezado de pantalla — uno solo para las 97 páginas.
 *
 * Antes cada página escribía su propio <h1>: había 20 combinaciones distintas
 * de tamaño, peso y color, así que el título saltaba al navegar. Aquí el
 * rótulo por defecto sale del catálogo de vistas, que es el mismo que rotula
 * el menú: el título de la pantalla y su entrada de menú no pueden discrepar
 * porque son el mismo dato.
 *
 *   <PageHeader actions={<Button>Nueva factura</Button>} />
 *   <PageHeader title="Factura F-000123" subtitle="Borrador" />
 */
interface PageHeaderProps {
  /** Por defecto, el rótulo de la vista actual en el catálogo. */
  title?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Pestañas u otros controles bajo el título. */
  children?: ReactNode;
}

export function PageHeader({ title, subtitle, actions, children }: PageHeaderProps) {
  const [location] = useLocation();
  const { data: views = [] } = useNavViews();

  const path = location === "/" ? "/dashboard" : location;
  const fromCatalog = views.find((v) => v.route_path === path)?.label;
  const heading = title ?? fromCatalog ?? "";

  return (
    <div className="mb-3 border-b border-border pb-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold tracking-tight truncate">
            {heading}
          </h1>
          {subtitle && (
            <p className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
