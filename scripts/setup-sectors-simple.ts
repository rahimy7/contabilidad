// server/scripts/setup-sectors-simple.ts
// Versión simplificada del script de configuración

import { db } from '../server/db';
import { sql } from 'drizzle-orm';

console.log('🚀 Iniciando configuración del sistema de sectores...\n');

async function main() {
  try {
    // PASO 1: Crear reglas básicas
    console.log('📋 Creando reglas de asignación...');
    
    // Regla 1: Urgencias
    await db.execute(sql`
      INSERT INTO assignment_rules (
        name, is_active, priority,
        use_sector_based, allow_adjacent_municipalities,
        use_specialization_based, required_specializations,
        use_workload_based, max_orders_per_technician,
        use_time_based, availability_required,
        applicable_services,
        assignment_method, auto_assign, notify_customer,
        estimated_response_time,
        created_at, updated_at
      ) VALUES (
        'Urgencias - Respuesta Inmediata',
        true,
        10,
        true,
        true,
        true,
        ARRAY['urgencias', 'emergencias', 'reparacion_general'],
        false,
        10,
        true,
        true,
        ARRAY['emergencia', 'urgencia'],
        'closest_available',
        true,
        true,
        30,
        NOW(),
        NOW()
      )
      ON CONFLICT (name) DO UPDATE SET
        is_active = EXCLUDED.is_active,
        priority = EXCLUDED.priority,
        auto_assign = EXCLUDED.auto_assign,
        updated_at = NOW()
    `);
    console.log('   ✓ Regla de Urgencias creada');

    // Regla 2: Aires Acondicionados
    await db.execute(sql`
      INSERT INTO assignment_rules (
        name, is_active, priority,
        use_sector_based, allow_adjacent_municipalities,
        use_specialization_based, required_specializations,
        use_workload_based, max_orders_per_technician,
        use_time_based, availability_required,
        applicable_services,
        assignment_method, auto_assign, notify_customer,
        estimated_response_time,
        created_at, updated_at
      ) VALUES (
        'Aires Acondicionados - Especialistas',
        true,
        8,
        true,
        true,
        true,
        ARRAY['aire_acondicionado', 'climatizacion'],
        true,
        4,
        true,
        true,
        ARRAY['instalacion', 'mantenimiento', 'reparacion'],
        'highest_skill',
        true,
        true,
        120,
        NOW(),
        NOW()
      )
      ON CONFLICT (name) DO UPDATE SET
        is_active = EXCLUDED.is_active,
        priority = EXCLUDED.priority,
        auto_assign = EXCLUDED.auto_assign,
        updated_at = NOW()
    `);
    console.log('   ✓ Regla de Aires Acondicionados creada');

    // Regla 3: General
    await db.execute(sql`
      INSERT INTO assignment_rules (
        name, is_active, priority,
        use_sector_based, allow_adjacent_municipalities,
        use_specialization_based,
        use_workload_based, max_orders_per_technician,
        use_time_based, availability_required,
        applicable_services,
        assignment_method, auto_assign, notify_customer,
        estimated_response_time,
        created_at, updated_at
      ) VALUES (
        'Asignación General - Por Disponibilidad',
        true,
        3,
        true,
        true,
        false,
        true,
        5,
        true,
        true,
        ARRAY[]::text[],
        'least_busy',
        true,
        true,
        90,
        NOW(),
        NOW()
      )
      ON CONFLICT (name) DO UPDATE SET
        is_active = EXCLUDED.is_active,
        priority = EXCLUDED.priority,
        auto_assign = EXCLUDED.auto_assign,
        updated_at = NOW()
    `);
    console.log('   ✓ Regla General creada');

    console.log('\n✅ Reglas creadas exitosamente');

    // PASO 2: Actualizar técnicos existentes con sectores default
    console.log('\n👷 Actualizando técnicos...');
    
    const result = await db.execute(sql`
      UPDATE employee_profiles
      SET 
        province = 'Santo Domingo',
        municipality = 'Santo Domingo Este',
        coverage_provinces = ARRAY['Santo Domingo'],
        coverage_municipalities = ARRAY['Santo Domingo Este', 'Santo Domingo Norte'],
        coverage_sectors = ARRAY[]::text[],
        updated_at = NOW()
      WHERE province IS NULL
        AND user_id IN (
          SELECT id FROM users WHERE role IN ('technical', 'technician')
        )
    `);
    
    console.log(`   ✓ ${result.rowCount || 0} técnicos actualizados`);

    // PASO 3: Mostrar estadísticas
    console.log('\n📊 ESTADÍSTICAS:');
    
    const rulesCount = await db.execute(sql`
      SELECT COUNT(*) as count FROM assignment_rules 
      WHERE is_active = true
    `);
    console.log(`   • Reglas activas: ${rulesCount.rows[0]?.count || 0}`);

    const autoRules = await db.execute(sql`
      SELECT COUNT(*) as count FROM assignment_rules 
      WHERE is_active = true AND auto_assign = true
    `);
    console.log(`   • Con auto-asignación: ${autoRules.rows[0]?.count || 0}`);

    const techCount = await db.execute(sql`
      SELECT COUNT(*) as count FROM employee_profiles 
      WHERE province IS NOT NULL
    `);
    console.log(`   • Técnicos con sectores: ${techCount.rows[0]?.count || 0}`);

    console.log('\n✨ CONFIGURACIÓN COMPLETADA\n');
    console.log('🎯 PRÓXIMOS PASOS:');
    console.log('   1. Ajustar sectores de técnicos según tu ciudad');
    console.log('   2. Crear una orden de prueba');
    console.log('   3. Verificar logs: tail -f logs/server.log | grep AUTO-ASSIGN');
    console.log('');

    process.exit(0);

  } catch (error: any) {
    console.error('\n❌ ERROR:', error.message);
    console.error('\nStack:', error.stack);
    process.exit(1);
  }
}

main();

/**
 * USO:
 * 
 * node server/scripts/setup-sectors-simple.ts
 * 
 * O con tsx:
 * npx tsx server/scripts/setup-sectors-simple.ts
 * 
 * Agregar a package.json:
 * "scripts": {
 *   "setup:sectors": "tsx server/scripts/setup-sectors-simple.ts"
 * }
 * 
 * Luego:
 * npm run setup:sectors
 */