import { Router, Request, Response } from 'express';
import {
  processTextMessage,
  interpretMessage,
  validateAIConfiguration,
  getAPIUsage
} from './ai-service';
import { authenticateToken } from './authMiddleware';
import { getTenantStorageWithSchema } from './routes.ts';
import { AICreditsManager } from './ai-credits-manager';
import {
  validateAIRequest,
  createValidationErrorResponse,
  sanitizeText,
  sanitizeCustomerId
} from './ai-input-validation';

const router = Router();

// ========================================
// ENDPOINTS DE IA
// ========================================

/**
 * POST /api/ai/analyze-text
 * Analizar un mensaje de texto con IA
 */
router.post('/ai/analyze-text', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const storeId = user.storeId;

    // ================================
    // VALIDACIÓN DE ENTRADA
    // ================================
    console.log(`🔍 [AI-TEXT] Validando solicitud...`);

    const validation = validateAIRequest(user, req.body, 'text');
    if (!validation.valid) {
      console.warn(`❌ [AI-TEXT] Validación fallida:`, validation.errors);
      return res.status(400).json(createValidationErrorResponse(validation));
    }

    // Sanitizar entrada
    const messageText = sanitizeText(req.body.messageText);
    const customerId = sanitizeCustomerId(req.body.customerId);

    console.log(`✅ [AI-TEXT] Entrada validada - Mensaje: ${messageText.length} caracteres`);

    // ================================
    // VERIFICACIÓN DE CRÉDITOS
    // ================================
    console.log(`💳 [AI-TEXT] Verificando créditos para tienda ${storeId}...`);

    const tenantStorage = await getTenantStorageWithSchema(user);
    const hasEnoughCredits = await AICreditsManager.hasCredits(
      storeId,
      'message',
      tenantStorage
    );

    if (!hasEnoughCredits) {
      console.warn(`❌ [AI-TEXT] Créditos insuficientes para tienda ${storeId}`);
      return res.status(402).json({
        success: false,
        error: 'Créditos insuficientes para procesar este mensaje con IA',
        details: 'Por favor, recarga tus créditos de IA para continuar',
        code: 'INSUFFICIENT_CREDITS'
      });
    }

    console.log(`✅ [AI-TEXT] Créditos disponibles para tienda ${storeId}`);
    console.log('🤖 Analizando texto:', messageText.substring(0, 100) + (messageText.length > 100 ? '...' : ''));

    // Construir contexto si hay customerId
    let context;
    if (customerId) {
      try {
        const customer = await tenantStorage.getCustomerById(customerId);

        if (customer) {
          context = {
            customerId: customer.id,
            customerName: customer.name,
            recentMessages: []
          };
          console.log(`👤 [AI-TEXT] Contexto del cliente cargado: ${customer.name}`);
        } else {
          console.warn(`⚠️ [AI-TEXT] Cliente ${customerId} no encontrado`);
        }
      } catch (error: any) {
        console.warn(`⚠️ [AI-TEXT] Error cargando contexto del cliente:`, error.message);
      }
    }

    // Procesar mensaje
    const result = await processTextMessage(messageText, context);

    // Consumir créditos después del procesamiento exitoso
    const creditsManager = new AICreditsManager(tenantStorage);
    await creditsManager.consumeCredits(storeId, 'message');
    console.log(`💰 [AI-TEXT] Créditos consumidos para tienda ${storeId}`);

    res.json({
      success: true,
      ...result
    });

  } catch (error: any) {
    console.error('❌ Error analizando texto:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error al analizar mensaje',
      details: error.message,
      code: 'PROCESSING_ERROR'
    });
  }
});

/**
 * POST /api/ai/process-voice
 * Procesar una nota de voz (simulación para testing)
 */
router.post('/ai/process-voice', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    // ================================
    // VALIDACIÓN DE ENTRADA
    // ================================
    console.log(`🔍 [AI-VOICE] Validando solicitud...`);

    const validation = validateAIRequest(user, req.body, 'voice');
    if (!validation.valid) {
      console.warn(`❌ [AI-VOICE] Validación fallida:`, validation.errors);
      return res.status(400).json(createValidationErrorResponse(validation));
    }

    const mediaId = req.body.mediaId.trim();
    console.log(`✅ [AI-VOICE] Entrada validada - mediaId: ${mediaId}`);

    res.json({
      success: false,
      error: 'Este endpoint requiere integración con WhatsApp Business API',
      message: 'Las notas de voz se procesan automáticamente desde el webhook de WhatsApp',
      code: 'INTEGRATION_REQUIRED'
    });

  } catch (error: any) {
    console.error('❌ Error procesando voz:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error al procesar nota de voz',
      details: error.message,
      code: 'PROCESSING_ERROR'
    });
  }
});

/**
 * GET /api/ai/config
 * Verificar configuración de IA
 */
router.get('/ai/config', authenticateToken, async (req: Request, res: Response) => {
  try {
    const isValid = validateAIConfiguration();
    
    res.json({
      configured: isValid,
      features: {
        textAnalysis: isValid,
        voiceTranscription: isValid,
        smartResponses: isValid
      },
      provider: 'OpenAI',
      models: {
        text: 'gpt-4o-mini',
        voice: 'whisper-1'
      }
    });
    
  } catch (error: any) {
    console.error('❌ Error obteniendo configuración:', error);
    res.status(500).json({ 
      error: 'Error al obtener configuración',
      details: error.message 
    });
  }
});

