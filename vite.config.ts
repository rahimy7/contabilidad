import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig(async () => {
  const plugins = [
      react({
      jsxRuntime: "automatic", // 👈 Esto activa el nuevo transform (React 17+)
    }),
    runtimeErrorOverlay(),
  ];

  // Solo agregar cartographer en desarrollo y si estamos en Replit
  if (process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined) {
    try {
      const cartographer = await import("@replit/vite-plugin-cartographer");
      plugins.push(cartographer.cartographer());
    } catch (error) {
      console.warn("Could not load cartographer plugin:", error);
    }
  }

  return {
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
        "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      },
    },
    root: path.resolve(import.meta.dirname, "client"),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
      chunkSizeWarningLimit: 1000, // Aumentar el límite para evitar warnings
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
            charts: ['recharts'],
          }
        }
      }
    },
    server: {
      host: 'localhost',
      port: 5173,
      allowedHosts: [
        'localhost',
        'contabilidad-production-667e.up.railway.app',
        '.railway.app',
      ],
      hmr: {
        host: 'localhost',
        port: 5173,
        protocol: 'ws',
        clientPort: 5173
      },
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
    preview: {
      host: '0.0.0.0',
      allowedHosts: [
        'localhost',
        'contabilidad-production-667e.up.railway.app',
        '.railway.app',
      ],
    },
  };
});