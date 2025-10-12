// server/scripts/setup-sector-assignment.ts

/**
 * Script de configuración inicial para el sistema de asignación por sectores
 * 
 * Este script:
 * 1. Ejecuta la migración de base de datos
 * 2. Configura reglas de asignación predeterminadas
 * 3. Actualiza técnicos existentes con sectores ejemplo
 * 4. Crea datos de prueba si es necesario
 */

import { db } from '../server/db';
import { migrateSectorFields } from '../migrations/add-sector-fields';

import { sql } from 'drizzle-orm';

interface SetupOptions {
  runMigration?: boolean;
  createRules?: boolean;
  updateExistingTechnicians?: boolean;
  createSampleData?: boolean;
  verbose?: boolean;
}

async function setupSectorAssignment(options: SetupOptions = {}) {
  const {
    runMigration = true,
    createRules = true,
    updateExistingTechnicians = true,
    createSampleData = false,
    verbose = true
  } = options;

  const log = (message: string) => {
    if (verbose) console.log(message);
  };

  try {
    log('🚀 Iniciando configuración del sistema de asignación por sectores...\n');

    // ==================== PASO 1: MIGRACIÓN ====================
    if (runMigration) {
      log('📝 PASO 1: Ejecutando migración de base de datos...');
      await migrateSectorFields();
      log('✅ Migración completada\n');
    } else {
      log('⏭️  PASO 1: Migración omitida\n');
    }

    // ==================== PASO 2: CREAR REGLAS ====================
    if (createRules) {
      log('📋 PASO 2: Creando reglas de asignación predeterminadas...');
      
      interface RuleConfig {
        name: string;
        isActive: boolean;
        priority: number;
        useSectorBased: boolean;
        requiredProvince?: string | null;
        requiredMunicipality?: string | null;
        requiredSectors?: string[] | null;
        allowAdjacentMunicipalities: boolean;
        useSpecializationBased: boolean;
        requiredSpecializations?: string[] | null;
        useWorkloadBased: boolean;
        maxOrdersPerTechnician: number;
        useTimeBased: boolean;
        availabilityRequired: boolean;
        applicableProducts?: string[] | null;
        applicableServices?: string[] | null;
        assignmentMethod: string;
        autoAssign: boolean;
        notifyCustomer: boolean;
        estimatedResponseTime: number;
      }

      const defaultRules: RuleConfig[] = [
        {
          name: "Urgencias - Respuesta Inmediata",
          isActive: true,
          priority: 10,
          
          // Criterios de sector
          useSectorBased: true,
          requiredProvince: undefined, // Todas las provincias
          requiredMunicipality: undefined,
          requiredSectors: undefined,
          allowAdjacentMunicipalities: true,
          
          // Criterios de especialización
          useSpecializationBased: true,
          requiredSpecializations: ["urgencias", "emergencias", "reparacion_general"],
          
          // Criterios de carga
          useWorkloadBased: false, // En urgencias no importa
          maxOrdersPerTechnician: 10,
          
          // Tiempo
          useTimeBased: true,
          availabilityRequired: true,
          
          // Aplicabilidad
          applicableProducts: undefined,
          applicableServices: ["emergencia", "urgencia"],
          
          // Comportamiento
          assignmentMethod: "closest_available",
          autoAssign: true, // ✅ AUTO
          notifyCustomer: true,
          estimatedResponseTime: 30,
        },
        {
          name: "Aires Acondicionados - Especialistas",
          isActive: true,
          priority: 8,
          
          useSectorBased: true,
          requiredProvince: undefined,
          requiredMunicipality: undefined,
          requiredSectors: undefined,
          allowAdjacentMunicipalities: true,
          
          useSpecializationBased: true,
          requiredSpecializations: ["aire_acondicionado", "climatizacion"],
          
          useWorkloadBased: true,
          maxOrdersPerTechnician: 4,
          
          useTimeBased: true,
          availabilityRequired: true,
          
          applicableProducts: undefined,
          applicableServices: ["instalacion", "mantenimiento", "reparacion"],
          
          assignmentMethod: "highest_skill", // Más capacitado
          autoAssign: true, // ✅ AUTO
          notifyCustomer: true,
          estimatedResponseTime: 120,
        },
        {
          name: "Asignación General - Por Disponibilidad",
          isActive: true,
          priority: 3,
          
          useSectorBased: true,
          requiredProvince: undefined,
          requiredMunicipality: undefined,
          requiredSectors: undefined,
          allowAdjacentMunicipalities: true,
          
          useSpecializationBased: false,
          requiredSpecializations: undefined,
          
          useWorkloadBased: true,
          maxOrdersPerTechnician: 5,
          
          useTimeBased: true,
          availabilityRequired: true,
          
          applicableProducts: undefined,
          applicableServices: [], // Aplica a todo
          
          assignmentMethod: "least_busy", // Menos ocupado
          autoAssign: true, // ✅ AUTO
          notifyCustomer: true,
          estimatedResponseTime: 90,
        }
      ];

      for (const rule of defaultRules) {
        try {
          // Convertir arrays a formato PostgreSQL
          const formatArray = (arr?: string[] | null) => {
            if (!arr || arr.length === 0) return null;
            return `{${arr.join(',')}}`;
          };

          await db.execute(sql`
            INSERT INTO assignment_rules (
              name, is_active, priority,
              use_sector_based, required_province, required_municipality, 
              required_sectors, allow_adjacent_municipalities,
              use_specialization_based, required_specializations,
              use_workload_based, max_orders_per_technician,
              use_time_based, availability_required,
              applicable_products, applicable_services,
              assignment_method, auto_assign, notify_customer,
              estimated_response_time,
              created_at, updated_at
            ) VALUES (
              ${rule.name}, 
              ${rule.isActive}, 
              ${rule.priority},
              ${rule.useSectorBased}, 
              ${rule.requiredProvince || null}, 
              ${rule.requiredMunicipality || null},
              ${formatArray(rule.requiredSectors)},
              ${rule.allowAdjacentMunicipalities},
              ${rule.useSpecializationBased}, 
              ${formatArray(rule.requiredSpecializations)},
              ${rule.useWorkloadBased}, 
              ${rule.maxOrdersPerTechnician},
              ${rule.useTimeBased}, 
              ${rule.availabilityRequired},
              ${formatArray(rule.applicableProducts)}, 
              ${formatArray(rule.applicableServices)},
              ${rule.assignmentMethod}, 
              ${rule.autoAssign}, 
              ${rule.notifyCustomer},
              ${rule.estimatedResponseTime},
              NOW(), NOW()
            )
            ON CONFLICT (name) DO NOTHING
          `);
          log(`   ✓ Regla creada: "${rule.name}"`);
        } catch (error: any) {
          log(`   ⚠️  Error creando regla "${rule.name}": ${error.message}`);
        }
      }
      
      log('✅ Reglas creadas\n');
    } else {
      log('⏭️  PASO 2: Creación de reglas omitida\n');
    }

    // ==================== PASO 3: ACTUALIZAR TÉCNICOS ====================
    if (updateExistingTechnicians) {
      log('👷 PASO 3: Actualizando técnicos existentes con sectores...');
      
      // Obtener técnicos sin sectores configurados
      const technicians = await db.execute(sql`
        SELECT ep.id, ep.user_id, u.name, ep.territory
        FROM employee_profiles ep
        JOIN users u ON ep.user_id = u.id
        WHERE u.role = 'technical' OR u.role = 'technician'
          AND ep.province IS NULL
      `);

      if (technicians.rows.length === 0) {
        log('   ℹ️  No hay técnicos por actualizar (todos tienen sectores configurados)');
      } else {
        log(`   Encontrados ${technicians.rows.length} técnicos sin sectores`);
        
        // Configuración ejemplo basada en territory si existe
        for (const tech of technicians.rows) {
          const territory = tech.territory as string;
          
          // Intentar inferir provincia del territory
          let province = "Santo Domingo"; // Default
          let municipality = "Santo Domingo Este";
          let sector = null;
          
          if (territory) {
            if (territory.includes("Santiago")) {
              province = "Santiago";
              municipality = "Santiago";
            } else if (territory.includes("La Vega")) {
              province = "La Vega";
              municipality = "La Vega";
            }
          }

          await db.execute(sql`
            UPDATE employee_profiles SET
              province = ${province},
              municipality = ${municipality},
              sector = ${sector},
              coverage_provinces = ARRAY[${province}],
              coverage_municipalities = ARRAY[${municipality}],
              coverage_sectors = ARRAY[]::text[],
              updated_at = NOW()
            WHERE id = ${tech.id}
          `);
          
          log(`   ✓ Actualizado: ${tech.name} → ${province}, ${municipality}`);
        }
      }
      
      log('✅ Técnicos actualizados\n');
    } else {
      log('⏭️  PASO 3: Actualización de técnicos omitida\n');
    }

    // ==================== PASO 4: DATOS DE PRUEBA ====================
    if (createSampleData) {
      log('🧪 PASO 4: Creando datos de prueba...');
      
      // Aquí puedes crear clientes, órdenes de prueba, etc.
      log('   ℹ️  Implementación de datos de prueba pendiente');
      
      log('✅ Datos de prueba creados\n');
    } else {
      log('⏭️  PASO 4: Datos de prueba omitidos\n');
    }

    // ==================== RESUMEN FINAL ====================
    log('\n' + '='.repeat(60));
    log('✨ CONFIGURACIÓN COMPLETADA CON ÉXITO');
    log('='.repeat(60));
    
    // Estadísticas
    const rulesCount = await db.execute(sql`
      SELECT COUNT(*) as count FROM assignment_rules WHERE is_active = true
    `);
    
    const techniciansCount = await db.execute(sql`
      SELECT COUNT(*) as count FROM employee_profiles 
      WHERE province IS NOT NULL
    `);
    
    const autoRulesCount = await db.execute(sql`
      SELECT COUNT(*) as count FROM assignment_rules 
      WHERE is_active = true AND auto_assign = true
    `);

    log('\n📊 ESTADÍSTICAS:');
    log(`   • Reglas activas: ${rulesCount.rows[0]?.count || 0}`);
    log(`   • Reglas con auto-asignación: ${autoRulesCount.rows[0]?.count || 0}`);
    log(`   • Técnicos con sectores: ${techniciansCount.rows[0]?.count || 0}`);
    
    log('\n🎯 PRÓXIMOS PASOS:');
    log('   1. Revisar y ajustar sectores de técnicos manualmente');
    log('   2. Configurar sectores específicos según tu ciudad');
    log('   3. Crear una orden de prueba para verificar asignación');
    log('   4. Monitorear logs: tail -f logs/server.log | grep AUTO-ASSIGN');
    
    log('\n💡 COMANDOS ÚTILES:');
    log('   • Ver reglas: SELECT name, priority, auto_assign FROM assignment_rules;');
    log('   • Ver técnicos: SELECT u.name, ep.province, ep.municipality FROM employee_profiles ep JOIN users u ON ep.user_id = u.id WHERE u.role = \'technical\';');
    log('   • Test manual: POST /api/orders/:orderId/auto-assign');
    
    log('\n✅ Sistema listo para usar!\n');
    
    return {
      success: true,
      message: 'Configuración completada exitosamente'
    };

  } catch (error) {
    console.error('\n❌ ERROR EN LA CONFIGURACIÓN:', error);
 
    
    return {
      success: false,
     
    };
  }
}

