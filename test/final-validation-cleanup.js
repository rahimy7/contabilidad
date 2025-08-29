// simple-validation-cleanup.js
// Script simplificado para validar y limpiar problemas restantes

import fs from 'fs';
import path from 'path';

const SERVER_PATH = path.join(process.cwd(), 'server');
const BACKUP_PATH = path.join(process.cwd(), '.migration-backup');

console.log('🔍 Iniciando validación y limpieza simplificada...\n');

// ================================
// FUNCIÓN 1: ANALIZAR ESTADO ACTUAL
// ================================

function analyzeCurrentState() {
  console.log('📊 ANALIZANDO ESTADO ACTUAL:');
  console.log('===========================\n');

  // Verificar routes.ts
  const routesPath = path.join(SERVER_PATH, 'routes.ts');
  if (fs.existsSync(routesPath)) {
    const routesContent = fs.readFileSync(routesPath, 'utf8');
    const routesLines = routesContent.split('\n');
    
    console.log('📁 ROUTES.TS:');
    
    // Contar imports del storage
    const storageImports = routesLines.filter(line => 
      line.includes("from './storage/index.js'")
    );
    console.log(`   📦 Imports de storage: ${storageImports.length}`);
    
    if (storageImports.length > 1) {
      console.log('   ⚠️ Imports duplicados detectados');
      storageImports.forEach((line, index) => {
        console.log(`      ${index + 1}. ${line.trim()}`);
      });
    }
    
    // Buscar patrones obsoletos
    const obsoletePatterns = [
      'getTenantDb(',
      'createTenantStorage(',
      "await import('./storage.js')"
    ];
    
    obsoletePatterns.forEach(pattern => {
      const count = routesContent.split(pattern).length - 1;
      if (count > 0) {
        console.log(`   ❌ Patrón obsoleto "${pattern}": ${count} ocurrencias`);
      }
    });
    
    console.log('');
  }

  // Verificar index.ts
  const indexPath = path.join(SERVER_PATH, 'index.ts');
  if (fs.existsSync(indexPath)) {
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    const indexLines = indexContent.split('\n');
    
    console.log('📁 INDEX.TS:');
    
    // Contar imports dinámicos
    const dynamicImports = indexLines.filter(line => 
      line.includes("await import('./storage.js')")
    );
    console.log(`   🔄 Imports dinámicos: ${dynamicImports.length}`);
    
    // Contar endpoints migrados
    const endpoints = indexContent.match(/apiRouter\.(get|post|put|delete)\(/g) || [];
    const migrated = indexContent.match(/getTenantStorageForUser\(user\)/g) || [];
    console.log(`   📈 Endpoints migrados: ${migrated.length}/${endpoints.length}`);
    
    // Buscar patrones problemáticos
    const problematic = [
      'storage.getAllUsers(user.storeId)',
      'storage.getUserNotifications(user.id, user.storeId)',
      'storage.getStoreConfig(user.storeId)',
      'const { getTenantDb }',
      'createTenantStorage(tenantDb)'
    ];
    
    let totalIssues = 0;
    problematic.forEach(pattern => {
      const count = indexContent.split(pattern).length - 1;
      if (count > 0) {
        console.log(`   ❌ "${pattern}": ${count} ocurrencias`);
        totalIssues += count;
      }
    });
    
    if (totalIssues === 0) {
      console.log('   ✅ No se encontraron patrones problemáticos');
    }
    
    console.log('');
  }

  // Verificar storage/index.ts
  const storagePath = path.join(SERVER_PATH, 'storage', 'index.ts');
  if (fs.existsSync(storagePath)) {
    const storageContent = fs.readFileSync(storagePath, 'utf8');
    
    console.log('📁 STORAGE/INDEX.TS:');
    
    const requiredFunctions = [
      'getMasterStorage',
      'getTenantStorage',
      'getTenantStorageForUser',
      'validateTenantAccess'
    ];
    
    const missingFunctions = requiredFunctions.filter(func => 
      !storageContent.includes(`export function ${func}`) && 
      !storageContent.includes(`export async function ${func}`)
    );
    
    if (missingFunctions.length === 0) {
      console.log('   ✅ Todas las funciones necesarias están presentes');
    } else {
      console.log(`   ❌ Funciones faltantes: ${missingFunctions.join(', ')}`);
    }
    
    console.log('');
  } else {
    console.log('❌ STORAGE/INDEX.TS: No encontrado\n');
  }
}

// ================================
// FUNCIÓN 2: LIMPIAR ROUTES.TS
// ================================

function cleanRoutes() {
  const routesPath = path.join(SERVER_PATH, 'routes.ts');
  
  if (!fs.existsSync(routesPath)) {
    console.log('⚠️ routes.ts no encontrado');
    return false;
  }

  console.log('🧹 Limpiando routes.ts...');
  
  // Backup
  const backupPath = path.join(BACKUP_PATH, `routes.ts.simple-cleanup-${Date.now()}`);
  fs.copyFileSync(routesPath, backupPath);
  console.log('   ✅ Backup creado');

  let content = fs.readFileSync(routesPath, 'utf8');
  const originalLength = content.length;
  let changesMade = false;

  // 1. Buscar y eliminar imports duplicados de storage de forma simple
  const lines = content.split('\n');
  const cleanedLines = [];
  let storageImportFound = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Si es un import del storage/index.js
    if (line.includes("from './storage/index.js'")) {
      if (!storageImportFound) {
        // Mantener el primer import
        cleanedLines.push(line);
        storageImportFound = true;
      } else {
        // Eliminar imports adicionales
        console.log(`   🧹 Eliminando import duplicado: ${line.trim()}`);
        changesMade = true;
        continue;
      }
    } else {
      cleanedLines.push(line);
    }
  }

  content = cleanedLines.join('\n');

  // 2. Eliminar imports obsoletos
  const obsoleteImports = [
    "import { getTenantDb } from './multi-tenant-db.js';",
    "import { createTenantStorage } from './tenant-storage.js';"
  ];

  obsoleteImports.forEach(obsoleteImport => {
    if (content.includes(obsoleteImport)) {
      content = content.replace(obsoleteImport + '\n', '');
      console.log(`   🧹 Eliminado: ${obsoleteImport}`);
      changesMade = true;
    }
  });

  // Guardar si hubo cambios
  if (changesMade) {
    fs.writeFileSync(routesPath, content, 'utf8');
    console.log('   ✅ routes.ts limpiado\n');
    return true;
  } else {
    console.log('   ℹ️ routes.ts ya estaba limpio\n');
    return false;
  }
}

