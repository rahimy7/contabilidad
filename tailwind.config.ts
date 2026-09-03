import type { Config } from "tailwindcss";

/**
 * Los tokens de color viven en `index.css` como canales RGB sueltos. Envolverlos
 * aquí es lo que habilita el modificador de opacidad: `bg-primary/90`,
 * `border-warning/40`, `bg-destructive/10`. Con un color completo en el token,
 * Tailwind no puede componer alfa y descarta esas clases sin avisar.
 */
const token = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

/**
 * El radio, la sombra y la familia se redefinen aquí a propósito.
 *
 * Hay 48 archivos usando `shadow-lg`/`shadow-xl` y 11 usando `rounded-xl`.
 * Redefinir la escala en un solo lugar aplana todas esas pantallas sin abrirlas:
 * `shadow-lg` sigue existiendo, pero ahora vale lo que vale una sombra de
 * desplegable en un ERP, no la de una tarjeta de landing.
 */
export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Segoe UI"',
          '"Segoe UI Variable Text"',
          "system-ui",
          "-apple-system",
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        // 2px en toda la escala: `rounded-xl` heredado deja de ser una píldora.
        sm: "var(--radius)",
        md: "var(--radius)",
        lg: "var(--radius)",
        xl: "3px",
        "2xl": "4px",
        "3xl": "6px",
      },
      boxShadow: {
        sm: "0 1px 2px rgba(0, 0, 0, 0.04)",
        DEFAULT: "0 1px 2px rgba(0, 0, 0, 0.06)",
        md: "0 2px 4px rgba(0, 0, 0, 0.07)",
        lg: "0 4px 10px rgba(0, 0, 0, 0.09)",
        xl: "0 8px 16px rgba(0, 0, 0, 0.11)",
        "2xl": "0 12px 24px rgba(0, 0, 0, 0.13)",
        flyout: "0 4px 14px rgba(0, 0, 0, 0.14)",
      },
      colors: {
        background: token("--background"),
        foreground: token("--foreground"),
        /** Lienzo detrás del contenido, un punto más oscuro que las tarjetas. */
        appbg: token("--app-bg"),
        /** Cabeceras de rejilla y filas alternas. */
        subtle: token("--subtle"),
        card: {
          DEFAULT: token("--card"),
          foreground: token("--card-foreground"),
        },
        popover: {
          DEFAULT: token("--popover"),
          foreground: token("--popover-foreground"),
        },
        primary: {
          DEFAULT: token("--primary"),
          foreground: token("--primary-foreground"),
          hover: token("--primary-hover"),
        },
        secondary: {
          DEFAULT: token("--secondary"),
          foreground: token("--secondary-foreground"),
        },
        muted: {
          DEFAULT: token("--muted"),
          foreground: token("--muted-foreground"),
        },
        accent: {
          DEFAULT: token("--accent"),
          foreground: token("--accent-foreground"),
        },
        destructive: {
          DEFAULT: token("--destructive"),
          foreground: token("--destructive-foreground"),
        },
        warning: {
          DEFAULT: token("--warning"),
          foreground: token("--warning-foreground"),
        },
        success: {
          DEFAULT: token("--success"),
          foreground: token("--success-foreground"),
        },
        whatsapp: {
          DEFAULT: token("--whatsapp"),
          foreground: token("--whatsapp-foreground"),
        },
        /** Barra superior de identidad. */
        chrome: {
          DEFAULT: token("--chrome"),
          foreground: token("--chrome-foreground"),
          muted: token("--chrome-muted"),
          hover: token("--chrome-hover"),
        },
        border: {
          DEFAULT: token("--border"),
          strong: token("--border-strong"),
        },
        input: token("--input"),
        ring: token("--ring"),
        chart: {
          "1": token("--chart-1"),
          "2": token("--chart-2"),
          "3": token("--chart-3"),
          "4": token("--chart-4"),
          "5": token("--chart-5"),
        },
        sidebar: {
          DEFAULT: token("--sidebar-background"),
          foreground: token("--sidebar-foreground"),
          primary: token("--sidebar-primary"),
          "primary-foreground": token("--sidebar-primary-foreground"),
          accent: token("--sidebar-accent"),
          "accent-foreground": token("--sidebar-accent-foreground"),
          border: token("--sidebar-border"),
          ring: token("--sidebar-ring"),
        },
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: token("--radix-accordion-content-height") },
        },
        "accordion-up": {
          from: { height: token("--radix-accordion-content-height") },
          to: { height: "0" },
        },
        "flyout-in": {
          from: { opacity: "0", transform: "translateY(-3px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "flyout-in": "flyout-in 0.12s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
