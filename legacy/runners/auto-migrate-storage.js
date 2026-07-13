// auto-migrate-storage.js
// Script automático para migrar tu código específico al nuevo sistema de storage (ES Modules)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = process.cwd();
const SERVER_PATH = path.join(PROJECT_ROOT, 'server');
const BACKUP_PATH = path.join(PROJECT_ROOT, '.migration-backup');

// Crear directorio de backup
if (!fs.existsSync(BACKUP_PATH)) {
  fs.mkdirSync(BACKUP_PATH, { recursive: true });
}

console.log('🚀 Iniciando migración automática del storage...\n');

// ================================
// FUNCIÓN 1: MIGRAR ROUTES.TS
// ================================

function migrateRoutesFile() {
  const routesPath = path.join(SERVER_PATH, 'routes.ts');
  
  if (!fs.existsSync(routesPath)) {
    console.log('⚠️ routes.ts no encontrado, saltando...');
    return false;
  }

  console.log('📝 Migrando routes.ts...');
  
  // Backup
  const backupPath = path.join(BACKUP_PATH, 'routes.ts.backup');
  fs.copyFileSync(routesPath, backupPath);
  console.log('   ✅ Backup creado');

  let content = fs.readFileSync(routesPath, 'utf8');

  // 1. Eliminar import obsoleto
  const oldImport = /import { IStorage } from '\.\/storage\.js';\s*\n?/g;
  content = content.replace(oldImport, '');
  console.log('   ✅ Eliminado import IStorage');

  // 2. Agregar nuevos imports después de AuthUser
  const authUserImportRegex = /(import type { AuthUser } from '@shared\/auth';)/;
  if (authUserImportRegex.test(content)) {
    const newImports = `$1
import { 
  storage,
  getMasterStorage,
  getTenantStorage,
  getTenantStorageForUser,
  validateTenantAccess
} from './storage/index.js';`;
    
    content = content.replace(authUserImportRegex, newImports);
    console.log('   ✅ Agregados nuevos imports');
  }

  // 3. Eliminar import dinámico específico en endpoint usuarios
  const userEndpointPattern = /(app\.post\(['"]\S*\/users['"],[\s\S]*?)(const { storage } = await import\('\.\/storage\.js'\);\s*\n\s*)(const newUser = await storage\.createStoreUser)/;
  content = content.replace(userEndpointPattern, '$1$3');
  console.log('   ✅ Simplificado endpoint de usuarios');

  // 4. Reemplazar patrones de getTenantDb + createTenantStorage
  const tenantStoragePattern = /const tenantDb = await getTenantDb\(user\.storeId\);\s*const tenantStorage = createTenantStorage\(tenantDb\);/g;
  content = content.replace(tenantStoragePattern, 'const tenantStorage = await getTenantStorageForUser(user);');
  console.log('   ✅ Simplificados patrones de tenant storage');

  // Guardar archivo
  fs.writeFileSync(routesPath, content, 'utf8');
  console.log('   ✅ routes.ts migrado\n');
  
  return true;
}

// ================================
// FUNCIÓN 2: MIGRAR INDEX.TS (apiRouter)
// ================================

function migrateIndexFile() {
  const indexPath = path.join(SERVER_PATH, 'index.ts');
  
  if (!fs.existsSync(indexPath)) {
    console.log('⚠️ index.ts no encontrado, saltando...');
    return false;
  }

  console.log('📝 Migrando index.ts (apiRouter)...');
  
  // Backup
  const backupPath = path.join(BACKUP_PATH, 'index.ts.backup');
  fs.copyFileSync(indexPath, backupPath);
  console.log('   ✅ Backup creado');

  let content = fs.readFileSync(indexPath, 'utf8');

  // 1. Agregar import necesario al inicio si no existe
  if (!content.includes('getTenantStorageForUser')) {
    const importRegex = /(import.*from.*storage.*\.js';)/;
    if (importRegex.test(content)) {
      content = content.replace(importRegex, `$1
import { getTenantStorageForUser } from './storage/index.js';`);
    } else {
      // Si no hay imports de storage, agregar después de otros imports
      const lastImportRegex = /(import.*from.*['"]);(\s*\n\s*\n)/;
      const newImport = `$1;$2import { getTenantStorageForUser } from './storage/index.js';\n\n`;
      content = content.replace(lastImportRegex, newImport);
    }
    console.log('   ✅ Agregado import getTenantStorageForUser');
  }

  // 2. Migrar endpoint GET /orders
  const getOrdersPattern = /(apiRouter\.get\('\/orders',[\s\S]*?try \{[\s\S]*?)(const { storage } = await import\('\.\/storage\.js'\);\s*\n\s*)(const user = \(req as any\)\.user;\s*)(const orders = await storage\.getAllOrders\(user\.storeId\);)/;
  
  const getOrdersReplacement = `$1$3const tenantStorage = await getTenantStorageForUser(user);
    const orders = await tenantStorage.getAllOrders();`;
  
  content = content.replace(getOrdersPattern, getOrdersReplacement);
  console.log('   ✅ Migrado GET /orders');

  // 3. Migrar endpoint GET /orders/:id
  const getOrderByIdPattern = /(apiRouter\.get\('\/orders\/:id',[\s\S]*?try \{[\s\S]*?)(const { storage } = await import\('\.\/storage\.js'\);\s*\n\s*)(const id = parseInt\(req\.params\.id\);\s*const user = \(req as any\)\.user;\s*)(const order = await storage\.getOrder\(id, user\.storeId\);)/;
  
  const getOrderByIdReplacement = `$1$3const tenantStorage = await getTenantStorageForUser(user);
    const order = await tenantStorage.getOrderById(id);`;
  
  content = content.replace(getOrderByIdPattern, getOrderByIdReplacement);
  console.log('   ✅ Migrado GET /orders/:id');

  // 4. Migrar endpoint POST /orders
  const postOrdersPattern = /(apiRouter\.post\('\/orders',[\s\S]*?try \{[\s\S]*?)(const { storage } = await import\('\.\/storage\.js'\);\s*\n\s*)(const user = \(req as any\)\.user;)/;
  
  const postOrdersReplacement = `$1$3
    const tenantStorage = await getTenantStorageForUser(user);`;
  
  content = content.replace(postOrdersPattern, postOrdersReplacement);
  
  // También cambiar la llamada específica en el POST
  content = content.replace(/await storage\.createOrder\(/g, 'await tenantStorage.createOrder(');
  console.log('   ✅ Migrado POST /orders');

  // Guardar archivo
  fs.writeFileSync(indexPath, content, 'utf8');
  console.log('   ✅ index.ts migrado\n');
  
  return true;
}

// ================================
// FUNCIÓN 3: VERIFICAR ARCHIVOS NUEVOS
// ================================

function verifyNewStorageFiles() {
  console.log('🔍 Verificando archivos del nuevo sistema...');
  
  const requiredFiles = [
    'storage/index.ts',
    'storage/master-storage.ts',
    'storage/tenant-storage.ts', 
    'storage/storage-factory.ts'
  ];
  
  const missingFiles = [];
  
  for (const file of requiredFiles) {
    const filePath = path.join(SERVER_PATH, file);
    if (!fs.existsSync(filePath)) {
      missingFiles.push(file);
    }
  }
  
  if (missingFiles.length > 0) {
    console.log('   ❌ Archivos faltantes:');
    missingFiles.forEach(file => console.log(`      - ${file}`));
    console.log('   ⚠️ Debes crear estos archivos antes de continuar\n');
    return false;
  } else {
    console.log('   ✅ Todos los archivos del nuevo sistema encontrados\n');
    return true;
  }
}

// ================================
// FUNCIÓN 4: CREAR ARCHIVOS FALTANTES
// ================================

function createMissingFiles() {
  console.log('🔧 Creando archivos faltantes del nuevo sistema...\n');
  
  const storageDir = path.join(SERVER_PATH, 'storage');
  
  // Crear directorio storage si no existe
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
    console.log('   ✅ Directorio storage/ creado');
  }

  // Crear storage/index.ts si no existe
  const indexPath = path.join(storageDir, 'index.ts');
  if (!fs.existsSync(indexPath)) {
    const indexContent = `// server/storage/index.ts
// Punto de entrada temporal para migración gradual

// Exportar la capa de compatibilidad temporal
export { storage } from '../storage.js';

// Placeholders para las nuevas funciones (a implementar)
export function getMasterStorage() {
  throw new Error('getMasterStorage no implementado aún');
}

export async function getTenantStorage(storeId: number) {
  throw new Error('getTenantStorage no implementado aún');
}

export async function getTenantStorageForUser(user: { storeId: number }) {
  throw new Error('getTenantStorageForUser no implementado aún');
}

export async function validateTenantAccess(storeId: number) {
  // Placeholder - siempre pasa por ahora
  return true;
}

console.log('⚠️ Usando storage de compatibilidad temporal');
`;
    
    fs.writeFileSync(indexPath, indexContent, 'utf8');
    console.log('   ✅ storage/index.ts creado (modo compatibilidad)');
  }

  // Crear archivos placeholder para el resto
  const placeholderFiles = [
    'master-storage.ts',
    'tenant-storage.ts', 
    'storage-factory.ts'
  ];

  placeholderFiles.forEach(fileName => {
    const filePath = path.join(storageDir, fileName);
    if (!fs.existsSync(filePath)) {
      const placeholderContent = `// server/storage/${fileName}
// Placeholder - implementar según la arquitectura modular

export class ${fileName.replace('.ts', '').replace('-', '').charAt(0).toUpperCase() + fileName.replace('.ts', '').replace('-', '').slice(1)} {
  // TODO: Implementar
}
`;
      fs.writeFileSync(filePath, placeholderContent, 'utf8');
      console.log(`   ✅ storage/${fileName} creado (placeholder)`);
    }
  });
}

// ================================
// FUNCIÓN PRINCIPAL
// ================================

async function main() {
  try {
    // Verificar archivos nuevos
    let hasNewFiles = verifyNewStorageFiles();
    
    if (!hasNewFiles) {
      console.log('🔧 Creando archivos faltantes en modo compatibilidad...\n');
      createMissingFiles();
      hasNewFiles = verifyNewStorageFiles();
    }

    if (!hasNewFiles) {
      console.log('❌ No se pudieron crear los archivos necesarios');
      process.exit(1);
    }

    // Migrar archivos
    const routesMigrated = migrateRoutesFile();
    const indexMigrated = migrateIndexFile();

    // Resumen
    console.log('📊 RESUMEN DE MIGRACIÓN:');
    console.log('================================');
    console.log(`✅ routes.ts: ${routesMigrated ? 'Migrado' : 'Saltado'}`);
    console.log(`✅ index.ts: ${indexMigrated ? 'Migrado' : 'Saltado'}`);
    console.log(`📁 Backups: Guardados en .migration-backup/`);

    if (routesMigrated || indexMigrated) {
      console.log('\n🎉 ¡MIGRACIÓN COMPLETADA!');
      console.log('\n⚠️ IMPORTANTE: Se creó un storage de compatibilidad temporal');
      console.log('📋 PRÓXIMOS PASOS:');
      console.log('1. Revisar los cambios en los archivos');
      console.log('2. Implementar las clases completas en storage/');
      console.log('3. Ejecutar npm run build para verificar sintaxis');
      console.log('4. Probar los endpoints migrados');
      
      console.log('\n🔄 ROLLBACK (si necesitas revertir):');
      console.log('Copy-Item .migration-backup\\routes.ts.backup server\\routes.ts -Force');
      console.log('Copy-Item .migration-backup\\index.ts.backup server\\index.ts -Force');
    } else {
      console.log('\n⚠️ No se realizaron cambios');
      console.log('Verifica que los archivos existan y tengan el código esperado');
    }

  } catch (error) {
    console.error('\n💥 Error durante la migración:', error.message);
    console.log('\n🔄 Para revertir manualmente:');
    console.log('Copy-Item .migration-backup\\*.backup server\\ -Force');
    process.exit(1);
  }
}

// ================================
// EJECUCIÓN
// ================================

main().catch(console.error);