// ================================
// FUNCIÓN 3: LIMPIAR INDEX.TS
// ================================

function cleanIndex() {
  const indexPath = path.join(SERVER_PATH, 'index.ts');
  
  if (!fs.existsSync(indexPath)) {
    console.log('⚠️ index.ts no encontrado');
    return false;
  }

  console.log('🧹 Limpiando index.ts...');
  
  // Backup
  const backupPath = path.join(BACKUP_PATH, `index.ts.simple-cleanup-${Date.now()}`);
  fs.copyFileSync(indexPath, backupPath);
  console.log('   ✅ Backup creado');

  let content = fs.readFileSync(indexPath, 'utf8');
  let changesMade = false;

  // 1. Eliminar imports dinámicos
  const dynamicImportLines = [
    "const { storage } = await import('./storage.js');",
    "    const { storage } = await import('./storage.js');"
  ];

  dynamicImportLines.forEach(line => {
    const count = content.split(line).length - 1;
    if (count > 0) {
      content = content.split(line).join('');
      console.log(`   🧹 Eliminadas ${count} líneas de import dinámico`);
      changesMade = true;
    }
  });

  // 2. Eliminar bloques obsoletos completos
  const obsoleteBlocks = [
    "const { getTenantDb } = await import('./multi-tenant-db.js');",
    "const { createTenantStorage } = await import('./tenant-storage.js');",
    "const tenantDb = await getTenantDb(user.storeId);",
    "const tenantStorage = createTenantStorage(tenantDb);"
  ];

  obsoleteBlocks.forEach(block => {
    const count = content.split(block).length - 1;
    if (count > 0) {
      content = content.split(block).join('');
      console.log(`   🧹 Eliminadas ${count} líneas obsoletas`);
      changesMade = true;
    }
  });

  // 3. Agregar imports necesarios si faltan
  if (!content.includes("import { storage } from './storage.js';")) {
    // Buscar primer import para insertar después
    const firstImportIndex = content.indexOf('import ');
    if (firstImportIndex !== -1) {
      const beforeFirstImport = content.substring(0, firstImportIndex);
      const fromFirstImport = content.substring(firstImportIndex);
      content = beforeFirstImport + "import { storage } from './storage.js';\n" + fromFirstImport;
      console.log('   ✅ Agregado import de storage');
      changesMade = true;
    }
  }

  if (!content.includes("import { getTenantStorageForUser }") && 
      content.includes('getTenantStorageForUser')) {
    const storageImportIndex = content.indexOf("import { storage } from './storage.js';");
    if (storageImportIndex !== -1) {
      const insertPoint = storageImportIndex + "import { storage } from './storage.js';".length;
      const before = content.substring(0, insertPoint);
      const after = content.substring(insertPoint);
      content = before + "\nimport { getTenantStorageForUser } from './storage/index.js';" + after;
      console.log('   ✅ Agregado import getTenantStorageForUser');
      changesMade = true;
    }
  }

  // Guardar si hubo cambios
  if (changesMade) {
    fs.writeFileSync(indexPath, content, 'utf8');
    console.log('   ✅ index.ts limpiado\n');
    return true;
  } else {
    console.log('   ℹ️ index.ts ya estaba limpio\n');
    return false;
  }
}

