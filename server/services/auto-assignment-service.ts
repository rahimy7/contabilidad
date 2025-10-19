// server/services/auto-assignment-service.ts

import { eq, and, inArray, sql, desc } from 'drizzle-orm';
import type { AuthUser } from '../../shared/auth';

interface Order {
  id: number;
  customerProvince?: string;
  customerMunicipality?: string;
  customerSector?: string;
  serviceType?: string;
  priority?: string;
}

interface AssignmentRule {
  id: number;
  name: string;
  priority: number;
  isActive: boolean;
  useSectorBased: boolean;
  requiredProvince?: string;
  requiredMunicipality?: string;
  requiredSectors?: string[];
  allowAdjacentMunicipalities: boolean;
  useSpecializationBased: boolean;
  requiredSpecializations?: string[];
  useWorkloadBased: boolean;
  maxOrdersPerTechnician: number;
  useTimeBased: boolean;
  availabilityRequired: boolean;
  applicableServices?: string[];
  assignmentMethod: string;
  autoAssign: boolean;
  assignedUserIds?: number[];
}

interface AvailableTechnician {
  id: number;
  userId: number;
  name: string;
  province?: string;
  municipality?: string;
  sector?: string;
  coverageProvinces?: string[];
  coverageMunicipalities?: string[];
  coverageSectors?: string[];
  specializations?: string[];
  currentOrders: number;
  maxDailyOrders: number;
  skillLevel: number;
  status: string;
}

export class AutoAssignmentService {
  constructor(private tenantStorage: any) {}

  /**
   * Ejecuta la asignación automática al crear una orden
   */
  async autoAssignOnCreate(orderId: number): Promise<{ success: boolean; assignedUserId?: number; message: string }> {
    try {
      console.log('🤖 [AUTO-ASSIGN] Iniciando asignación automática para orden:', orderId);
      
      // Obtener la orden
      const order = await this.tenantStorage.getOrderById(orderId);

      if (!order) {
        return { success: false, message: 'Orden no encontrada' };
      }

      // Obtener todas las reglas activas con autoAssign = true
      const activeRules = await this.getActiveAutoAssignRules();
      
      if (activeRules.length === 0) {
        console.log('⚠️ [AUTO-ASSIGN] No hay reglas activas con auto-asignación');
        return { success: false, message: 'No hay reglas de auto-asignación activas' };
      }

      // Ordenar reglas por prioridad (mayor a menor)
      const sortedRules = activeRules.sort((a, b) => b.priority - a.priority);
      
      console.log(`📋 [AUTO-ASSIGN] Evaluando ${sortedRules.length} reglas por prioridad`);

      // Intentar asignar con cada regla en orden de prioridad
      for (const rule of sortedRules) {
        console.log(`🔍 [AUTO-ASSIGN] Evaluando regla: "${rule.name}" (Prioridad: ${rule.priority})`);
        
        // Verificar si la regla aplica a esta orden
        if (!this.ruleAppliestoOrder(rule, order)) {
          console.log(`⏭️ [AUTO-ASSIGN] Regla "${rule.name}" no aplica a esta orden`);
          continue;
        }

        // Obtener técnicos elegibles según la regla
        const eligibleTechnicians = await this.getEligibleTechnicians(order, rule);
        
        if (eligibleTechnicians.length === 0) {
          console.log(`❌ [AUTO-ASSIGN] No hay técnicos elegibles para regla "${rule.name}"`);
          continue;
        }

        // Seleccionar el mejor técnico según el método de la regla
        const selectedTechnician = this.selectBestTechnician(eligibleTechnicians, rule);
        
        if (selectedTechnician) {
          // Asignar la orden
          await this.assignOrderToTechnician(orderId, selectedTechnician.userId, rule.id);
          
          console.log(`✅ [AUTO-ASSIGN] Orden ${orderId} asignada a técnico ${selectedTechnician.name} usando regla "${rule.name}"`);
          
          return {
            success: true,
            assignedUserId: selectedTechnician.userId,
            message: `Asignado automáticamente a ${selectedTechnician.name} mediante "${rule.name}"`
          };
        }
      }

      console.log('❌ [AUTO-ASSIGN] No se pudo asignar con ninguna regla');
      return { success: false, message: 'No se encontró técnico disponible con las reglas actuales' };

    } catch (error) {
      console.error('❌ [AUTO-ASSIGN] Error en asignación automática:', error);
      return { success: false, message: 'Error en el sistema de asignación automática' };
    }
  }

  /**
   * Obtiene reglas activas con autoAssign habilitado
   */
  private async getActiveAutoAssignRules(): Promise<AssignmentRule[]> {
    const { schema, tenantDb } = this.tenantStorage;
    
    const rules = await tenantDb
      .select()
      .from(schema.assignmentRules)
      .where(
        and(
          eq(schema.assignmentRules.isActive, true),
          eq(schema.assignmentRules.autoAssign, true)
        )
      )
      .orderBy(desc(schema.assignmentRules.priority));
    
    return rules;
  }