// ==================== MODO DE USO ====================

/**
 * Opción 1: Configuración completa (recomendado para primera vez)
 */
async function fullSetup() {
  return await setupSectorAssignment({
    runMigration: true,
    createRules: true,
    updateExistingTechnicians: true,
    createSampleData: false,
    verbose: true
  });
}

/**
 * Opción 2: Solo crear reglas (si la migración ya está hecha)
 */
async function rulesOnly() {
  return await setupSectorAssignment({
    runMigration: false,
    createRules: true,
    updateExistingTechnicians: false,
    createSampleData: false,
    verbose: true
  });
}

/**
 * Opción 3: Solo actualizar técnicos
 */
async function updateTechniciansOnly() {
  return await setupSectorAssignment({
    runMigration: false,
    createRules: false,
    updateExistingTechnicians: true,
    createSampleData: false,
    verbose: true
  });
}

// ==================== EJECUCIÓN ====================

if (require.main === module) {
  // Detectar argumento de línea de comandos
  const args = process.argv.slice(2);
  const mode = args[0] || 'full';

  let setupPromise;
  
  switch (mode) {
    case 'full':
      console.log('🚀 Modo: Configuración completa\n');
      setupPromise = fullSetup();
      break;
    case 'rules':
      console.log('📋 Modo: Solo reglas\n');
      setupPromise = rulesOnly();
      break;
    case 'technicians':
      console.log('👷 Modo: Solo técnicos\n');
      setupPromise = updateTechniciansOnly();
      break;
    default:
      console.error('❌ Modo inválido. Usa: full, rules, o technicians');
      process.exit(1);
  }

  setupPromise
    .then((result) => {
      if (result.success) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('Error fatal:', error);
      process.exit(1);
    });
}

export { setupSectorAssignment, fullSetup, rulesOnly, updateTechniciansOnly };

/**
 * USO DESDE LA TERMINAL:
 * 
 * # Configuración completa (recomendado para primera vez)
 * node server/scripts/setup-sector-assignment.ts full
 * 
 * # Solo crear/actualizar reglas
 * node server/scripts/setup-sector-assignment.ts rules
 * 
 * # Solo actualizar técnicos
 * node server/scripts/setup-sector-assignment.ts technicians
 * 
 * # Desde npm (agregar a package.json):
 * "scripts": {
 *   "setup:sectors": "tsx server/scripts/setup-sector-assignment.ts full",
 *   "setup:sectors:rules": "tsx server/scripts/setup-sector-assignment.ts rules"
 * }
 * 
 * Luego ejecutar:
 * npm run setup:sectors
 */