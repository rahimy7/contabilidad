import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import { nanoid } from "nanoid";
import { fileURLToPath } from 'url';

const viteLogger = createLogger();

// Manejar import.meta.dirname para compatibilidad con esbuild
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const vite = await createViteServer({
    root: path.resolve(process.cwd(), 'client'),
    resolve: {
      alias: {
        "@": path.resolve(process.cwd(), "client", "src"),
        "@shared": path.resolve(process.cwd(), "shared"),
        "@assets": path.resolve(process.cwd(), "attached_assets"),
      },
    },
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        // No salir del proceso en desarrollo
        if (process.env.NODE_ENV !== 'production') {
          viteLogger.error(msg, options);
        } else {
          viteLogger.error(msg, options);
          process.exit(1);
        }
      },
    },
    server: {
      middlewareMode: true,
      hmr: {
        server: server,
        port: 5173
      },
      // Permite hosts públicos (Railway, ngrok, etc.) cuando el server Express corre en dev
      allowedHosts: true as const,
    },
    appType: "custom",
  });

  app.use(vite.middlewares);
  
  // Manejar todas las rutas que no son API
  app.use("*", async (req, res, next) => {
    // Solo manejar rutas que no sean de API
    if (req.originalUrl.startsWith('/api/')) {
      return next();
    }

    const url = req.originalUrl;

    try {
      // Buscar index.html en client/
      const clientTemplate = path.resolve(process.cwd(), "client", "index.html");
      
      // Verificar que el archivo existe
      if (!fs.existsSync(clientTemplate)) {
        throw new Error(`Template not found: ${clientTemplate}`);
      }

      // Leer y transformar el template
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      
      // Agregar cache-busting
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      console.error('Error en setupVite:', e);
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });

  console.log('✅ Vite configurado correctamente con root: client/');
  return vite;
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "..", "dist", "public");

  if (!fs.existsSync(distPath)) {
    console.warn(`Build directory not found: ${distPath}`);
    console.warn('Make sure to run "yarn build" first for production');
    return;
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (req, res) => {
    // Solo manejar rutas que no sean de API
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });

  console.log('✅ Archivos estáticos configurados:', distPath);
}