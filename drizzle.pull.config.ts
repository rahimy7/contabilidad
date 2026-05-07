import { defineConfig } from "drizzle-kit";

// Configuración SOLO para introspección (drizzle-kit pull) de la BD de producción.
// Genera el esquema en ./drizzle-prod-pull/ para comparar con shared/schema.ts.
// NO usar para push.

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL no definido");
}

export default defineConfig({
  out: "./drizzle-prod-pull",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  introspect: {
    casing: "camel",
  },
});