  /**
   * Verifica si una regla aplica a una orden específica
   */
  private ruleAppliestoOrder(rule: AssignmentRule, order: Order): boolean {
    // Verificar tipo de servicio si la regla especifica uno
    if (rule.applicableServices && rule.applicableServices.length > 0) {
      if (!order.serviceType || !rule.applicableServices.includes(order.serviceType)) {
        return false;
      }
    }

    return true;
  }

private async getEligibleTechnicians(order: Order, rule: AssignmentRule): Promise<AvailableTechnician[]> {
  const { schema, tenantDb } = this.tenantStorage;
  
  // SI LA REGLA TIENE USUARIOS ESPECÍFICOS
  if (rule.assignedUserIds && rule.assignedUserIds.length > 0) {
    const specificTechnicians = await tenantDb
      .select({
        id: schema.users.id,
        userId: schema.users.id,
        name: schema.users.name,
        status: schema.users.status,
        // ✅ CAMPOS DE USERS (donde están los datos de ubicación)
        province: schema.users.province,
        municipality: schema.users.municipality,
        sector: schema.users.sector,
        coverageProvinces: schema.users.coverageProvinces,
        coverageMunicipalities: schema.users.coverageMunicipalities,
        coverageSectors: schema.users.coverageSectors,
        specializations: schema.users.specializations,
        currentOrders: schema.users.currentOrders,
        maxDailyOrders: schema.users.maxDailyOrders,
        skillLevel: schema.users.skillLevel,
      })
      .from(schema.users)
      .where(
        and(
          inArray(schema.users.id, rule.assignedUserIds),
          eq(schema.users.status, 'active')
        )
      );
    
    console.log(`📊 [AUTO-ASSIGN] ${specificTechnicians.length} usuarios específicos encontrados`);
    return specificTechnicians;
  }
  
  // FLUJO NORMAL: Todos los técnicos
  const allTechnicians = await tenantDb
    .select({
      id: schema.users.id,
      userId: schema.users.id,
      name: schema.users.name,
      status: schema.users.status,
      province: schema.users.province,
      municipality: schema.users.municipality,
      sector: schema.users.sector,
      coverageProvinces: schema.users.coverageProvinces,
      coverageMunicipalities: schema.users.coverageMunicipalities,
      coverageSectors: schema.users.coverageSectors,
      specializations: schema.users.specializations,
      currentOrders: schema.users.currentOrders,
      maxDailyOrders: schema.users.maxDailyOrders,
      skillLevel: schema.users.skillLevel,
    })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.role, 'technical'),
        eq(schema.users.status, 'active')
      )
    );
  
  console.log(`📊 [AUTO-ASSIGN] ${allTechnicians.length} técnicos encontrados en total`);
  return allTechnicians;
}

  /**
   * Selecciona el mejor técnico según el método de asignación
   */
  private selectBestTechnician(technicians: AvailableTechnician[], rule: AssignmentRule): AvailableTechnician | null {
    if (technicians.length === 0) return null;

    switch (rule.assignmentMethod) {
      case 'least_busy':
        // Ordenar por menor carga de trabajo
        return technicians.sort((a, b) => a.currentOrders - b.currentOrders)[0];

      case 'highest_skill':
        // Ordenar por mayor nivel de habilidad, luego por menor carga
        return technicians.sort((a, b) => {
          if (b.skillLevel !== a.skillLevel) {
            return b.skillLevel - a.skillLevel;
          }
          return a.currentOrders - b.currentOrders;
        })[0];

      case 'round_robin':
        // Selección aleatoria para distribución equitativa
        return technicians[Math.floor(Math.random() * technicians.length)];

      case 'closest_available':
      default:
        // Por ahora, seleccionar el menos ocupado (podemos agregar lógica de distancia después)
        return technicians.sort((a, b) => a.currentOrders - b.currentOrders)[0];
    }
  }

  /**
   * Asigna la orden al técnico seleccionado
   */
private async assignOrderToTechnician(orderId: number, userId: number, ruleId: number): Promise<void> {
  const { schema, tenantDb } = this.tenantStorage;
  
  // 1. Actualizar la orden
  await tenantDb
    .update(schema.orders)
    .set({
      assignedUserId: userId,
      assignedRuleId: ruleId,
      autoAssigned: true,
      status: 'confirmed',
      updatedAt: new Date()
    })
    .where(eq(schema.orders.id, orderId));

  // 2. Incrementar contador en USERS (no en employeeProfiles)
  await tenantDb
    .update(schema.users)
    .set({
      currentOrders: sql`${schema.users.currentOrders} + 1`,
      updatedAt: new Date()
    })
    .where(eq(schema.users.id, userId));

  // 3. Crear notificación
  await tenantDb.insert(schema.notifications).values({
    userId: userId,
    title: 'Nueva orden asignada',
    message: `Se te ha asignado automáticamente la orden #${orderId}`,
    type: 'order_assigned',
    relatedId: orderId,
    relatedType: 'order',
    isRead: false,
    createdAt: new Date()
  });
}
}

// Función helper para usar en routes
export async function executeAutoAssignment(orderId: number, tenantStorage: any) {
  const service = new AutoAssignmentService(tenantStorage);
  return await service.autoAssignOnCreate(orderId);
}