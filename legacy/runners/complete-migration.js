// complete-migration.js
// Script para migrar los endpoints restantes que aún usan import dinámico

import fs from 'fs';
import path from 'path';

const SERVER_PATH = path.join(process.cwd(), 'server');
const BACKUP_PATH = path.join(process.cwd(), '.migration-backup');

console.log('🔄 Completando migración de endpoints restantes...\n');

function completeIndexMigration() {
  const indexPath = path.join(SERVER_PATH, 'index.ts');
  
  if (!fs.existsSync(indexPath)) {
    console.log('⚠️ index.ts no encontrado');
    return false;
  }

  console.log('📝 Migrando endpoints restantes en index.ts...');
  
  // Backup adicional
  const backupPath = path.join(BACKUP_PATH, `index.ts.backup-${Date.now()}`);
  fs.copyFileSync(indexPath, backupPath);
  console.log('   ✅ Backup adicional creado');

  let content = fs.readFileSync(indexPath, 'utf8');

  // 1. Eliminar TODOS los imports dinámicos de storage restantes
  const dynamicImportPattern = /const { storage } = await import\('\.\/storage\.js'\);\s*\n\s*/g;
  content = content.replace(dynamicImportPattern, '');
  console.log('   ✅ Eliminados imports dinámicos restantes');

  // 2. Agregar import de storage al inicio si no existe
  if (!content.includes("import { storage }")) {
    const firstImportLine = content.indexOf('import');
    if (firstImportLine !== -1) {
      const beforeFirstImport = content.substring(0, firstImportLine);
      const fromFirstImport = content.substring(firstImportLine);
      content = beforeFirstImport + "import { storage } from './storage.js';\n" + fromFirstImport;
      console.log('   ✅ Agregado import de storage');
    }
  }

  // 3. Verificar que getTenantStorageForUser esté importado
  if (!content.includes('getTenantStorageForUser')) {
    const storageImportRegex = /(import { storage } from '\.\/storage\.js';)/;
    const newImport = `$1
import { getTenantStorageForUser } from './storage/index.js';`;
    content = content.replace(storageImportRegex, newImport);
    console.log('   ✅ Agregado import getTenantStorageForUser');
  }

  // 4. Reemplazar patrones específicos de endpoints
  
  // Usuarios endpoint
  const usersPattern = /(apiRouter\.get\('\/users',[\s\S]*?try \{[\s\S]*?)(const user = \(req as any\)\.user;\s*)(const users = await storage\.getAllUsers\(user\.storeId\);)/;
  if (usersPattern.test(content)) {
    content = content.replace(usersPattern, `$1$2const tenantStorage = await getTenantStorageForUser(user);
    const users = await tenantStorage.getAllUsers();`);
    console.log('   ✅ Migrado endpoint /users');
  }

  // Notifications endpoint
  const notificationsPattern = /(apiRouter\.get\('\/notifications',[\s\S]*?try \{[\s\S]*?)(const user = \(req as any\)\.user;\s*)(const notifications = await storage\.getUserNotifications\(user\.id, user\.storeId\);)/;
  if (notificationsPattern.test(content)) {
    content = content.replace(notificationsPattern, `$1$2const tenantStorage = await getTenantStorageForUser(user);
    const notifications = await tenantStorage.getUserNotifications(user.id);`);
    console.log('   ✅ Migrado endpoint /notifications');
  }

  // Notification counts endpoint
  const notificationCountsPattern = /(apiRouter\.get\('\/notifications\/count',[\s\S]*?try \{[\s\S]*?)(const user = \(req as any\)\.user;\s*const userId = parseInt\(req\.query\.userId as string\) \|\| user\.id;\s*)(const counts = await storage\.getNotificationCounts\(userId\);)/;
  if (notificationCountsPattern.test(content)) {
    content = content.replace(notificationCountsPattern, `$1$2const tenantStorage = await getTenantStorageForUser(user);
    const counts = await tenantStorage.getNotificationCounts(userId);`);
    console.log('   ✅ Migrado endpoint /notifications/count');
  }

  // Settings GET endpoint
  const settingsGetPattern = /(apiRouter\.get\('\/settings',[\s\S]*?try \{[\s\S]*?)(const user = \(req as any\)\.user;\s*)(const settings = await storage\.getStoreConfig\(user\.storeId\);)/;
  if (settingsGetPattern.test(content)) {
    content = content.replace(settingsGetPattern, `$1$2const tenantStorage = await getTenantStorageForUser(user);
    const settings = await tenantStorage.getStoreConfig();`);
    console.log('   ✅ Migrado endpoint GET /settings');
  }

  // Settings PUT endpoint
  const settingsPutPattern = /(apiRouter\.put\('\/settings',[\s\S]*?try \{[\s\S]*?)(const user = \(req as any\)\.user;\s*)(const settings = await storage\.updateStoreSettings\(user\.storeId, req\.body\);)/;
  if (settingsPutPattern.test(content)) {
    content = content.replace(settingsPutPattern, `$1$2const tenantStorage = await getTenantStorageForUser(user);
    const settings = await tenantStorage.updateStoreSettings(req.body);`);
    console.log('   ✅ Migrado endpoint PUT /settings');
  }

  // WhatsApp settings endpoint
  const whatsappPattern = /(apiRouter\.get\('\/whatsapp-settings',[\s\S]*?try \{[\s\S]*?)(const user = \(req as any\)\.user;\s*)(const settings = await storage\.getWhatsAppSettings\(user\.storeId\);)/;
  if (whatsappPattern.test(content)) {
    content = content.replace(whatsappPattern, `$1$2const tenantStorage = await getTenantStorageForUser(user);
    const settings = await tenantStorage.getWhatsAppSettings();`);
    console.log('   ✅ Migrado endpoint /whatsapp-settings');
  }

  // Reports endpoint
  const reportsPattern = /(apiRouter\.get\('\/reports',[\s\S]*?try \{[\s\S]*?)(const user = \(req as any\)\.user;\s*const \{ type, startDate, endDate \} = req\.query;\s*)(const reports = await storage\.getReports\(user\.storeId, \{[\s\S]*?\}\);)/;
  if (reportsPattern.test(content)) {
    content = content.replace(reportsPattern, `$1$2const tenantStorage = await getTenantStorageForUser(user);
    const reports = await tenantStorage.getReports({
      type: type as string,
      startDate: startDate as string,
      endDate: endDate as string
    });`);
    console.log('   ✅ Migrado endpoint /reports');
  }

  // Guardar archivo
  fs.writeFileSync(indexPath, content, 'utf8');
  console.log('   ✅ index.ts completamente migrado\n');
  
  return true;
}

function updateStorageCompatibility() {
  const storagePath = path.join(SERVER_PATH, 'storage', 'index.ts');
  
  if (!fs.existsSync(storagePath)) {
    console.log('⚠️ storage/index.ts no encontrado');
    return false;
  }

  console.log('📝 Actualizando storage de compatibilidad...');

  // Mejorar el archivo de compatibilidad para manejar más métodos
  const improvedCompatibility = `// server/storage/index.ts
// Punto de entrada temporal para migración gradual

// Importar storage original para compatibilidad
import { storage as originalStorage } from '../storage.js';

// Exportar la capa de compatibilidad temporal
export { storage } from '../storage.js';

// Implementaciones temporales para las nuevas funciones
export function getMasterStorage() {
  console.log('⚠️ Usando getMasterStorage temporal');
  return originalStorage;
}

export async function getTenantStorage(storeId: number) {
  console.log(\`⚠️ Usando getTenantStorage temporal para store \${storeId}\`);
  // Devolver un wrapper que mantenga compatibilidad
  return {
    getAllProducts: () => originalStorage.getAllProducts(storeId),
    getAllCustomers: () => originalStorage.getAllCustomers(storeId),
    getAllOrders: () => originalStorage.getAllOrders(storeId),
    getOrderById: (id: number) => originalStorage.getOrder(id, storeId),
    createOrder: (orderData: any, items: any[]) => originalStorage.createOrder(orderData, items),
    getAllUsers: () => originalStorage.getAllUsers(storeId),
    getUserNotifications: (userId: number) => originalStorage.getUserNotifications(userId, storeId),
    getNotificationCounts: (userId: number) => originalStorage.getNotificationCounts(userId),
    getStoreConfig: () => originalStorage.getStoreConfig(storeId),
    updateStoreSettings: (settings: any) => originalStorage.updateStoreSettings(storeId, settings),
    getWhatsAppSettings: () => originalStorage.getWhatsAppSettings(storeId),
    getReports: (filters: any) => originalStorage.getReports(storeId, filters),
    // Agregar más métodos según necesidad
  };
}

export async function getTenantStorageForUser(user: { storeId: number }) {
  if (!user.storeId) {
    throw new Error('User does not have a valid store ID');
  }
  return await getTenantStorage(user.storeId);
}

export async function validateTenantAccess(storeId: number) {
  // Validación básica temporal
  if (!storeId || storeId <= 0) {
    throw new Error('Invalid store ID');
  }
  return true;
}

console.log('⚠️ Usando storage de compatibilidad temporal');
console.log('💡 Implementar clases completas para producción');
`;

  fs.writeFileSync(storagePath, improvedCompatibility, 'utf8');
  console.log('   ✅ storage/index.ts mejorado\n');
  
  return true;
}

function validateMigration() {
  const indexPath = path.join(SERVER_PATH, 'index.ts');
  const content = fs.readFileSync(indexPath, 'utf8');
  
  console.log('🔍 Validando migración...');
  
  const issues = [];
  
  // Verificar que no queden imports dinámicos
  if (content.includes("await import('./storage.js')")) {
    issues.push('Quedan imports dinámicos del storage');
  }
  
  // Verificar que storage esté importado
  if (!content.includes("import { storage }") && !content.includes("import { getTenantStorageForUser }")) {
    issues.push('Faltan imports necesarios del storage');
  }
  
  // Verificar patrones problemáticos
  const problematicPatterns = [
    'storage.getAllUsers(user.storeId)',
    'storage.getUserNotifications(user.id, user.storeId)',
    'storage.getStoreConfig(user.storeId)',
    'storage.getWhatsAppSettings(user.storeId)',
    'storage.getReports(user.storeId,'
  ];
  
  problematicPatterns.forEach(pattern => {
    if (content.includes(pattern)) {
      issues.push(`Queda patrón sin migrar: ${pattern}`);
    }
  });
  
  if (issues.length > 0) {
    console.log('   ❌ Problemas encontrados:');
    issues.forEach(issue => console.log(`      - ${issue}`));
    return false;
  } else {
    console.log('   ✅ Migración válida - sin problemas detectados');
    return true;
  }
}

async function main() {
  try {
    const indexMigrated = completeIndexMigration();
    const storageUpdated = updateStorageCompatibility();
    const isValid = validateMigration();

    console.log('📊 RESUMEN DE MIGRACIÓN COMPLETA:');
    console.log('====================================');
    console.log(`✅ index.ts migrado: ${indexMigrated}`);
    console.log(`✅ storage actualizado: ${storageUpdated}`);
    console.log(`✅ validación: ${isValid ? 'Exitosa' : 'Con problemas'}`);

    if (indexMigrated && storageUpdated && isValid) {
      console.log('\n🎉 ¡MIGRACIÓN COMPLETA FINALIZADA!');
      console.log('\n📋 PRÓXIMOS PASOS:');
      console.log('1. Ejecutar: npm run build');
      console.log('2. Probar endpoints en desarrollo');
      console.log('3. Implementar clases completas del storage modular');
      console.log('4. Eliminar storage.ts original cuando esté listo');
    } else {
      console.log('\n⚠️ Migración incompleta - revisar problemas arriba');
    }

  } catch (error) {
    console.error('\n💥 Error durante migración completa:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);