/**
 * GET /api/ai/usage
 * Obtener uso de la API de IA
 */
router.get('/ai/usage', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    
    // Verificar que sea admin
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return res.status(403).json({ 
        error: 'Acceso no autorizado' 
      });
    }
    
    const usage = await getAPIUsage();
    
    res.json({
      success: true,
      usage
    });
    
  } catch (error: any) {
    console.error('❌ Error obteniendo uso:', error);
    res.status(500).json({ 
      error: 'Error al obtener uso de API',
      details: error.message 
    });
  }
});

/**
 * POST /api/ai/test-interpretation
 * Endpoint de prueba para interpretar mensajes
 */
router.post('/ai/test-interpretation', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const storeId = user.storeId;

    // ================================
    // VALIDACIÓN DE ENTRADA
    // ================================
    console.log(`🔍 [AI-TEST] Validando solicitud...`);

    const validation = validateAIRequest(user, req.body, 'test');
    if (!validation.valid) {
      console.warn(`❌ [AI-TEST] Validación fallida:`, validation.errors);
      return res.status(400).json(createValidationErrorResponse(validation));
    }

    // Sanitizar mensajes
    const messages = req.body.messages.map(sanitizeText);
    console.log(`✅ [AI-TEST] Entrada validada - ${messages.length} mensajes`);

    // ================================
    // VERIFICACIÓN DE CRÉDITOS
    // ================================
    console.log(`💳 [AI-TEST] Verificando créditos para ${messages.length} mensajes (tienda ${storeId})...`);

    const tenantStorage = await getTenantStorageWithSchema(user);
    const hasEnoughCredits = await AICreditsManager.hasCredits(
      storeId,
      'message',
      tenantStorage
    );

    if (!hasEnoughCredits) {
      console.warn(`❌ [AI-TEST] Créditos insuficientes para tienda ${storeId}`);
      return res.status(402).json({
        success: false,
        error: 'Créditos insuficientes para procesar este test con IA',
        details: `Se requieren créditos para procesar ${messages.length} mensaje(s)`,
        code: 'INSUFFICIENT_CREDITS'
      });
    }

    console.log(`✅ [AI-TEST] Créditos disponibles - Procesando ${messages.length} mensajes`);

    const results = [];
    let successCount = 0;

    for (const messageText of messages) {
      try {
        const interpretation = await interpretMessage(messageText);
        results.push({
          message: messageText,
          interpretation,
          success: true
        });
        successCount++;
      } catch (error: any) {
        console.warn(`⚠️ [AI-TEST] Error procesando mensaje:`, error.message);
        results.push({
          message: messageText,
          error: error.message,
          success: false
        });
      }
    }

    // Consumir créditos después del procesamiento exitoso
    if (successCount > 0) {
      const creditsManager = new AICreditsManager(tenantStorage);
      // Consumir un crédito por cada mensaje procesado exitosamente
      for (let i = 0; i < successCount; i++) {
        await creditsManager.consumeCredits(storeId, 'message');
      }
      console.log(`💰 [AI-TEST] ${successCount} crédito(s) consumido(s) para tienda ${storeId}`);
    }

    res.json({
      success: true,
      processed: messages.length,
      successCount,
      failureCount: messages.length - successCount,
      results
    });

  } catch (error: any) {
    console.error('❌ Error en test de interpretación:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error al procesar test',
      details: error.message,
      code: 'PROCESSING_ERROR'
    });
  }
});

/**
 * GET /api/ai/analytics
 * Obtener analíticas de uso de IA
 */
router.get('/ai/analytics', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { startDate, endDate } = req.query;
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Aquí puedes implementar consultas específicas a tu base de datos
    // para obtener estadísticas de uso de IA
    
    res.json({
      success: true,
      analytics: {
        totalAnalyzed: 0,
        voiceNotesTranscribed: 0,
        autoResponsesSent: 0,
        averageConfidence: 0,
        categoryDistribution: {
          orders: 0,
          questions: 0,
          complaints: 0,
          greetings: 0,
          other: 0
        },
        sentimentDistribution: {
          positive: 0,
          neutral: 0,
          negative: 0
        }
      },
      message: 'Implementar consultas de analytics según tu esquema de base de datos'
    });
    
  } catch (error: any) {
    console.error('❌ Error obteniendo analytics:', error);
    res.status(500).json({ 
      error: 'Error al obtener analytics',
      details: error.message 
    });
  }
});

/**
 * POST /api/ai/settings
 * Configurar ajustes de IA
 */
router.post('/ai/settings', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { 
      autoRespondEnabled,
      minConfidenceLevel,
      responseDelay,
      enabledCategories 
    } = req.body;
    
    // Verificar que sea admin
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return res.status(403).json({ 
        error: 'Acceso no autorizado' 
      });
    }
    
    // Aquí guardarías los ajustes en la base de datos
    // Por ejemplo, en una tabla ai_settings
    
    res.json({
      success: true,
      message: 'Configuración actualizada',
      settings: {
        autoRespondEnabled,
        minConfidenceLevel,
        responseDelay,
        enabledCategories
      }
    });
    
  } catch (error: any) {
    console.error('❌ Error actualizando configuración:', error);
    res.status(500).json({ 
      error: 'Error al actualizar configuración',
      details: error.message 
    });
  }
});

export default router;
