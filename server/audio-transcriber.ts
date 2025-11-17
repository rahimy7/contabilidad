import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';
import FormData from 'form-data';

/**
 * Servicio de transcripción de notas de voz
 * Descarga el archivo de audio de WhatsApp y lo transcribe usando Whisper API
 */

interface AudioMediaObject {
  id: string;
  mime_type?: string;
}

interface TranscriptionResult {
  success: boolean;
  transcription?: string;
  error?: string;
}

export class AudioTranscriber {
  private whatsappAccessToken: string;
  private openaiApiKey: string;
  private tempDir: string = path.join(process.cwd(), 'temp-audio');

  constructor(whatsappAccessToken: string, openaiApiKey: string) {
    this.whatsappAccessToken = whatsappAccessToken;
    this.openaiApiKey = openaiApiKey;

    // Crear directorio temporal si no existe
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Detecta si un mensaje es una nota de voz
   */
  isAudioMessage(messageType: string): boolean {
    return messageType === 'audio';
  }

  /**
   * Descarga el archivo de audio desde la API de WhatsApp
   * Primero obtiene la URL del archivo y luego lo descarga
   */
  async downloadAudioFromWhatsApp(audioMediaId: string): Promise<Buffer> {
    try {
      console.log(`🎙️ Downloading audio from WhatsApp - Media ID: ${audioMediaId}`);

      // Paso 1: Obtener la URL del archivo de audio
      const mediaUrl = await this.getMediaUrl(audioMediaId);
      console.log(`✅ Got media URL from WhatsApp: ${mediaUrl.substring(0, 50)}...`);

      // Paso 2: Descargar el archivo
      const audioBuffer = await this.downloadFile(mediaUrl);
      console.log(`✅ Audio downloaded successfully - Size: ${audioBuffer.length} bytes`);

      return audioBuffer;
    } catch (error) {
      console.error(`❌ Error downloading audio from WhatsApp:`, error);
      if (error instanceof Error) {
        console.error(`❌ Error details: ${error.message}`);
        console.error(`❌ Error stack: ${error.stack}`);
      }
      throw error;
    }
  }

  /**
   * Obtiene la URL del archivo de media desde la API de WhatsApp
   */
  private async getMediaUrl(mediaId: string): Promise<string> {
    try {
      const url = `https://graph.facebook.com/v18.0/${mediaId}/?access_token=${this.whatsappAccessToken}`;
      console.log(`🔍 Fetching media URL from: https://graph.facebook.com/v18.0/${mediaId}/`);

      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ WhatsApp API error response: ${errorText}`);
        throw new Error(
          `Failed to get media URL: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data: any = await response.json();
      console.log(`📦 Media response data:`, JSON.stringify(data, null, 2));

      if (!data.url) {
        throw new Error('No URL in media response');
      }

      return data.url;
    } catch (error) {
      console.error(`❌ Error getting media URL from WhatsApp:`, error);
      if (error instanceof Error) {
        console.error(`❌ Error message: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Descarga un archivo desde una URL
   */
  private async downloadFile(url: string): Promise<Buffer> {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.whatsappAccessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to download file: ${response.status} ${response.statusText}`
        );
      }

      const buffer = await response.buffer();
      return buffer;
    } catch (error) {
      console.error(`❌ Error downloading file:`, error);
      throw error;
    }
  }

  /**
   * Transcribe un archivo de audio usando Whisper API de OpenAI
   */
  async transcribeAudio(audioBuffer: Buffer, mimeType: string = 'audio/ogg'): Promise<TranscriptionResult> {
    let tempFilePath: string | null = null;

    try {
      console.log(`🎤 Transcribing audio using Whisper API...`);

      // Determinar extensión basada en MIME type
      const ext = this.getFileExtensionFromMimeType(mimeType);
      const filename = `audio-${Date.now()}.${ext}`;
      tempFilePath = path.join(this.tempDir, filename);

      // Guardar buffer a archivo temporal
      fs.writeFileSync(tempFilePath, audioBuffer);
      console.log(`📁 Audio saved to temporary file: ${tempFilePath}`);

      // Crear FormData con el archivo
      const formData = new FormData();
      formData.append('file', fs.createReadStream(tempFilePath), filename);
      formData.append('model', 'whisper-1');
      formData.append('language', 'es'); // Idioma español

      // Enviar a Whisper API
      console.log(`📤 Sending audio to Whisper API (${audioBuffer.length} bytes, format: ${ext})`);
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.openaiApiKey}`,
        },
        body: formData as any,
      });

      console.log(`📥 Whisper API response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Whisper API error: ${response.status} - ${errorText}`);
        throw new Error(
          `Whisper API failed: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const result: any = await response.json();
      const transcription = result.text?.trim() || '';

      console.log(`✅ Audio transcribed successfully`);
      console.log(`📝 Transcription: "${transcription}"`);

      return {
        success: true,
        transcription,
      };
    } catch (error) {
      console.error(`❌ Error transcribing audio:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during transcription',
      };
    } finally {
      // Limpiar archivo temporal
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
          console.log(`🗑️ Temporary audio file cleaned up`);
        } catch (cleanupError) {
          console.warn(`⚠️ Could not delete temporary file:`, cleanupError);
        }
      }
    }
  }

  /**
   * Método conveniente: descarga y transcribe en un paso
   */
  async downloadAndTranscribe(
    audioMediaId: string,
    mimeType: string = 'audio/ogg'
  ): Promise<TranscriptionResult> {
    try {
      // Descargar audio desde WhatsApp
      const audioBuffer = await this.downloadAudioFromWhatsApp(audioMediaId);

      // Transcribir usando Whisper
      const result = await this.transcribeAudio(audioBuffer, mimeType);

      return result;
    } catch (error) {
      console.error(`❌ Error in downloadAndTranscribe:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Obtiene la extensión de archivo según el MIME type
   */
  private getFileExtensionFromMimeType(mimeType: string): string {
    const mimeTypeMap: Record<string, string> = {
      'audio/ogg': 'ogg',
      'audio/mpeg': 'mp3',
      'audio/mp4': 'mp4',
      'audio/wav': 'wav',
      'audio/webm': 'webm',
      'audio/aac': 'aac',
    };

    return mimeTypeMap[mimeType] || 'ogg'; // Default a OGG (formato por defecto de WhatsApp)
  }

  /**
   * Limpia archivos temporales antiguos (más de 1 hora)
   */
  async cleanupOldFiles(): Promise<void> {
    try {
      if (!fs.existsSync(this.tempDir)) {
        return;
      }

      const files = fs.readdirSync(this.tempDir);
      const now = Date.now();
      const oneHourInMs = 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stats = fs.statSync(filePath);
        const fileAge = now - stats.mtimeMs;

        if (fileAge > oneHourInMs) {
          fs.unlinkSync(filePath);
          console.log(`🗑️ Cleaned up old temporary file: ${file}`);
        }
      }
    } catch (error) {
      console.warn(`⚠️ Error during cleanup of old files:`, error);
    }
  }
}

/**
 * Crea una instancia del transcriptor
 */
export function createAudioTranscriber(
  whatsappAccessToken: string,
  openaiApiKey: string
): AudioTranscriber {
  return new AudioTranscriber(whatsappAccessToken, openaiApiKey);
}
