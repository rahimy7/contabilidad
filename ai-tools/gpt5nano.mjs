// ai-tools/gpt5nano.mjs
import OpenAI from "openai";
import fs from "fs/promises";
import "dotenv/config";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
console.log("🔧 Iniciando gpt5nano…");

// Uso: node ai-tools/gpt5nano.mjs "<ruta-archivo>" --mode=explain|refactor|tests --out
const args = process.argv.slice(2);
const filePath = args[0];
const modeArg = args.find(a => a.startsWith("--mode")) || "--mode=explain";
const mode = modeArg.split("=")[1] || "explain";
const saveOut = args.includes("--out");

if (!filePath) {
  console.error('Falta la ruta del archivo. Ej.: node ai-tools/gpt5nano.mjs "C:\\ruta\\archivo.ts" --mode=explain');
  process.exit(1);
}

const PROMPTS = {
  explain: "Explica el archivo y señala problemas de seguridad, validaciones, manejo de errores y diseño. Devuelve lista numerada con ejemplos concretos de cambios.",
  refactor: "Propón un refactor seguro y escalable. Indica PRIMEROS los cambios clave; luego muestra fragmentos de código específicos.",
  tests: "Propón pruebas unitarias y de integración. Enumera casos y ejemplos de tests (framework genérico)."
};

function estimateTokens(s) { return Math.ceil((s || "").length / 4); } // aproximación

async function runOnce(modelId, header, code) {
  console.log(`\n⚙️  Modelo: ${modelId}`);
  const res = await client.responses.create({
    model: modelId,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: header },
          { type: "input_text", text: code.slice(0, 120_000) } // si es muy grande, partir por secciones
        ]
      }
    ]
  });
  return res.output_text || "";
}

(async () => {
  // lee archivo
  const code = await fs.readFile(filePath, "utf8");
  const header = `MODO: ${mode.toUpperCase()}. ${PROMPTS[mode] || PROMPTS.explain}`;

  // prueba con estos modelos en orden (por si alguno no está habilitado en tu cuenta)
  const CANDIDATES = ["gpt-5-nano", "gpt-4o-mini"];

  let text = "";
  let usedModel = "";

  for (const m of CANDIDATES) {
    try {
      text = await runOnce(m, header, code);
      usedModel = m;
      break;
    } catch (err) {
      const message = err?.message || String(err);
      // si es un "modelo no encontrado/no permitido", intenta el siguiente
      const isModelError = /model|not found|unsupported|permission|Unknown model/i.test(message);
      console.warn(`⚠️  Falló con ${m}: ${message}`);
      if (!isModelError) throw err; // si es otro error (clave/red), no sigas
    }
  }

  if (!text) {
    throw new Error("No fue posible generar salida con los modelos probados.");
  }

  // salida
  const inTok = estimateTokens(header + code.slice(0, 120_000));
  const outTok = estimateTokens(text);

  console.log("\n=== RESULTADO ===\n");
  console.log(text);

  if (saveOut) {
    const outFile = filePath + `.ai.${mode}.md`;
    await fs.writeFile(outFile, text, "utf8");
    console.log(`\n[Guardado] ${outFile}`);
  }

  // estimación de coste (usa precios públicos de referencia)
  const pricing = {
    "gpt-5-nano": { in: 0.05, out: 0.40 },   // USD por 1M tokens
    "gpt-4o-mini": { in: 0.15, out: 0.60 }
  };

  const p = pricing[usedModel] || pricing["gpt-4o-mini"];
  const costIn = (inTok / 1_000_000) * p.in;
  const costOut = (outTok / 1_000_000) * p.out;

  console.log(`\n[Modelo usado] ${usedModel}`);
  console.log(`[Estimación] input≈${inTok} tok, output≈${outTok} tok, costo≈$${(costIn + costOut).toFixed(4)} USD`);
})().catch((err) => {
  console.error("\n❌ Error:", err?.status || "", err?.message || err);
  if (err?.response) {
    try { console.error("Detalles:", JSON.stringify(err.response, null, 2)); } catch {}
  }
  process.exit(1);
});
