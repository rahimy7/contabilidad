# 🎙️ Sistema de Transcripción de Notas de Voz

## Descripción General

Este sistema permite que tu aplicación de WhatsApp reciba notas de voz (audio notes) de clientes, las descargue desde los servidores de Meta/WhatsApp, y las transciba automáticamente usando la API de Whisper de OpenAI.

## Flujo de Procesamiento

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1️⃣  Cliente envía nota de voz por WhatsApp                         │
└─────────────────┬───────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2️⃣  Webhook de Meta recibe el mensaje con type: 'audio'           │
│     POST /webhook desde Meta API                                   │
└─────────────────┬───────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3️⃣  Handler detecta que es mensaje de tipo 'audio'                 │
│     (server/whatsapp-simple.ts:1949-1999)                          │
└─────────────────┬───────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4️⃣  Se obtienen credenciales                                        │
│     - WhatsApp Access Token (desde BD)                              │
│     - OpenAI API Key (desde .env)                                   │
└─────────────────┬───────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5️⃣  Se crea instancia de AudioTranscriber                           │
│     (server/audio-transcriber.ts)                                   │
└─────────────────┬───────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 6️⃣  Se descarga archivo de audio                                    │
│     - Obtener URL desde Meta Graph API                              │
│     - Descargar contenido del archivo                               │
└─────────────────┬───────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 7️⃣  Se transcribe usando Whisper API                                │
│     - Enviar audio a https://api.openai.com/v1/audio/transcriptions │
│     - Recibir texto transcrito en español                           │
└─────────────────┬───────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 8️⃣  El texto se procesa como mensaje normal                         │
│     - Se guarda en BD con tipo 'audio'                              │
│     - Se envía a IA para análisis                                   │
│     - Se procesa según flujos (órdenes, etc)                        │
└─────────────────┬───────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 9️⃣  Respuesta al cliente                                            │
│     El cliente ve el pedido procesado normalmente                   │
└─────────────────────────────────────────────────────────────────────┘
```

## Archivos Principales

### 1. **server/audio-transcriber.ts** (Nuevo)
Módulo independiente que maneja la transcripción de audio.

**Clase:** `AudioTranscriber`

**Métodos principales:**
- `isAudioMessage(messageType)` - Detecta si es audio
- `downloadAudioFromWhatsApp(audioMediaId)` - Descarga el archivo
- `transcribeAudio(audioBuffer, mimeType)` - Transcribe con Whisper
- `downloadAndTranscribe(audioMediaId, mimeType)` - Método combinado
- `cleanupOldFiles()` - Limpia archivos temporales antiguos

**Ejemplo de uso:**
```typescript
const transcriber = createAudioTranscriber(whatsappAccessToken, openaiApiKey);
const result = await transcriber.downloadAndTranscribe(mediaId, 'audio/ogg');

if (result.success) {
  const transcribedText = result.transcription;
  // Procesar el texto
} else {
  console.error('Error:', result.error);
}
```

### 2. **server/whatsapp-simple.ts** (Modificado)

#### Cambio 1: Detección de audio (líneas 1949-1999)
```typescript
} else if (messageType === 'audio') {
  // Obtener credenciales
  // Crear transcriptor
  // Descargar y transcribir
  // Usar el texto como messageText
}
```

#### Cambio 2: Pasar contenido procesado (línoas 2022)
```typescript
const processedContent = messageType === 'audio' ? messageText : undefined;
const saveResult = await ensureConversationAndSaveMessage(
  message,
  storeId,
  tenantStorage,
  processedContent  // ✅ NUEVO parámetro
);
```

#### Cambio 3: Aceptar contenido procesado (línea 2309)
```typescript
async function ensureConversationAndSaveMessage(
  message: any,
  storeId: number,
  tenantStorage: any,
  processedContent?: string  // ✅ NUEVO parámetro
)
```

## Requisitos

### 1. Variables de Entorno
Asegúrate de tener en tu archivo `.env`:
```env
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 2. WhatsApp Configuration
- Token de acceso de WhatsApp Business API guardado en la BD
- El `phoneNumberId` configurado correctamente

### 3. Módulos NPM
```json
{
  "dependencies": {
    "node-fetch": "^3.x",
    "form-data": "^4.x"
  }
}
```

## Estructura de Mensaje de Audio

Cuando WhatsApp envía una nota de voz, el webhook contiene:

```json
{
  "messages": [{
    "from": "34123456789",
    "id": "wamid.xxx=",
    "timestamp": 1234567890,
    "type": "audio",
    "audio": {
      "id": "media_id_123456",
      "mime_type": "audio/ogg"
    }
  }]
}
```

## Manejo de Errores

El sistema tiene múltiples niveles de validación:

