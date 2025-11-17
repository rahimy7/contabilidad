# 🎙️ Transcripción de Notas de Voz - Quick Start

## En 3 pasos:

### 1️⃣ Configurar OpenAI API Key

```bash
# Edita tu archivo .env y agrega:
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Obtén la clave gratis en: https://platform.openai.com/api-keys
```

### 2️⃣ Reiniciar Servidor

```bash
# Ctrl+C para detener
# Luego:
npm run dev
# o
yarn dev
```

### 3️⃣ Probar

Envía una nota de voz a través de WhatsApp. El sistema automáticamente:
- ✅ Detecta que es audio
- ✅ Descarga de WhatsApp
- ✅ Transcribe con Whisper (OpenAI)
- ✅ Procesa como texto normal
- ✅ Genera orden automáticamente si aplica

---

## Verificar que Funciona

### En los Logs:
Busca estos mensajes:
```
🎙️ VOICE NOTE RECEIVED
📥 Downloading audio...
✅ Audio transcribed successfully
📝 Transcription: "tu transcripción aquí"
```

### En la Base de Datos:
```sql
SELECT id, content, messageType, created_at
FROM messages
WHERE messageType = 'audio'
ORDER BY created_at DESC
LIMIT 5;
```

Deberías ver mensajes con `messageType = 'audio'` y el contenido transcrito.

---

## Costos

**Whisper API:** $0.0001 por minuto de audio

- Nota de 1 minuto = $0.0001 (aproximadamente)
- Nota de 5 minutos = $0.0005
- Nota de 10 minutos = $0.001

---

## Solucionar Problemas

| Error | Solución |
|-------|----------|
| "OpenAI API key not configured" | Agregar `OPENAI_API_KEY` a `.env` |
| "WhatsApp config not found" | Verificar que WhatsApp está configurado en BD |
| Transcripción incompleta | Grabar con audio claro, sin ruido |
| El bot no responde | Ver logs para entender dónde falla |

---

## Archivos Modificados

- ✅ `server/audio-transcriber.ts` (NUEVO)
- ✅ `server/whatsapp-simple.ts` (MODIFICADO)

## Documentación Completa

Ver `VOICE_NOTE_TRANSCRIPTION.md` para detalles técnicos completos.

---

**¡Listo! Tu sistema de transcripción de notas de voz está funcionando.** 🚀
