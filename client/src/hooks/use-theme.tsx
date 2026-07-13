import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "app:theme";

/**
 * Tema claro/oscuro.
 *
 * Tailwind está en `darkMode: ["class"]` y `index.css` ya define la paleta
 * completa bajo `.dark`, así que alternar esa clase en <html> basta: todo lo que
 * use tokens (`bg-background`, `text-foreground`, los componentes de shadcn)
 * cambia solo.
 *
 * Ojo: las páginas heredadas del POS traen colores fijos (`bg-white`,
 * `text-gray-900`), así que en modo oscuro se ven claras hasta que se migren a
 * tokens. El cambio es página por página, no una bandera global.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  return { theme, toggleTheme, setTheme };
}
