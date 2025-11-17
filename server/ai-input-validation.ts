/**
 * AI INPUT VALIDATION
 *
 * Funciones de validación para entrada de datos en rutas de IA
 * Validación de tipos, rangos, formatos y contenido
 */

// ========================================
// TIPOS PERSONALIZADOS
// ========================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface TextValidationOptions {
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  allowEmpty?: boolean;
}

// ========================================
// VALIDADORES GENÉRICOS
// ========================================

/**
 * Validar que un valor es un número entero positivo
 */
export function validatePositiveInteger(
  value: any,
  fieldName: string,
  options?: { min?: number; max?: number }
): ValidationResult {
  const errors: string[] = [];

  if (value === null || value === undefined) {
    errors.push(`❌ ${fieldName} es requerido`);
    return { valid: false, errors };
  }

  const num = Number(value);
  if (!Number.isInteger(num)) {
    errors.push(`❌ ${fieldName} debe ser un número entero`);
    return { valid: false, errors };
  }

  if (num <= 0) {
    errors.push(`❌ ${fieldName} debe ser mayor que 0`);
    return { valid: false, errors };
  }

  if (options?.min && num < options.min) {
    errors.push(`❌ ${fieldName} debe ser >= ${options.min}`);
  }

  if (options?.max && num > options.max) {
    errors.push(`❌ ${fieldName} debe ser <= ${options.max}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validar que un valor es texto válido
 */
export function validateText(
  value: any,
  fieldName: string,
  options: TextValidationOptions = {}
): ValidationResult {
  const errors: string[] = [];
  const {
    minLength = 1,
    maxLength = 5000,
    pattern,
    allowEmpty = false
  } = options;

  if (value === null || value === undefined) {
    if (!allowEmpty) {
      errors.push(`❌ ${fieldName} es requerido`);
    }
    return { valid: false, errors };
  }

  if (typeof value !== 'string') {
    errors.push(`❌ ${fieldName} debe ser texto`);
    return { valid: false, errors };
  }

  const trimmed = value.trim();

  if (trimmed.length === 0 && !allowEmpty) {
    errors.push(`❌ ${fieldName} no puede estar vacío`);
    return { valid: false, errors };
  }

  if (trimmed.length < minLength) {
    errors.push(`❌ ${fieldName} debe tener al menos ${minLength} caracteres`);
  }

  if (trimmed.length > maxLength) {
    errors.push(`❌ ${fieldName} no puede exceder ${maxLength} caracteres`);
  }

  if (pattern && !pattern.test(trimmed)) {
    errors.push(`❌ ${fieldName} tiene un formato inválido`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validar que es un array
 */
export function validateArray(
  value: any,
  fieldName: string,
  options?: { minLength?: number; maxLength?: number }
): ValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(value)) {
    errors.push(`❌ ${fieldName} debe ser un array`);
    return { valid: false, errors };
  }

  if (value.length === 0) {
    errors.push(`❌ ${fieldName} no puede estar vacío`);
    return { valid: false, errors };
  }

  if (options?.minLength && value.length < options.minLength) {
    errors.push(`❌ ${fieldName} debe tener al menos ${options.minLength} elementos`);
  }

  if (options?.maxLength && value.length > options.maxLength) {
    errors.push(`❌ ${fieldName} no puede exceder ${options.maxLength} elementos`);
  }

  return { valid: errors.length === 0, errors };
}

// ========================================
// VALIDADORES ESPECÍFICOS DE IA
// ========================================

/**
 * Validar payload de análisis de texto
 */
export function validateTextAnalysisPayload(payload: any): ValidationResult {
  const errors: string[] = [];

  // Validar messageText
  const messageValidation = validateText(payload.messageText, 'messageText', {
    minLength: 1,
    maxLength: 5000
  });
  if (!messageValidation.valid) {
    errors.push(...messageValidation.errors);
  }

  // Validar customerId (opcional)
  if (payload.customerId !== undefined && payload.customerId !== null) {
    const customerValidation = validatePositiveInteger(payload.customerId, 'customerId');
    if (!customerValidation.valid) {
      errors.push(...customerValidation.errors);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validar payload de test de interpretación
 */
export function validateTestInterpretationPayload(payload: any): ValidationResult {
  const errors: string[] = [];

  // Validar messages array
  const messagesValidation = validateArray(payload.messages, 'messages', {
    minLength: 1,
    maxLength: 100
  });
  if (!messagesValidation.valid) {
    errors.push(...messagesValidation.errors);
    return { valid: false, errors };
  }

  // Validar cada mensaje
  for (let i = 0; i < payload.messages.length; i++) {
    const msg = payload.messages[i];
    const msgValidation = validateText(msg, `messages[${i}]`, {
      minLength: 1,
      maxLength: 5000
    });
    if (!msgValidation.valid) {
      errors.push(...msgValidation.errors);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validar payload de procesamiento de voz
 */
export function validateVoiceProcessingPayload(payload: any): ValidationResult {
  const errors: string[] = [];

  // Validar mediaId
  const mediaValidation = validateText(payload.mediaId, 'mediaId', {
    minLength: 1,
    maxLength: 500
  });
  if (!mediaValidation.valid) {
    errors.push(...mediaValidation.errors);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validar que el usuario tiene permisos necesarios
 */
export function validateUserPermissions(
  user: any,
  requiredRoles: string[]
): ValidationResult {
  const errors: string[] = [];

  if (!user) {
    errors.push('❌ Usuario no autenticado');
    return { valid: false, errors };
  }

  if (!user.storeId || user.storeId <= 0) {
    errors.push('❌ ID de tienda inválido');
    return { valid: false, errors };
  }

  if (!user.role) {
    errors.push('❌ Rol de usuario no definido');
    return { valid: false, errors };
  }

  if (requiredRoles.length > 0 && !requiredRoles.includes(user.role)) {
    errors.push(`❌ Acceso denegado. Se requieren permisos: ${requiredRoles.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validar que el mensaje no contiene contenido prohibido
 */
export function validateMessageContent(text: string): ValidationResult {
  const errors: string[] = [];

  if (!text || typeof text !== 'string') {
    return { valid: true, errors };
  }

  // Validar que no es solo caracteres especiales
  if (!/[a-zA-Z0-9\w\s]/.test(text)) {
    errors.push('❌ El mensaje debe contener al menos un carácter válido');
  }

  // Validar longitud razonable
  if (text.length > 5000) {
    errors.push('❌ El mensaje es demasiado largo');
  }

  // Validar que no es solo URLs (prevención de spam)
  const urlCount = (text.match(/https?:\/\//gi) || []).length;
  if (urlCount > 10) {
    errors.push('❌ Demasiadas URLs en el mensaje');
  }

  return { valid: errors.length === 0, errors };
}

// ========================================
// FUNCIONES DE SANITIZACIÓN
// ========================================

/**
 * Sanitizar texto para entrada de IA
 */
export function sanitizeText(text: string): string {
  if (typeof text !== 'string') {
    return '';
  }

  return text
    .trim()
    .replace(/\n\n+/g, '\n') // Múltiples saltos de línea a uno solo
    .replace(/\s+/g, ' ')     // Espacios múltiples a uno
    .substring(0, 5000);       // Limitar longitud
}

/**
 * Sanitizar y validar customerId
 */
export function sanitizeCustomerId(value: any): number | null {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
}

// ========================================
// VALIDACIÓN COMBINADA
// ========================================

/**
 * Validación completa para endpoints de IA
 */
export function validateAIRequest(
  user: any,
  payload: any,
  type: 'text' | 'voice' | 'test',
  requiredRoles?: string[]
): ValidationResult {
  const errors: string[] = [];

  // Validar usuario
  const userValidation = validateUserPermissions(
    user,
    requiredRoles || ['admin', 'super_admin', 'user']
  );
  if (!userValidation.valid) {
    errors.push(...userValidation.errors);
  }

  // Validar payload según tipo
  let payloadValidation: ValidationResult;

  switch (type) {
    case 'text':
      payloadValidation = validateTextAnalysisPayload(payload);
      break;
    case 'voice':
      payloadValidation = validateVoiceProcessingPayload(payload);
      break;
    case 'test':
      payloadValidation = validateTestInterpretationPayload(payload);
      break;
    default:
      payloadValidation = { valid: false, errors: ['Tipo de validación desconocido'] };
  }

  if (!payloadValidation.valid) {
    errors.push(...payloadValidation.errors);
  }

  // Validar contenido del mensaje si aplica
  if (type === 'text' && payload.messageText) {
    const contentValidation = validateMessageContent(payload.messageText);
    if (!contentValidation.valid) {
      errors.push(...contentValidation.errors);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Función para crear respuesta de error estándar
 */
export function createValidationErrorResponse(validationResult: ValidationResult) {
  return {
    success: false,
    error: 'Validación fallida',
    details: validationResult.errors.join('; '),
    code: 'VALIDATION_ERROR'
  };
}
