import { ReactNode, useState } from "react";
import TopNav from "./top-nav";
import MobileNav from "./sidebar";
import { AssistantWidget } from "@/components/assistant-widget";

/**
 * El marco de la aplicación.
 *
 * La navegación pasó de columna a franja: en escritorio no hay nada a los lados
 * del contenido, y bajo 1024px la barra colapsa en el drawer de `sidebar.tsx`.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <TopNav onOpenMobileNav={() => setMobileNavOpen(true)} />

      <MobileNav isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      <main className="flex-1 overflow-auto p-3 md:p-4">
        {children}
      </main>

      <AssistantWidget />
    </div>
  );
}