1. **Validación de credenciales**
   - Si falta WhatsApp config → `messageText = '[VOICE_NOTE_ERROR]'`
   - Si falta OpenAI API Key → `messageText = '[VOICE_NOTE_ERROR]'`

2. **Validación de descarga**
   - Si no hay media ID → `messageText = '[VOICE_NOTE_ERROR]'`
   - Si falla la descarga → `messageText = '[VOICE_NOTE_ERROR]'`

3. **Validación de transcripción**
   - Si falla Whisper API → `messageText = '[VOICE_NOTE_ERROR]'`
   - Si no hay transcripción → `messageText = '[VOICE_NOTE_ERROR]'`

4. **Try-Catch general**
   - Cualquier error inesperado se captura y se registra

## Base de Datos

El mensaje se guarda con:
- `messageType: 'audio'` - Para identificar que fue una nota de voz
- `content: '<TRANSCRIPTION>'` - El texto transcrito
- `isFromCustomer: true` - Marcar como del cliente

Ejemplo de query para ver mensajes de audio:
```sql
SELECT id, content, created_at
FROM messages
WHERE messageType = 'audio'
ORDER BY created_at DESC;
```

## Logging

Todos los eventos se registran con prefijos:
- `🎙️` - Inicio de procesamiento de audio
- `📥` - Descarga en progreso
- `🎤` - Transcripción en progreso
- `✅` - Éxito
- `❌` - Errores

Ejemplo de logs:
```
🎙️ VOICE NOTE RECEIVED - From: 34123456789
📥 Downloading audio from WhatsApp (Media ID: abc123def456)...
✅ Got media URL from WhatsApp
✅ Audio downloaded successfully - Size: 45234 bytes
🎤 Transcribing audio using Whisper API...
✅ Audio transcribed successfully
📝 Transcription: "Quiero pedir una pizza mediana de pepperoni"
```

## Limitaciones Actuales

1. **Idioma**: Fijo a español (`language: 'es'`). Modificar en `audio-transcriber.ts` línea 117 para otros idiomas.

2. **Formato de audio**: Soporta todos los formatos que Whisper API acepta:
   - OGG (por defecto de WhatsApp)
   - MP3
   - MP4
   - WAV
   - WebM
   - AAC

3. **Tamaño máximo**: Whisper API tiene límite de 25 MB

4. **Tiempo de procesamiento**: Puede tardar algunos segundos dependiendo del tamaño del audio

## Configuración Avanzada

### Cambiar idioma de transcripción
En `audio-transcriber.ts` línea 116:
```typescript
// Cambiar de 'es' a otro código de idioma
formData.append('language', 'pt'); // Portugués
formData.append('language', 'en'); // Inglés
```

### Configurar temperatura/model
En `audio-transcriber.ts` línea 117:
```typescript
// Más opciones disponibles en Whisper API
formData.append('temperature', '0');  // 0-1, menor = más preciso
```

### Limpiar archivos antiguos
El sistema limpia automáticamente archivos de más de 1 hora. Para forzar limpieza manual:
```typescript
const transcriber = createAudioTranscriber(token, key);
await transcriber.cleanupOldFiles();
```

## Testing

Para probar el sistema:

1. **Manual**: Envía una nota de voz a través de WhatsApp
2. **Verificar logs**: Busca los prefijos 🎙️ y ✅ en los logs
3. **Verificar BD**: Query a la tabla messages con `messageType = 'audio'`
4. **Verificar IA**: Verifica que la transcripción se procesa con la IA normalmente

## Troubleshooting

### Error: "OpenAI API key not configured"
```
Solución: Agregar OPENAI_API_KEY a .env
```

### Error: "WhatsApp config not found"
```
Solución: Verificar que las credenciales de WhatsApp están guardadas en BD
```

### Error: "Failed to get media URL"
```
Solución: Verificar que el WhatsApp access token tiene permisos de lectura de media
```

### Transcripción incompleta o incorrecta
```
Solución: Verificar que el audio es claro y en español.
Whisper funciona mejor con audio de buena calidad.
```

## Costos

Cada transcripción consume créditos de OpenAI Whisper API:
- $0.0001 por minuto de audio

Por ejemplo:
- Audio de 1 minuto = $0.0001
- Audio de 10 minutos = $0.001
- Audio de 60 minutos = $0.006

## Seguridad

- Los archivos temporales se eliminan automáticamente después del procesamiento
- El token de WhatsApp se obtiene directamente de la BD
- El API key de OpenAI nunca se envía a terceros
- Los audios descargados solo se mantienen en memoria durante el procesamiento

## Próximas Mejoras

- [ ] Soporte para múltiples idiomas (detección automática)
- [ ] Caching de transcripciones (no retranscribir audios duplicados)
- [ ] Integración con reconocimiento de intención mejorado para audio
- [ ] Feedback de transcripción (permitir correcciones)
- [ ] Análisis de sentimiento en audios
