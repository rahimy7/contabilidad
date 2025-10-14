// scripts/add-assigned-users-field.ts
// Script para agregar el campo assignedUserIds a assignment_rules

import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function addAssignedUsersField() {
  console.log('🔄 Agregando campo assigned_user_ids a assignment_rules...\n');

  try {
    // 1. Agregar el campo
    console.log('📝 Paso 1: Agregando columna...');
    await db.execute(sql`
      ALTER TABLE assignment_rules
      ADD COLUMN IF NOT EXISTS assigned_user_ids INTEGER[] DEFAULT NULL;
    `);
    console.log('✅ Columna agregada\n');

    // 2. Agregar comentario
    console.log('📝 Paso 2: Agregando comentario explicativo...');
    await db.execute(sql`
      COMMENT ON COLUMN assignment_rules.assigned_user_ids IS 
      'Array de IDs de usuarios específicos a los que se debe asignar. Si está configurado, solo estos usuarios recibirán asignaciones de esta regla.';
    `);
    console.log('✅ Comentario agregado\n');

    // 3. Crear índice
    console.log('📝 Paso 3: Creando índice...');
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_assignment_rules_assigned_users 
      ON assignment_rules USING GIN (assigned_user_ids);
    `);
    console.log('✅ Índice creado\n');

    // 4. Verificar que el campo existe
    console.log('📝 Paso 4: Verificando...');
    const result = await db.execute(sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'assignment_rules' 
      AND column_name = 'assigned_user_ids';
    `);

    if (result.rows.length > 0) {
      console.log('✅ Verificación exitosa');
      console.log(`   Columna: ${result.rows[0].column_name}`);
      console.log(`   Tipo: ${result.rows[0].data_type}\n`);
    } else {
      throw new Error('El campo no fue creado correctamente');
    }

    // 5. Mostrar estadísticas
    console.log('📊 Estadísticas de assignment_rules:');
    const stats = await db.execute(sql`
      SELECT 
        COUNT(*) as total_rules,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_rules,
        COUNT(CASE WHEN auto_assign = true THEN 1 END) as auto_assign_rules
      FROM assignment_rules;
    `);
    
    console.log(`   Total de reglas: ${stats.rows[0]?.total_rules || 0}`);
    console.log(`   Reglas activas: ${stats.rows[0]?.active_rules || 0}`);
    console.log(`   Con auto-asignación: ${stats.rows[0]?.auto_assign_rules || 0}\n`);

    console.log('✨ MIGRACIÓN COMPLETADA EXITOSAMENTE\n');
    console.log('🎯 Ahora puedes:');
    console.log('   1. Crear reglas con usuarios específicos');
    console.log('   2. Usar el método "specific_users" en assignmentMethod');
    console.log('   3. Las órdenes solo se asignarán a los usuarios configurados\n');

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ ERROR EN LA MIGRACIÓN:', error.message);
    console.error('\nStack:', error.stack);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  addAssignedUsersField();
}

export { addAssignedUsersField };

/**
 * USO:
 * 
 * # Ejecutar con node
 * node dist/scripts/add-assigned-users-field.js
 * 
 * # O con tsx
 * npx tsx scripts/add-assigned-users-field.ts
 * 
 * # Agregar a package.json
 * "scripts": {
 *   "migrate:assigned-users": "tsx scripts/add-assigned-users-field.ts"
 * }
 * 
 * Luego ejecutar:
 * npm run migrate:assigned-users
 */