// ================================
// FUNCIÓN 4: VALIDACIÓN FINAL
// ================================

function finalValidation() {
  console.log('🔍 VALIDACIÓN FINAL:');
  console.log('==================\n');

  let allGood = true;
  const issues = [];

  // Verificar routes.ts
  const routesPath = path.join(SERVER_PATH, 'routes.ts');
  if (fs.existsSync(routesPath)) {
    const routesContent = fs.readFileSync(routesPath, 'utf8');
    
    // Verificar imports duplicados
    const storageImportCount = (routesContent.match(/from '\.\/storage\/index\.js'/g) || []).length;
    if (storageImportCount > 1) {
      issues.push(`routes.ts: ${storageImportCount} imports duplicados del storage`);
      allGood = false;
    }
    
    // Verificar patrones obsoletos
    const obsoletePatterns = ['getTenantDb(', 'createTenantStorage('];
    obsoletePatterns.forEach(pattern => {
      if (routesContent.includes(pattern)) {
        issues.push(`routes.ts: Contiene patrón obsoleto "${pattern}"`);
        allGood = false;
      }
    });
  }

  // Verificar index.ts
  const indexPath = path.join(SERVER_PATH, 'index.ts');
  if (fs.existsSync(indexPath)) {
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    
    // Verificar imports dinámicos
    const dynamicImportCount = (indexContent.match(/await import\('\.\/storage\.js'\)/g) || []).length;
    if (dynamicImportCount > 0) {
      issues.push(`index.ts: ${dynamicImportCount} imports dinámicos restantes`);
      allGood = false;
    }
    
    // Verificar patrones sin migrar
    const unmigrated = [
      'storage.getAllUsers(user.storeId)',
      'storage.getUserNotifications(user.id, user.storeId)'
    ];
    
    unmigrated.forEach(pattern => {
      if (indexContent.includes(pattern)) {
        issues.push(`index.ts: Patrón sin migrar "${pattern}"`);
        allGood = false;
      }
    });
  }

  // Mostrar resultados
  if (allGood) {
    console.log('✅ Todos los archivos están correctos');
    console.log('\n🎉 ¡MIGRACIÓN COMPLETADA EXITOSAMENTE!');
    console.log('\n📋 PRÓXIMOS PASOS:');
    console.log('1. npm run build');
    console.log('2. npm run dev');
    console.log('3. Probar endpoints migrados');
  } else {
    console.log('❌ Problemas encontrados:');
    issues.forEach(issue => console.log(`   - ${issue}`));
    console.log('\n💡 Ejecuta el script nuevamente o corrige manualmente');
  }

  return allGood;
}

// ================================
// FUNCIÓN PRINCIPAL
// ================================

async function main() {
  try {
    // 1. Analizar estado actual
    analyzeCurrentState();
    
    // 2. Limpiar archivos
    const routesCleaned = cleanRoutes();
    const indexCleaned = cleanIndex();
    
    // 3. Validación final
    const isValid = finalValidation();
    
    console.log('\n📊 RESUMEN:');
    console.log('===========');
    console.log(`✅ routes.ts: ${routesCleaned ? 'Limpiado' : 'Ya estaba bien'}`);
    console.log(`✅ index.ts: ${indexCleaned ? 'Limpiado' : 'Ya estaba bien'}`);
    console.log(`✅ Validación: ${isValid ? 'Exitosa' : 'Con problemas'}`);

  } catch (error) {
    console.error('\n💥 Error durante limpieza:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);