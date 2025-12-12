/**
 * AI ORDER ASSISTANT
 *
 * Interpreta los mensajes del cliente, busca productos y crea la orden si se confirma.
 * Usa la misma lógica de whatsapp-simple.ts para crear pedidos reales.
 */
import { searchProducts } from './ai-product-search';
import { createOrderFromAI } from './ai-order-creator';
import { interpretMessage } from './ai-service';

interface Product {
  id: number;
  name: string;
  description: string;
  price: string;
  category: string;
  brand?: string;
  isActive: boolean;
}

interface OrderInterpretationItem {
  searchQuery: string;
  suggestedProduct?: Product;
  quantity: number;
  confidence: number;
}
export interface OrderInterpretation {
  intent:
    | "add_to_cart"
    | "remove_from_cart"
    | "confirm_order"
    | "ask_question"
    | "search_product"
    | "other";

  items: Array<{
    productId?: number;
    productName?: string;
    searchQuery?: string;
    suggestedProduct?: Product;
    quantity: number;
    confidence?: number;
  }>;

  message: string;
  confidence: number;
}



interface AIContext {
  storeId: number;
  customerId: number;
  token: string;
  apiBaseUrl: string;
  tenantStorage?: any;
  pendingProducts?: any[]; // Productos pendientes de selección
}

/**
 * Analizar mensaje con IA real usando OpenAI GPT-4o-mini
 * Extrae productos, cantidades e intención del mensaje
 */
