/**for createOrderFromCart
 * AI ORDER ASSISTANT
 *
 * Sistema inteligente para procesar pedidos mediante IA
 * Busca productos, crea carritos, maneja conversaciones
 */

import 'dotenv/config';
import OpenAI from 'openai';
import { CartItem } from './ai-credits-schema';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ========================================
// TIPOS
// ========================================

interface Product {
  id: number;
  name: string;
  description: string;
  price: string;
  category: string;
  brand?: string;
  isActive: boolean;
}

interface OrderInterpretation {
  intent: 'add_to_cart' | 'remove_from_cart' | 'modify_quantity' | 'confirm_order' | 'view_cart' | 'search_product' | 'ask_question';
  items: Array<{
    searchQuery: string;     // Lo que el cliente dijo
    suggestedProduct?: Product; // Producto sugerido por IA
    quantity: number;
    confidence: number;      // Qué tan segura está la IA
  }>;
  message: string;           // Respuesta para el cliente
  needsConfirmation: boolean; // Si requiere confirmación antes de proceder
  confidence: number;
}

interface CartSummary {
  items: CartItem[];
  totalItems: number;
  totalAmount: number;
  formattedSummary: string; // Texto formateado para WhatsApp
}

// ========================================
// BÚSQUEDA INTELIGENTE DE PRODUCTOS
// ========================================

/**
 * Buscar productos que coincidan con la descripción del cliente
 */
