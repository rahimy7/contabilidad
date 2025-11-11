import { Router, Request, Response } from 'express';
import { 
  processTextMessage, 
  interpretMessage,
  validateAIConfiguration,
  getAPIUsage
} from './ai-service';
import { processWhatsAppMessageWithAI } from './whatsapp-ai-handler';
import { authenticateToken } from './authMiddleware';
import { getTenantStorageWithSchema } from './routes.ts';

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
    const { messageText, customerId } = req.body;
    const user = (req as any).user;
    
    if (!messageText) {
      return res.status(400).json({ 
        error: 'messageText es requerido' 
      });
    }
    
    console.log('🤖 Analizando texto:', messageText);
    
    // Construir contexto si hay customerId
    let context;
    if (customerId) {
      const tenantStorage = await getTenantStorageWithSchema(user);
      const customer = await tenantStorage.getCustomerById(customerId);
      
      if (customer) {
        context = {
          customerId: customer.id,
          customerName: customer.name,
          recentMessages: []
        };
      }
    }
    
    // Procesar mensaje
    const result = await processTextMessage(messageText, context);
    
    res.json({
      success: true,
      ...result
    });
    
  } catch (error: any) {
    console.error('❌ Error analizando texto:', error);
    res.status(500).json({ 
      error: 'Error al analizar mensaje',
      details: error.message 
    });
  }
});

/**
 * POST /api/ai/process-voice
 * Procesar una nota de voz (simulación para testing)
 */
router.post('/ai/process-voice', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { mediaId } = req.body;
    const user = (req as any).user;
    
    if (!mediaId) {
      return res.status(400).json({ 
        error: 'mediaId es requerido' 
      });
    }
    
    res.json({
      success: false,
      error: 'Este endpoint requiere integración con WhatsApp Business API',
      message: 'Las notas de voz se procesan automáticamente desde el webhook de WhatsApp'
    });
    
  } catch (error: any) {
    console.error('❌ Error procesando voz:', error);
    res.status(500).json({ 
      error: 'Error al procesar nota de voz',
      details: error.message 
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
    const { messages } = req.body;
    
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ 
        error: 'Debe proporcionar un array de mensajes para analizar' 
      });
    }
    
    const results = [];
    
    for (const messageText of messages) {
      try {
        const interpretation = await interpretMessage(messageText);
        results.push({
          message: messageText,
          interpretation
        });
      } catch (error: any) {
        results.push({
          message: messageText,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      results
    });
    
  } catch (error: any) {
    console.error('❌ Error en test de interpretación:', error);
    res.status(500).json({ 
      error: 'Error al procesar test',
      details: error.message 
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