async function analyzeMessageWithAI(message: string, context?: AIContext, recentMessages: any[] = []): Promise<OrderInterpretation> {
  try {
    console.log(`🤖 [AI-ASSISTANT] Analizando mensaje: "${message}"`);

    // 🔍 DETECTAR PREGUNTAS SOBRE PRODUCTOS PENDIENTES
    if (context?.pendingProducts && context.pendingProducts.length > 0) {
      const questionKeywords = ['qué', 'que', 'cuál', 'cual', 'cómo', 'como', 'diferencia', 'mejor', 'recomiendas', 'contiene', 'ingredientes', 'precio', 'cuesta'];
      const isQuestion = questionKeywords.some(kw => message.toLowerCase().includes(kw));
      
      if (isQuestion) {
        console.log(`❓ [AI-ASSISTANT] Pregunta detectada sobre productos pendientes`);
        // Analizar si pregunta sobre algún producto específico
        for (const product of context.pendingProducts) {
          const productWords = product.name.toLowerCase().split(/\s+/);
          const messageWords = message.toLowerCase().split(/\s+/);
          
          // Ver si menciona alguna palabra del producto
          const hasProductMention = productWords.some((pw: string) => 
            pw.length >= 3 && messageWords.some((mw: string) => mw.includes(pw) || pw.includes(mw))
          );
          
          if (hasProductMention) {
            console.log(`✅ [AI-ASSISTANT] Pregunta sobre producto: ${product.name}`);
            // Retornar como pregunta con el producto específico
            return {
              intent: 'ask_question',
              items: [{
                searchQuery: product.name,
                suggestedProduct: product,
                quantity: 1,
                confidence: 0.9
              }],
              message: `Claro, te hablo sobre *${product.name}*: ${product.description || 'Este producto está disponible a RD$' + product.price}`,
              confidence: 0.9
            };
          }
        }
        
        // Pregunta general sobre las opciones
        console.log(`❓ [AI-ASSISTANT] Pregunta general sobre opciones`);
        const productsInfo = context.pendingProducts.map((p: any) => 
          `${p.name} (RD$${p.price})`
        ).join(', ');
        
        return {
          intent: 'ask_question',
          items: [],
          message: `Actualmente tengo estas opciones disponibles: ${productsInfo}. ¿Sobre cuál te gustaría saber más?`,
          confidence: 0.8
        };
      }
    }

    // Usar interpretMessage real de ai-service
    const interpretation = await interpretMessage(message, context ? {
      customerId: context.customerId,
      customerName: `Customer ${context.customerId}`,
      recentMessages: recentMessages,
      pendingProducts: context.pendingProducts // Pasar productos pendientes
    } : undefined);

    console.log(`✅ [AI-ASSISTANT] Interpretación obtenida:`, interpretation);

    // Mapear categoría a intención
    let intent: 'add_to_cart' | 'remove_from_cart' | 'confirm_order' | 'ask_question' | 'search_product' | 'other' = 'search_product';

    // ✅ DETECTAR ACCIONES DE CARRITO
    const addToCartKeywords = ['agregar', 'añadir', 'agrégalo', 'añádelo', 'agrega', 'añade', 'agregame', 'añádeme', 'pon', 'ponme'];
    const removeFromCartKeywords = ['eliminar', 'elimina', 'quitar', 'quita', 'borrar', 'borra', 'sacar', 'saca', 'remover', 'remueve'];
    const confirmKeywords = ['si', 'sí', 'yes', 'ok', 'vale', 'adelante', 'claro', 'perfecto', 'exacto'];
    const confirmOrderKeywords = [
      'confirmar pedido', 'confirmar orden', 'confirmar todo', 'proceder con el pedido', 'finalizar',
      'confirmación de pedido', 'confirmación de orden', 'listo', 'ya está', 'ya esta', 'listo ya',
      'proceder', 'enviar pedido', 'enviar orden', 'hacer pedido', 'hacer orden', 'está listo'
    ];
    
    const hasAddAction = addToCartKeywords.some(keyword => message.toLowerCase().includes(keyword));
    const hasRemoveAction = removeFromCartKeywords.some(keyword => message.toLowerCase().includes(keyword));
    const hasConfirmation = confirmKeywords.some(keyword => message.toLowerCase().includes(keyword));
    const isConfirmOrder = confirmOrderKeywords.some(keyword => message.toLowerCase().includes(keyword));
    
    // Detectar si el intent de la IA contiene "confirmación" o "eliminación"
    const intentHasConfirmation = interpretation.intent && 
      (interpretation.intent.toLowerCase().includes('confirmación') || 
       interpretation.intent.toLowerCase().includes('confirmation') ||
       interpretation.intent === 'confirm order');
    
    const intentHasRemoval = interpretation.intent &&
      (interpretation.intent.toLowerCase().includes('eliminar') ||
       interpretation.intent.toLowerCase().includes('quitar') ||
       interpretation.intent.toLowerCase().includes('remove') ||
       interpretation.intent.toLowerCase().includes('borrar'));

    // ✅ PRIORIDAD 1: Detectar eliminación de productos
    if (intentHasRemoval || (hasRemoveAction && interpretation.entities.products?.length)) {
      console.log(`🗑️ [AI-ASSISTANT] Eliminación de producto detectada - Intent: ${interpretation.intent}`);
      intent = 'remove_from_cart';
    }
    // ✅ PRIORIDAD 2: Detectar confirmación de pedido
    else if (intentHasConfirmation || isConfirmOrder) {
      // Confirmar orden completa (enviar pedido)
      console.log(`✅ [AI-ASSISTANT] Confirmación de pedido detectada - Intent: ${interpretation.intent}`);
      intent = 'confirm_order';
    } else if (interpretation.intent === 'add_to_cart') {
      // ✅ El modelo GPT-4o ya decidió que debe agregar al carrito
      console.log(`✅ [AI-ASSISTANT] GPT-4o detectó add_to_cart con productos: ${interpretation.entities.products?.join(', ')}`);
      intent = 'add_to_cart';
    } else if ((hasAddAction || hasConfirmation) && interpretation.entities.products?.length) {
      // Cliente dice "agregar X producto" o "sí, quiero Y" con productos específicos
      console.log(`✅ [AI-ASSISTANT] Acción de agregar detectada con productos: ${interpretation.entities.products.join(', ')}`);
      intent = 'add_to_cart';
    } else if ((hasConfirmation || hasAddAction) && !interpretation.entities.products?.length) {
      // Cliente confirma agregar producto mencionado anteriormente (solo "sí", "agregar")
      console.log(`✅ [AI-ASSISTANT] Confirmación detectada para agregar (sin productos nuevos)`);
      intent = 'add_to_cart';
    } else if (interpretation.entities.products?.length && interpretation.entities.quantity) {
      // ✅ Si hay producto + cantidad específica = agregar directamente
      console.log(`✅ [AI-ASSISTANT] Producto + cantidad detectada: ${interpretation.entities.products.join(', ')} x${interpretation.entities.quantity}`);
      intent = 'add_to_cart';
    } else if (interpretation.category === 'order' && interpretation.entities.products?.length) {
      // Cliente menciona producto sin cantidad - buscar y preguntar cantidad
      intent = 'search_product';
    } else if (interpretation.category === 'question') {
      intent = 'ask_question';
    } else if (interpretation.category === 'greeting') {
      intent = 'other';
    }

    // Construir items desde productos mencionados (EXCEPTO para confirm_order y remove_from_cart)
    let items: any[];
    
    if (intent === 'confirm_order') {
      // Para confirmación de pedido, NO buscar productos mencionados
      // El carrito ya tiene los productos, solo confirmar
      console.log(`📋 [AI-ASSISTANT] Confirmación de orden - No se buscarán productos, se usará carrito existente`);
      items = [];
    } else if (intent === 'remove_from_cart') {
      // Para eliminación, identificar qué eliminar (por índice o nombre)
      // Detectar si es un número ("elimina el 1", "quita el 2")
      const numberMatch = message.match(/(?:elimina|quita|borra|saca)\s+(?:el|la)?\s*(\d+)/i);
      if (numberMatch) {
        const itemIndex = parseInt(numberMatch[1]);
        console.log(`🔢 [AI-ASSISTANT] Eliminación por índice: ${itemIndex}`);
        items = [{ removeByIndex: itemIndex, quantity: 1, confidence: interpretation.confidence }];
      } else if (interpretation.entities.products?.length) {
        // Eliminar por nombre de producto
        console.log(`🏷️ [AI-ASSISTANT] Eliminación por nombre: ${interpretation.entities.products.join(', ')}`);
        items = interpretation.entities.products.map(product => ({
          searchQuery: product,
          removeByName: true,
          quantity: 1,
          confidence: interpretation.confidence
        }));
      } else {
        console.log(`⚠️ [AI-ASSISTANT] Eliminación sin especificar producto`);
        items = [];
      }
    } else {
      // Para otros intents, construir items desde productos mencionados
      items = interpretation.entities.products?.map(product => ({
        searchQuery: product,
        quantity: interpretation.entities.quantity || 1,
        confidence: interpretation.confidence
      })) || [{ searchQuery: message, quantity: 1, confidence: interpretation.confidence }];
    }

    return {
      intent,
      items,
      message: interpretation.suggestedResponse,
      confidence: interpretation.confidence
    };

  } catch (error: any) {
    console.error(`❌ [AI-ASSISTANT] Error analizando mensaje:`, error);

    // Fallback: buscar producto por palabras clave
    return {
      intent: 'search_product',
      items: [{ searchQuery: message, quantity: 1, confidence: 0.5 }],
      message: `No pude analizar el mensaje correctamente. ¿Podrías especificar qué producto deseas?`,
      confidence: 0.5
    };
  }
}

