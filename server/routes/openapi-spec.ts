/**
 * OpenAPI 3.0 spec para la API pública v1.
 *
 * Consumible desde `/api/v1/openapi.json`. Se puede abrir en Swagger UI o
 * ReDoc apuntando a esa URL. También sirve para generar clientes SDK con
 * herramientas como openapi-generator o oazapfts.
 */

export const openapiSpec = {
  openapi: "3.0.3",
  info: {
    title: "ERP DR — API pública",
    description: "API REST para integraciones externas con el ERP dominicano. Autenticación por API key.",
    version: "1.0.0",
    contact: {
      name: "Soporte",
      email: "soporte@example.com",
    },
  },
  servers: [
    { url: "/api", description: "Servidor actual" },
  ],
  security: [
    { bearerAuth: [] },
    { apiKeyHeader: [] },
  ],
  paths: {
    "/v1/dashboard": {
      get: {
        summary: "Panel ejecutivo consolidado",
        description: "Retorna KPIs: ventas, cash, aging AR/AP, top clientes, top productos, alertas.",
        tags: ["Dashboard"],
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/DashboardResponse" } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
          429: { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/v1/fx/rate": {
      get: {
        summary: "Consulta de tasa de cambio",
        tags: ["Multi-moneda"],
        parameters: [
          { name: "from", in: "query", required: true, schema: { type: "string", example: "USD" } },
          { name: "to", in: "query", required: true, schema: { type: "string", example: "DOP" } },
          { name: "date", in: "query", schema: { type: "string", format: "date" } },
          { name: "rateType", in: "query", schema: { type: "string", enum: ["spot", "closing", "avg"] } },
        ],
        responses: {
          200: {
            description: "OK",
            content: { "application/json": { schema: {
              type: "object",
              properties: {
                from: { type: "string" }, to: { type: "string" },
                rate: { type: "number", nullable: true },
                date: { type: "string" },
              },
            } } },
          },
        },
      },
    },
    "/v1/orders": {
      get: {
        summary: "Listado de órdenes",
        tags: ["Órdenes"],
        parameters: [
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "from", in: "query", schema: { type: "string", format: "date" } },
          { name: "to", in: "query", schema: { type: "string", format: "date" } },
          { name: "limit", in: "query", schema: { type: "integer", maximum: 500 } },
        ],
        responses: {
          200: {
            description: "OK",
            content: { "application/json": { schema: {
              type: "object", properties: { rows: { type: "array", items: { $ref: "#/components/schemas/Order" } } },
            } } },
          },
        },
      },
    },
    "/v1/products": {
      get: {
        summary: "Catálogo de productos",
        tags: ["Productos"],
        parameters: [
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "category", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", maximum: 500 } },
        ],
        responses: {
          200: {
            description: "OK",
            content: { "application/json": { schema: {
              type: "object", properties: { rows: { type: "array", items: { $ref: "#/components/schemas/Product" } } },
            } } },
          },
        },
      },
    },
    "/v1/customers": {
      get: {
        summary: "Listado de clientes",
        tags: ["Clientes"],
        parameters: [
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", maximum: 500 } },
        ],
        responses: {
          200: {
            description: "OK",
            content: { "application/json": { schema: {
              type: "object", properties: { rows: { type: "array", items: { $ref: "#/components/schemas/Customer" } } },
            } } },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http", scheme: "bearer", bearerFormat: "sk_...",
        description: "Envía la API key en el header Authorization: Bearer sk_...",
      },
      apiKeyHeader: {
        type: "apiKey", in: "header", name: "x-api-key",
      },
    },
    responses: {
      Unauthorized: {
        description: "API key inválida o revocada",
        content: { "application/json": { schema: { type: "object", properties: { error: { type: "string" } } } } },
      },
      RateLimited: {
        description: "Rate limit excedido",
        content: { "application/json": { schema: { type: "object", properties: { error: { type: "string" } } } } },
      },
    },
    schemas: {
      DashboardResponse: {
        type: "object",
        properties: {
          asOf: { type: "string", format: "date" },
          currency: { type: "string" },
          sales: { type: "object" },
          cash: { type: "object" },
          arAging: { type: "object" },
          apAging: { type: "object" },
          topCustomers: { type: "array" },
          topProducts: { type: "array" },
        },
      },
      Order: {
        type: "object",
        properties: {
          id: { type: "integer" },
          orderNumber: { type: "string" },
          customerId: { type: "integer", nullable: true },
          status: { type: "string" },
          totalAmount: { type: "string" },
          currency: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Product: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          sku: { type: "string", nullable: true },
          category: { type: "string" },
          price: { type: "string" },
          stockQuantity: { type: "string", nullable: true },
          baseCurrency: { type: "string" },
          status: { type: "string" },
        },
      },
      Customer: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          phone: { type: "string", nullable: true },
          email: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
};