export async function searchProductsWithAI(
  query: string,
  availableProducts: Product[]
): Promise<Product[]> {
  try {
    console.log(`🔍 Buscando productos para: "${query}"`);

    // Crear lista de productos para que la IA analice
    const productList = availableProducts
      .filter(p => p.isActive)
      .map(p => ({
        id: p.id,
        name: p.name,
        description: p.description || '',
        price: p.price,
        category: p.category || 'General',
        brand: p.brand || ''
      }));

    const systemPrompt = `Eres un asistente de búsqueda de productos para un sistema de delivery.
Tu tarea es encontrar los productos que mejor coincidan con lo que el cliente está buscando.

IMPORTANTE:
- Busca coincidencias por nombre, descripción, categoría, o palabras clave
- Considera sinónimos y variaciones (ej: "refresco" = "bebida" = "soda")
- Si el cliente es impreciso, sugiere los productos más populares de esa categoría
- Ordena por relevancia (más relevante primero)
- Máximo 5 resultados

Responde SOLO con un JSON válido.`;

    const userPrompt = `Cliente busca: "${query}"

Productos disponibles:
${JSON.stringify(productList, null, 2)}

Devuelve los productos que coincidan en este formato:
{
  "matches": [
    {
      "id": number,
      "confidence": 0.0-1.0,
      "reason": "por qué coincide"
    }
  ]
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    const response = JSON.parse(completion.choices[0].message.content || '{"matches":[]}');

    // Mapear IDs a productos completos
    const matches = response.matches
      .filter((m: any) => m.confidence > 0.5) // Solo coincidencias > 50%
      .map((m: any) => {
        const product = productList.find(p => p.id === m.id);
        return product;
      })
      .filter((p: any) => p !== undefined);

    console.log(`✅ Encontrados ${matches.length} productos`);
    return matches as Product[];

  } catch (error: any) {
    console.error('❌ Error en búsqueda con IA:', error);
    // Fallback: búsqueda simple por nombre
    return availableProducts.filter(p =>
      p.isActive && p.name.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 5);
  }
}

// ========================================
// INTERPRETACIÓN DE PEDIDOS
// ========================================

/**
 * Interpretar mensaje del cliente sobre un pedido
 */
export async function interpretOrderMessage(
  messageText: string,
  currentCart: CartItem[],
  availableProducts: Product[]
): Promise<OrderInterpretation> {
  try {
    console.log('🤖 Interpretando mensaje de pedido...');

    const systemPrompt = `Eres un asistente de pedidos para un sistema de delivery en República Dominicana.
Analizas mensajes de clientes e identificas qué productos quieren pedir.

TAREAS:
1. Identifica la intención (agregar, quitar, modificar, confirmar, consultar)
2. Extrae productos mencionados y cantidades
3. Sugiere productos del catálogo que coincidan
4. Genera respuesta amigable en español dominicano

IMPORTANTE:
- Si el cliente dice "quiero 2 pizzas", extrae: producto="pizza", cantidad=2
- Si dice "dame una coca cola grande", extrae: producto="coca cola grande", cantidad=1
- Si es ambiguo, pregunta para clarificar
- Usa emojis ocasionalmente 🍕🍔🥤
- Sé conciso (máximo 2-3 líneas)

Responde SOLO con JSON válido.`;

    const cartSummary = currentCart.length > 0
      ? `Carrito actual:\n${currentCart.map(item =>
          `- ${item.productName} x${item.quantity} ($${item.totalPrice})`
        ).join('\n')}`
      : 'Carrito vacío';

    const productsSample = availableProducts.slice(0, 20).map(p =>
      `${p.name} - $${p.price} (${p.category})`
    ).join('\n');

    const userPrompt = `Mensaje del cliente: "${messageText}"

${cartSummary}

Muestra de productos disponibles:
${productsSample}

Responde en este formato:
{
  "intent": "add_to_cart|remove_from_cart|modify_quantity|confirm_order|view_cart|search_product|ask_question",
  "items": [
    {
      "searchQuery": "lo que el cliente dijo",
      "quantity": número,
      "confidence": 0.0-1.0
    }
  ],
  "message": "respuesta amigable para el cliente",
  "needsConfirmation": boolean,
  "confidence": 0.0-1.0
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    const interpretation = JSON.parse(completion.choices[0].message.content || '{}');

    // Buscar productos sugeridos para cada item
    if (interpretation.items && interpretation.items.length > 0) {
      for (const item of interpretation.items) {
        const matches = await searchProductsWithAI(item.searchQuery, availableProducts);
        if (matches.length > 0) {
          item.suggestedProduct = matches[0]; // Mejor coincidencia
        }
      }
    }

    console.log('✅ Interpretación completada:', interpretation.intent);
    return interpretation;

  } catch (error: any) {
    console.error('❌ Error interpretando pedido:', error);

    // Fallback: interpretación básica
    return {
      intent: 'ask_question',
      items: [],
      message: 'Disculpa, ¿podrías repetir qué te gustaría pedir? 😊',
      needsConfirmation: false,
      confidence: 0.3
    };
  }
}

// ========================================
// GESTIÓN DE CARRITO
// ========================================

/**
 * Agregar producto al carrito
 */
export function addToCart(
  cart: CartItem[],
  product: Product,
  quantity: number
): CartItem[] {
  const existingItem = cart.find(item => item.productId === product.id);

  if (existingItem) {
    // Incrementar cantidad si ya existe
    existingItem.quantity += quantity;
    existingItem.totalPrice = existingItem.quantity * existingItem.unitPrice;
  } else {
    // Agregar nuevo item
    cart.push({
      productId: product.id,
      productName: product.name,
      quantity: quantity,
      unitPrice: parseFloat(product.price),
      totalPrice: quantity * parseFloat(product.price)
    });
  }

  return cart;
}

/**
 * Quitar producto del carrito
 */
export function removeFromCart(
  cart: CartItem[],
  productId: number
): CartItem[] {
  return cart.filter(item => item.productId !== productId);
}

/**
 * Modificar cantidad de un producto
 */
export function updateQuantity(
  cart: CartItem[],
  productId: number,
  newQuantity: number
): CartItem[] {
  const item = cart.find(item => item.productId === productId);

  if (item) {
    if (newQuantity <= 0) {
      return removeFromCart(cart, productId);
    }
    item.quantity = newQuantity;
    item.totalPrice = item.quantity * item.unitPrice;
  }

  return cart;
}

/**
 * Calcular resumen del carrito
 */
export function getCartSummary(cart: CartItem[]): CartSummary {
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = cart.reduce((sum, item) => sum + item.totalPrice, 0);

  const formattedSummary = cart.length === 0
    ? '🛒 *Tu carrito está vacío*'
    : `🛒 *Tu Pedido:*\n\n${cart.map(item =>
        `• ${item.productName}\n  ${item.quantity} x $${item.unitPrice.toFixed(2)} = *$${item.totalPrice.toFixed(2)}*`
      ).join('\n\n')}\n\n━━━━━━━━━━━━━━━━\n💰 *Total: $${totalAmount.toFixed(2)}*\n📦 *${totalItems} item(s)*`;

  return {
    items: cart,
    totalItems,
    totalAmount,
    formattedSummary
  };
}

// ========================================
// GENERACIÓN DE RESPUESTAS
// ========================================

/**
 * Generar mensaje de confirmación de producto agregado
 */
export function generateAddedToCartMessage(
  item: CartItem,
  cartSummary: CartSummary
): string {
  return `✅ *Agregado al carrito*

${item.productName} x${item.quantity}
$${item.totalPrice.toFixed(2)}

━━━━━━━━━━━━━━━━
📦 Items en carrito: ${cartSummary.totalItems}
💰 Subtotal: $${cartSummary.totalAmount.toFixed(2)}

¿Deseas agregar algo más o confirmar tu pedido? 😊`;
}

/**
 * Generar mensaje de sugerencia de productos
 */
export function generateProductSuggestionMessage(
  query: string,
  products: Product[]
): string {
  if (products.length === 0) {
    return `❌ No encontré productos para "${query}".\n\n¿Podrías describirlo de otra forma? O puedes ver nuestro catálogo completo. 😊`;
  }

  if (products.length === 1) {
    const p = products[0];
    return `Encontré esto para "${query}":\n\n🔹 *${p.name}*\n${p.description || ''}\n💰 $${p.price}\n\n¿Te gustaría agregarlo? Responde "sí" o indica cuántos quieres. 😊`;
  }

  return `Encontré estos productos para "${query}":\n\n${products.map((p, idx) =>
    `${idx + 1}. *${p.name}*\n   💰 $${p.price}\n   ${p.description || ''}`
  ).join('\n\n')}\n\n¿Cuál te gustaría? Responde con el número. 😊`;
}

/**
 * Generar mensaje de confirmación final
 */
export function generateOrderConfirmationMessage(
  cart: CartItem[],
  customerName?: string
): string {
  const summary = getCartSummary(cart);

  const greeting = customerName ? `Perfecto ${customerName}! 🎉` : '¡Perfecto! 🎉';

  return `${greeting}

${summary.formattedSummary}

━━━━━━━━━━━━━━━━

Para continuar necesito algunos datos:

1️⃣ Dirección de entrega
2️⃣ Número de contacto
3️⃣ Método de pago

¿Comenzamos? 😊`;
}

// ========================================
// VALIDACIONES
// ========================================

/**
 * Validar si el mensaje parece ser un pedido
 */
export function looksLikeOrder(message: string): boolean {
  const orderKeywords = [
    'quiero', 'dame', 'necesito', 'pedir', 'ordenar',
    'me das', 'ponme', 'agregar', 'añadir',
    'pizza', 'hamburguesa', 'refresco', 'bebida',
    'combo', 'menú', 'plato'
  ];

  const messageLower = message.toLowerCase();
  return orderKeywords.some(keyword => messageLower.includes(keyword));
}

/**
 * Validar si tiene suficiente confianza para proceder
 */
export function hasHighConfidence(confidence: number): boolean {
  return confidence >= 0.7; // 70% o más
}

/**
 * Crear una orden real desde el carrito de IA (usa el mismo esquema que WhatsApp)
 */
export async function createOrderFromCart(
  cart: CartItem[],
  customer: any,
  storeId: number,
  tenantStorage: any
): Promise<any> {
  try {
    console.log('📦 Creando orden desde carrito (IA)...');

    if (!cart || cart.length === 0) {
      throw new Error('El carrito está vacío.');
    }

    const totalAmount = cart.reduce((sum, item) => sum + item.totalPrice, 0);

    // 🧾 Crear la orden principal
    const order = await tenantStorage.createOrder(
      {
        customerId: customer.id,
        totalAmount: totalAmount.toFixed(2),
        status: 'pending',
        notes: 'Orden creada automáticamente por asistente IA',
        storeId: storeId
      },
      cart.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
        totalPrice: item.totalPrice.toFixed(2)
      }))
    );

    console.log(`✅ Orden creada correctamente: ID ${order.id}, Número ${order.orderNumber}`);
    return order;

  } catch (error: any) {
    console.error('❌ Error al crear la orden desde carrito (IA):', error.message);
    throw error;
  }
}