export async function interpretAIMessage(message: string, context: AIContext, recentMessages: any[] = []) {
  const { storeId, customerId, token, apiBaseUrl } = context;

  // 🔍 DETECTAR SELECCIÓN DE OPCIONES: Si el mensaje es un número (1-5), buscar opciones en mensajes recientes
  const numberMatch = message.trim().match(/^([1-5])$/);
  if (numberMatch) {
    const selectedIndex = parseInt(numberMatch[1]) - 1; // Convertir a índice 0-based
    
    // Buscar último mensaje del asistente que contenga opciones
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const msg = recentMessages[i];
      if (msg.role === 'assistant' && msg.content.includes('🔍 Encontré') && msg.content.includes('💬 ¿Cuál deseas?')) {
        // Extraer productos del mensaje
        const lines = msg.content.split('\n');
        const productLines = lines.filter(l => /^\d+\./.test(l.trim()));
        
        if (productLines[selectedIndex]) {
          // Extraer nombre del producto de la línea seleccionada
          const productLine = productLines[selectedIndex];
          const nameMatch = productLine.match(/\d+\.\s+\*?([^*-]+?)[\*-]/);
          if (nameMatch) {
            const productName = nameMatch[1].trim();
            console.log(`✅ [AI-ASSISTANT] Cliente seleccionó opción ${selectedIndex + 1}: ${productName}`);
            
            // Buscar el producto por nombre exacto
            const found = await searchProducts(productName, storeId);
            if (found.length > 0) {
              return {
                intent: 'add_to_cart',
                items: [{
                  searchQuery: productName,
                  quantity: 1,
                  suggestedProduct: found[0],
                  confidence: 1.0
                }],
                message: '',
                confidence: 1.0
              };
            }
          }
        }
        break;
      }
    }
  }

  const interpretation = await analyzeMessageWithAI(message, context, recentMessages);

  switch (interpretation.intent) {
    case 'search_product': {
      // 🔍 MODO CONVERSACIONAL: Buscar y mostrar opciones sin agregar al carrito
      for (const item of interpretation.items) {
        const found: Product[] = await searchProducts(item.searchQuery, storeId);
        if (Array.isArray(found) && found.length > 0) {
          const product = found[0];
          item.suggestedProduct = product;
          
          // 📊 Mostrar múltiples opciones si hay más resultados
          if (found.length > 1) {
            const productsToShow = found.slice(0, 5);
            const options = productsToShow.map((p, idx) => 
              `${idx + 1}. *${p.name}* - RD$${p.price}`
            ).join('\n');
            interpretation.message = `🔍 Encontré ${found.length} opciones:\n\n${options}\n\n💬 Dime el número o nombre del producto que deseas.`;
            
            // ✅ ACTIVAR BOTONES Y GUARDAR DATOS PARA PROCESAMIENTO
            const productsForButtons = productsToShow.slice(0, 3); // Máximo 3 botones WhatsApp
            (interpretation as any).useButtons = true;
            (interpretation as any).productOptions = productsForButtons.map((p, idx) => ({
              id: `product_${p.id}`,
              title: p.name.length > 20 ? p.name.substring(0, 17) + '...' : p.name,
              productId: p.id,
              productName: p.name,
              productPrice: p.price
            }));
            
            // Guardar TODOS los productos mostrados (hasta 5) indexados por ID
            (interpretation as any).productData = productsToShow.reduce((acc, p) => {
              acc[p.id] = p;
              return acc;
            }, {} as Record<number, Product>);
            
            // También guardar por índice (1-5) para selección numérica
            (interpretation as any).productsByIndex = productsToShow.reduce((acc, p, idx) => {
              acc[idx + 1] = p; // Índice 1-based
              return acc;
            }, {} as Record<number, Product>);
          } else {
            interpretation.message = `✅ Tenemos *${product.name}* a *RD$${product.price}*.\n\n¿Cuántas unidades deseas?`;
          }
        } else {
          interpretation.message = `❌ No encontré "${item.searchQuery}".\n\n¿Podrías darme más detalles o escribir el nombre de otra forma?`;
        }
      }
      break;
    }
    
    case 'add_to_cart': {
      // ✅ VERIFICAR COINCIDENCIA ANTES DE AGREGAR
      const addedItems: string[] = [];
      const notFoundItems: string[] = [];
      const needsConfirmation: Array<{query: string, options: Product[]}> = [];
      
      for (const item of interpretation.items) {
        const found: Product[] = await searchProducts(item.searchQuery, storeId);
        
        if (Array.isArray(found) && found.length > 0) {
          // Verificar si hay coincidencia exacta (nombre contiene completamente el query o viceversa)
          const query = item.searchQuery.toLowerCase();
          const exactMatch = found.find(p => 
            p.name.toLowerCase() === query || 
            p.name.toLowerCase().includes(query) && query.length >= 4
          );
          
          if (exactMatch && found.length === 1) {
            // ✅ Coincidencia exacta y única - agregar directamente
            item.suggestedProduct = exactMatch;
            const totalPrice = (item.quantity || 1) * Number(exactMatch.price);
            addedItems.push(`${item.quantity || 1}x ${exactMatch.name} (RD$${totalPrice})`);
          } else if (found.length > 1 || !exactMatch) {
            // ⚠️ Múltiples opciones o sin coincidencia exacta - pedir confirmación
            needsConfirmation.push({ query: item.searchQuery, options: found.slice(0, 5) });
          } else {
            // ✅ Coincidencia exacta única
            item.suggestedProduct = found[0];
            const totalPrice = (item.quantity || 1) * Number(found[0].price);
            addedItems.push(`${item.quantity || 1}x ${found[0].name} (RD$${totalPrice})`);
          }
        } else {
          notFoundItems.push(item.searchQuery);
        }
      }
      
      // Si hay productos que necesitan confirmación, cambiar a modo búsqueda con botones
      if (needsConfirmation.length > 0) {
        interpretation.intent = 'search_product';
        interpretation.message = `🔍 Encontré estas opciones para "${needsConfirmation[0].query}":`;
        
        // Preparar productos (hasta 5 para texto, hasta 3 para botones)
        const allProductsToShow = needsConfirmation[0].options.slice(0, 5);
        const productsForButtons = allProductsToShow.slice(0, 3);
        
        // ✅ ACTIVAR BOTONES: Agregar datos para botones interactivos (máximo 3 por WhatsApp)
        (interpretation as any).useButtons = true;
        (interpretation as any).productOptions = productsForButtons.map((p, idx) => ({
          id: `product_${p.id}`,
          title: p.name.length > 20 ? p.name.substring(0, 17) + '...' : p.name,
          productId: p.id,
          productName: p.name,
          productPrice: p.price
        }));
        
        // Guardar TODOS los productos por ID (hasta 5)
        (interpretation as any).productData = allProductsToShow.reduce((acc, p) => {
          acc[p.id] = p;
          return acc;
        }, {} as Record<number, Product>);
        
        // Guardar TODOS los productos por índice (1-5) para selección numérica
        (interpretation as any).productsByIndex = allProductsToShow.reduce((acc, p, idx) => {
          acc[idx + 1] = p; // Índice 1-based
          return acc;
        }, {} as Record<number, Product>);
        
        // También agregar como texto para fallback
        interpretation.message += `\n\n`;
        interpretation.message += allProductsToShow.map((p, idx) => 
          `${idx + 1}. *${p.name}* - RD$${p.price}`
        ).join('\n');
        interpretation.message += `\n\n💬 Selecciona una opción o dime el número.`;
        break;
      }
      
      // Construir mensaje con todos los productos agregados
      if (addedItems.length > 0) {
        const subtotal = interpretation.items
          .filter(i => i.suggestedProduct)
          .reduce((sum, i) => sum + ((i.quantity || 1) * Number(i.suggestedProduct!.price)), 0);
        
        interpretation.message = `✅ *Agregado al carrito:*\n${addedItems.map(i => `• ${i}`).join('\n')}`;
        interpretation.message += `\n\n💰 Subtotal: RD$${subtotal.toFixed(2)}`;
        
        if (notFoundItems.length > 0) {
          interpretation.message += `\n\n⚠️ No encontré: ${notFoundItems.join(', ')}`;
        }
        interpretation.message += `\n\n💬 ¿Algo más o escribes *"confirmar pedido"* para finalizar?`;
      } else {
        interpretation.message = `❌ No encontré ninguno de estos productos: ${notFoundItems.join(', ')}.\n\n¿Podrías especificar mejor o escribir el nombre de otra forma?`;
      }
      break;
    }

    case 'confirm_order': {
      const validItems = interpretation.items.filter(i => i.suggestedProduct?.id);
      if (validItems.length === 0) {
        interpretation.message = 'No hay productos en tu carrito. Escribe lo que deseas pedir.';
        return interpretation;
      }

      const payload = {
        customerId,
        items: validItems.map(p => ({
          productId: p.suggestedProduct!.id,
          quantity: p.quantity || 1,
          unitPrice: Number(p.suggestedProduct!.price) || 0,
          totalPrice: (Number(p.suggestedProduct!.price) || 0) * (p.quantity || 1)
        })),
        notes: 'Pedido generado automáticamente por IA desde WhatsApp',
        paymentMethod: 'cash'
      };

      const order = await createOrderFromAI(token, apiBaseUrl, payload);
      interpretation.message = `✅ Tu pedido fue confirmado correctamente. Número de orden: ${order.id}`;
      break;
    }

    default:
      interpretation.message ||= 'No entendí tu solicitud, ¿podrías repetirla?';
  }

  return interpretation;
}
