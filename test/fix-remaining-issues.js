// fix-remaining-issues.js
// Script para corregir los problemas restantes de la migración

import fs from 'fs';
import path from 'path';

const SERVER_PATH = path.join(process.cwd(), 'server');
const BACKUP_PATH = path.join(process.cwd(), '.migration-backup');

console.log('🔧 Corrigiendo problemas restantes de migración...\n');

function fixRemainingIssues() {
  const indexPath = path.join(SERVER_PATH, 'index.ts');
  
  if (!fs.existsSync(indexPath)) {
    console.log('⚠️ index.ts no encontrado');
    return false;
  }

  console.log('📝 Corrigiendo index.ts...');
  
  // Backup adicional
  const backupPath = path.join(BACKUP_PATH, `index.ts.fix-${Date.now()}`);
  fs.copyFileSync(indexPath, backupPath);
  console.log('   ✅ Backup adicional creado');

  let content = fs.readFileSync(indexPath, 'utf8');
  const originalContent = content;

  // 1. ELIMINAR TODOS los imports dinámicos restantes - versión más agresiva
  console.log('   🔍 Buscando imports dinámicos...');
  
  // Buscar todas las líneas que contienen await import('./storage.js')
  const lines = content.split('\n');
  const cleanedLines = lines.filter(line => !line.includes("await import('./storage.js')"));
  
  if (lines.length !== cleanedLines.length) {
    content = cleanedLines.join('\n');
    console.log(`   ✅ Eliminadas ${lines.length - cleanedLines.length} líneas con imports dinámicos`);
  }

  // 2. Asegurar que los imports estén al inicio
  if (!content.includes("import { storage } from './storage.js';")) {
    const firstImportMatch = content.match(/^import .*/m);
    if (firstImportMatch) {
      const insertIndex = content.indexOf(firstImportMatch[0]);
      content = content.slice(0, insertIndex) + 
                "import { storage } from './storage.js';\n" + 
                content.slice(insertIndex);
      console.log('   ✅ Agregado import de storage');
    }
  }

  if (!content.includes("import { getTenantStorageForUser } from './storage/index.js';")) {
    const storageImportMatch = content.match(/import { storage } from '\.\/storage\.js';/);
    if (storageImportMatch) {
      content = content.replace(
        /import { storage } from '\.\/storage\.js';/,
        "import { storage } from './storage.js';\nimport { getTenantStorageForUser } from './storage/index.js';"
      );
      console.log('   ✅ Agregado import getTenantStorageForUser');
    }
  }

  // 3. CORREGIR patrones específicos que no se migraron
  
  // Endpoint /users - buscar patrón más específico
  console.log('   🔍 Buscando endpoint /users...');
  const usersEndpointRegex = /apiRouter\.get\('\/users',\s*authenticateToken,\s*async\s*\(req,\s*res\)\s*=>\s*{\s*try\s*{\s*(.*?\s*)const\s+user\s*=\s*\(req\s+as\s+any\)\.user;\s*const\s+users\s*=\s*await\s+storage\.getAllUsers\(user\.storeId\);/s;
  
  if (usersEndpointRegex.test(content)) {
    content = content.replace(usersEndpointRegex, `apiRouter.get('/users', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantStorage = await getTenantStorageForUser(user);
    const users = await tenantStorage.getAllUsers();`);
    console.log('   ✅ Corregido endpoint /users');
  } else {
    // Buscar patrón alternativo
    const alternativeUsersPattern = /const\s+users\s*=\s*await\s+storage\.getAllUsers\(user\.storeId\);/g;
    if (alternativeUsersPattern.test(content)) {
      content = content.replace(alternativeUsersPattern, 
        `const tenantStorage = await getTenantStorageForUser(user);
    const users = await tenantStorage.getAllUsers();`);
      console.log('   ✅ Corregido llamada a storage.getAllUsers');
    }
  }

  // 4. Corregir cualquier otro patrón restante con storeId
  const patterns = [
    {
      old: /storage\.getUserNotifications\(user\.id,\s*user\.storeId\)/g,
      new: 'tenantStorage.getUserNotifications(user.id)',
      name: 'getUserNotifications'
    },
    {
      old: /storage\.getStoreConfig\(user\.storeId\)/g,
      new: 'tenantStorage.getStoreConfig()',
      name: 'getStoreConfig'
    },
    {
      old: /storage\.updateStoreSettings\(user\.storeId,\s*req\.body\)/g,
      new: 'tenantStorage.updateStoreSettings(req.body)',
      name: 'updateStoreSettings'
    },
    {
      old: /storage\.getWhatsAppSettings\(user\.storeId\)/g,
      new: 'tenantStorage.getWhatsAppSettings()',
      name: 'getWhatsAppSettings'
    }
  ];

  patterns.forEach(pattern => {
    if (pattern.old.test(content)) {
      content = content.replace(pattern.old, pattern.new);
      console.log(`   ✅ Corregido ${pattern.name}`);
    }
  });

  // 5. Verificar que no haya líneas huérfanas de getTenantStorageForUser
  const lines2 = content.split('\n');
  const fixedLines = [];
  let needsTenantStorage = false;

  for (let i = 0; i < lines2.length; i++) {
    const line = lines2[i];
    
    // Si encontramos una línea que usa tenantStorage pero no se definió antes
    if (line.includes('tenantStorage.') && !needsTenantStorage) {
      // Buscar hacia atrás para ver si ya está definido en este bloque
      let found = false;
      for (let j = i - 1; j >= 0 && j > i - 10; j--) {
        if (lines2[j].includes('const tenantStorage = await getTenantStorageForUser')) {
          found = true;
          break;
        }
        if (lines2[j].includes('try {') || lines2[j].includes('async (')) {
          break;
        }
      }
      
      if (!found) {
        // Agregar la línea de tenantStorage antes
        const indent = line.match(/^\s*/)[0];
        fixedLines.push(`${indent}const tenantStorage = await getTenantStorageForUser(user);`);
        needsTenantStorage = true;
      }
    }
    
    if (line.includes('const user = (req as any).user;')) {
      needsTenantStorage = true;
    }
    
    if (line.includes('} catch') || line.includes('});')) {
      needsTenantStorage = false;
    }
    
    fixedLines.push(line);
  }

  content = fixedLines.join('\n');

  // Guardar solo si hubo cambios
  if (content !== originalContent) {
    fs.writeFileSync(indexPath, content, 'utf8');
    console.log('   ✅ Cambios aplicados a index.ts\n');
    return true;
  } else {
    console.log('   ℹ️ No se necesitaron cambios adicionales\n');
    return false;
  }
}

function validateFix() {
  const indexPath = path.join(SERVER_PATH, 'index.ts');
  const content = fs.readFileSync(indexPath, 'utf8');
  
  console.log('🔍 Validando correcciones...');
  
  const issues = [];
  
  // Verificar imports dinámicos
  if (content.includes("await import('./storage.js')")) {
    const matches = content.match(/await import\('\.\/storage\.js'\)/g);
    issues.push(`Quedan ${matches ? matches.length : 0} imports dinámicos`);
  }
  
  // Verificar patrones problemáticos
  const problematicPatterns = [
    { pattern: 'storage.getAllUsers(user.storeId)', name: 'getAllUsers con storeId' },
    { pattern: 'storage.getUserNotifications(user.id, user.storeId)', name: 'getUserNotifications con storeId' },
    { pattern: 'storage.getStoreConfig(user.storeId)', name: 'getStoreConfig con storeId' },
    { pattern: 'storage.updateStoreSettings(user.storeId,', name: 'updateStoreSettings con storeId' },
    { pattern: 'storage.getWhatsAppSettings(user.storeId)', name: 'getWhatsAppSettings con storeId' }
  ];
  
  problematicPatterns.forEach(({ pattern, name }) => {
    if (content.includes(pattern)) {
      issues.push(`Patrón sin migrar: ${name}`);
    }
  });

  // Verificar imports requeridos
  if (!content.includes("import { storage }")) {
    issues.push('Falta import de storage');
  }
  
  if (!content.includes("import { getTenantStorageForUser }")) {
    issues.push('Falta import de getTenantStorageForUser');
  }

  if (issues.length > 0) {
    console.log('   ❌ Problemas restantes:');
    issues.forEach(issue => console.log(`      - ${issue}`));
    
    // Mostrar líneas específicas con problemas
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      if (line.includes("await import('./storage.js')")) {
        console.log(`   📍 Línea ${index + 1}: ${line.trim()}`);
      }
      if (line.includes('storage.getAllUsers(user.storeId)')) {
        console.log(`   📍 Línea ${index + 1}: ${line.trim()}`);
      }
    });
    
    return false;
  } else {
    console.log('   ✅ Todas las correcciones aplicadas correctamente');
    return true;
  }
}

function showNextSteps() {
  console.log('\n📋 PRÓXIMOS PASOS:');
  console.log('1. Ejecutar: npm run build');
  console.log('2. Si hay errores de TypeScript, revisar tipos');
  console.log('3. Probar endpoints: npm run dev');
  console.log('4. Verificar que funcionan los endpoints migrados');
  
  console.log('\n🧪 COMANDOS DE PRUEBA:');
  console.log('curl http://localhost:5000/api/products');
  console.log('curl http://localhost:5000/api/orders');
  console.log('curl http://localhost:5000/api/users');
  
  console.log('\n🔄 ROLLBACK (si necesario):');
  console.log('Copy-Item .migration-backup\\index.ts.backup server\\index.ts -Force');
}

async function main() {
  try {
    const fixApplied = fixRemainingIssues();
    const isValid = validateFix();

    console.log('📊 RESUMEN DE CORRECCIONES:');
    console.log('================================');
    console.log(`✅ Correcciones aplicadas: ${fixApplied}`);
    console.log(`✅ Validación: ${isValid ? 'Exitosa' : 'Con problemas'}`);

    if (isValid) {
      console.log('\n🎉 ¡TODOS LOS PROBLEMAS CORREGIDOS!');
      showNextSteps();
    } else {
      console.log('\n⚠️ Aún hay problemas que requieren corrección manual');
      console.log('💡 Revisa las líneas específicas mostradas arriba');
    }

  } catch (error) {
    console.error('\n💥 Error durante las correcciones:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);