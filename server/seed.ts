import { db } from "./db";
import { users, customers, products, orders, orderItems, conversations, messages, whatsappSettings } from "@shared/schema";

async function seedDatabase() {
  try {
    console.log("Iniciando configuración de la base de datos...");

    // Eliminar datos existentes
    await db.delete(whatsappSettings);
    await db.delete(orderItems);
    await db.delete(messages);
    await db.delete(conversations);
    await db.delete(orders);
    await db.delete(products);
    await db.delete(customers);
    await db.delete(users);

    console.log("Datos existentes eliminados.");

    // Insertar usuarios
    const [superAdmin] = await db.insert(users).values({
      username: "superadmin",
      password: "password",
      email: "superadmin@orderManager.com",
      fullName: "Super Administrador Global",
      role: "super_admin",
      status: "active"
    }as any).returning();

    const [admin] = await db.insert(users).values({
      username: "admin",
      password: "password",
      email: "admin@orderManager.com",
      fullName: "Administrador",
      role: "admin",
      status: "active"
    }as any).returning();

    const [technician1] = await db.insert(users).values({
      username: "tech1",
      password: "password",
      email: "tech1@orderManager.com",
      fullName: "Carlos Mendoza",
      role: "technician",
      status: "active"
    }as any).returning();

    const [seller1] = await db.insert(users).values({
      username: "seller1",
      password: "password",
      email: "seller1@orderManager.com",
      fullName: "Ana García",
      role: "seller",
      status: "active"
    }as any).returning();

    const [technician2] = await db.insert(users).values({
      username: "tech2",
      password: "password",
      email: "tech2@orderManager.com",
      fullName: "Roberto Silva",
      role: "technician",
      status: "busy"
    }as any).returning();

    console.log("Usuarios creados:", { admin: admin.id, technician1: technician1.id, seller1: seller1.id, technician2: technician2.id });

    // Insertar clientes
    const [customer1] = await db.insert(customers).values({
      name: "Juan López",
      phone: "+52 55 1234-5678",
      whatsappId: "5215512345678",
      address: "Av. Insurgentes Sur 123, Col. Roma Norte, CDMX",
      latitude: "19.4126",
      longitude: "-99.1732",
      lastContact: new Date()
    }as any).returning();

    const [customer2] = await db.insert(customers).values({
      name: "María González",
      phone: "+52 55 8765-4321",
      whatsappId: "5215587654321",
      address: "Calle Reforma 456, Col. Polanco, CDMX",
      latitude: "19.4325",
      longitude: "-99.1915",
      lastContact: new Date()
    }as any).returning();

    const [customer3] = await db.insert(customers).values({
      name: "Pedro Ramírez",
      phone: "+52 55 5555-5555",
      whatsappId: "5215555555555",
      address: "Av. Universidad 789, Col. Narvarte, CDMX",
      latitude: "19.3908",
      longitude: "-99.1592",
      lastContact: new Date()
    }as any).returning();

    console.log("Clientes creados:", { customer1: customer1.id, customer2: customer2.id, customer3: customer3.id });

    // Insertar productos
    const [product1] = await db.insert(products).values({
      name: "Instalación de Aires Acondicionados",
      description: "Servicio completo de instalación de equipos de aire acondicionado residencial y comercial",
      type: "service",
      basePrice: "2500.00",
      category: "instalacion",
      isActive: true
    }as any).returning();

    const [product2] = await db.insert(products).values({
      name: "Aire Acondicionado Split 12,000 BTU",
      description: "Equipo de aire acondicionado tipo split de 12,000 BTU, eficiencia energética A+",
      type: "product",
      basePrice: "8500.00",
      category: "equipos",
      isActive: true
    }as any).returning();

    const [product3] = await db.insert(products).values({
      name: "Mantenimiento Preventivo AC",
      description: "Servicio de mantenimiento preventivo para equipos de aire acondicionado",
      type: "service",
      basePrice: "800.00",
      category: "mantenimiento",
      isActive: true
    }as any).returning();

    console.log("Productos creados:", { product1: product1.id, product2: product2.id, product3: product3.id });

    // Insertar pedidos
    const [order1] = await db.insert(orders).values({
      orderNumber: "ORD-1001",
      customerId: customer1.id,
      assignedUserId: technician1.id,
      status: "processing",
      totalAmount: "11000.00",
      notes: "Instalación en departamento nuevo",
      scheduledDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // mañana
      customerAddress: customer1.address,
      customerLatitude: customer1.latitude,
      customerLongitude: customer1.longitude
    }as any).returning();

    console.log("Pedido creado:", { order1: order1.id });

    // Insertar items del pedido
    await db.insert(orderItems).values({
      orderId: order1.id,
      productId: product2.id,
      quantity: 1,
      unitPrice: "8500.00",
      totalPrice: "8500.00",
      deliveryCost: "300.00",
      deliveryDistance: "15.5"
    }as any);

    await db.insert(orderItems).values({
      orderId: order1.id,
      productId: product1.id,
      quantity: 1,
      unitPrice: "2500.00",
      totalPrice: "2500.00",
      installationCost: "2500.00",
      laborHours: "4.0",
      laborRate: "625.00"
    }as any);

    // Insertar conversación
    const [conversation1] = await db.insert(conversations).values({
      customerId: customer1.id,
      orderId: order1.id,
      status: "active",
      lastMessageAt: new Date()
    }as any).returning();

    // Insertar mensajes
    await db.insert(messages).values({
      conversationId: conversation1.id,
      senderId: null, // mensaje del cliente
      content: "Hola, quiero información sobre instalación de aire acondicionado",
      messageType: "text",
      isFromCustomer: true,
      isRead: true,
      whatsappMessageId: "wamid.12345"
    }as any);

    await db.insert(messages).values({
      conversationId: conversation1.id,
      senderId: seller1.id,
      content: "¡Hola! Con gusto te ayudo. ¿Qué tipo de espacio necesitas climatizar?",
      messageType: "text",
      isFromCustomer: false,
      isRead: true
    }as any);

    // Insertar configuración de WhatsApp con el nuevo token
    await db.insert(whatsappSettings).values({
      accessToken: "EAAKHVoxT6IUBO0NfI9kvAENV7pGuhZAPyl2H1QUtyS1h9ADbzxamIQ04wq2OacRm79subgUHUwFkhJplUmHNA6huA6HtvhjFgJuVmP9kBbkQsacew8OtuOYtJZAOlSvdZCAeNhQ2VS5zuWi3rkBXGzX8TvqxgBa6oc16fMZAJjf7dUYHZB2U561Mz17s649L83Df1ms0HVsMe58aqwEjH1KXo1ZB9WZATtwwE9SvWdTO5DFVmZA5vIUyAGOE38vqwgZDZD",
      phoneNumberId: "457588944081739",
      webhookVerifyToken: "orderManager_webhook_2024",
      businessAccountId: "457588944081739",
      appId: "1611235026094756",
      isActive: true
    }as any);

    console.log("✓ Base de datos configurada exitosamente");
    console.log("✓ Configuración de WhatsApp guardada con el nuevo token");
    console.log("✓ Datos de ejemplo creados");

  } catch (error) {
    console.error("Error al configurar la base de datos:", error);
    throw error;
  }
}

// Ejecutar si el archivo se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase().then(() => {
    console.log("Configuración completada");
    process.exit(0);
  }).catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}

export { seedDatabase };