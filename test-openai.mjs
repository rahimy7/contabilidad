import OpenAI from "openai";
import "dotenv/config";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const r = await client.responses.create({
  model: "gpt-5-nano", // usa el ID exacto que ves en tu cuenta
  input: "Di 'OK' y nada más."
});

console.log("RESPUESTA:", r.output_text);
