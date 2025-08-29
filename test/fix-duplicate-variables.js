// fix-duplicate-variables.js
// Script para corregir variables tenantStorage duplicadas (VERSIÓN CORREGIDA)

import fs from 'fs';
import path from 'path';

const SERVER_PATH = path.join(process.cwd(), 'server');
const BACKUP_PATH = path.join(process.cwd(), '.migration-backup');

console.log('🔧 Corrigiendo variables tenantStorage duplicadas...\n');

function fixDuplicateVariables() {
  const indexPath = path.join(SERVER_PATH, 'index.ts');
  
  if (!fs.existsSync(indexPath)) {
    console.log('⚠️ index.ts no encontrado');
    return false;
  }

  console.log('📝 Analizando y corrigiendo duplicados...');
  
  // Backup
  const backupPath = path.join(BACKUP_PATH, `index.ts.duplicate-fix-${Date.now()}`);
  fs.copyFileSync(indexPath, backupPath);
  console.log('   ✅ Backup creado');

  let content = fs.readFileSync(indexPath, 'utf8');
  const lines = content.split('\n');
  const fixedLines = [];
  let fixedCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1];
    const lineAfterNext = lines[i + 2];
    
    // PATRÓN PRINCIPAL: Detectar el bloque completo que necesita ser reemplazado
    // Buscar: getTenantDb -> createTenantStorage -> getTenantStorageForUser
    if (line.includes('const tenantDb = await getTenantDb(user.storeId);') &&
        nextLine && nextLine.includes('const tenantStorage = createTenantStorage(tenantDb);') &&
        lineAfterNext && lineAfterNext.includes('const tenantStorage = await getTenantStorageForUser(user);')) {
      
      console.log(`   🔧 Líneas ${i + 1}-${i + 3}: Eliminando bloque duplicado completo`);
      // Saltar las dos primeras líneas (getTenantDb y createTenantStorage)
      // Mantener solo la tercera (getTenantStorageForUser)
      i++; // Saltamos getTenantDb
      fixedCount += 2;
      continue; // La siguiente iteración saltará createTenantStorage, mantendrá getTenantStorageForUser
    }
    
    // PATRÓN 2: Solo createTenantStorage seguido de getTenantStorageForUser
    if (line.includes('const tenantStorage = createTenantStorage(tenantDb);') &&
        nextLine && nextLine.includes('const tenantStorage = await getTenantStorageForUser(user);')) {
      
      console.log(`   🔧 Línea ${i + 1}: Eliminando createTenantStorage, manteniendo getTenantStorageForUser`);
      fixedCount++;
      continue; // Saltar createTenantStorage
    }
    
    // PATRÓN 3: getTenantDb huérfano (sin createTenantStorage después)
    if (line.includes('const tenantDb = await getTenantDb(user.storeId);') &&
        (!nextLine || !nextLine.includes('const tenantStorage = createTenantStorage(tenantDb);'))) {
      
      console.log(`   🔧 Línea ${i + 1}: Eliminando getTenantDb huérfano`);
      fixedCount++;
      continue;
    }
    
    // PATRÓN 4: createTenantStorage huérfano (sin getTenantDb antes)
    if (line.includes('const tenantStorage = createTenantStorage(tenantDb);')) {
      // Verificar si la línea anterior no es getTenantDb
      const prevLine = i > 0 ? lines[i - 1] : '';
      if (!prevLine.includes('const tenantDb = await getTenantDb(user.storeId);')) {
        console.log(`   🔧 Línea ${i + 1}: Eliminando createTenantStorage huérfano`);
        fixedCount++;
        continue;
      }
    }
    
    // PATRÓN 5: Líneas duplicadas consecutivas de getTenantStorageForUser
    if (line.includes('const tenantStorage = await getTenantStorageForUser(user);') &&
        nextLine && nextLine.trim() === line.trim()) {
      
      console.log(`   🔧 Línea ${i + 2}: Eliminando getTenantStorageForUser duplicado exacto`);
      i++; // Saltar la línea duplicada
      fixedCount++;
    }
    
    fixedLines.push(line);
  }

  // Reconstruir contenido
  const newContent = fixedLines.join('\n');
  
  if (newContent !== content) {
    fs.writeFileSync(indexPath, newContent, 'utf8');
    console.log(`   ✅ ${fixedCount} líneas duplicadas eliminadas\n`);
    return true;
  } else {
    console.log('   ℹ️ No se encontraron duplicados para eliminar\n');
    return false;
  }
}

function validateNoDuplicates() {
  const indexPath = path.join(SERVER_PATH, 'index.ts');
  const content = fs.readFileSync(indexPath, 'utf8');
  const lines = content.split('\n');
  
  console.log('🔍 Verificando que no hay variables duplicadas...');
  
  const issues = [];
  const tenantStorageLines = [];
  
  // Buscar todas las declaraciones de tenantStorage y agruparlas
  let currentScope = 'global';
  let braceLevel = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Contar llaves para detectar scope
    braceLevel += (line.match(/{/g) || []).length;
    braceLevel -= (line.match(/}/g) || []).length;
    
    // Detectar inicio de función/endpoint
    if (line.includes('apiRouter.') || line.includes('app.')) {
      currentScope = `scope_${i}_${braceLevel}`;
    }
    
    // Si encontramos declaración de tenantStorage
    if (line.includes('const tenantStorage =')) {
      tenantStorageLines.push({
        line: i + 1,
        content: line.trim(),
        scope: currentScope,
        braceLevel: braceLevel
      });
    }
  }
  
  // Agrupar por scope similar y buscar duplicados
  const scopeMap = new Map();
  tenantStorageLines.forEach(item => {
    const key = `${item.scope}_${item.braceLevel}`;
    if (!scopeMap.has(key)) {
      scopeMap.set(key, []);
    }
    scopeMap.get(key).push(item);
  });
  
  // Verificar duplicados
  for (const [scope, declarations] of scopeMap) {
    if (declarations.length > 1) {
      issues.push(`Scope ${scope}: ${declarations.length} declaraciones`);
      declarations.forEach(decl => {
        console.log(`      📍 Línea ${decl.line}: ${decl.content}`);
      });
    }
  }
  
  if (issues.length > 0) {
    console.log('   ❌ Variables duplicadas encontradas:');
    issues.forEach(issue => console.log(`      - ${issue}`));
    return false;
  } else {
    console.log('   ✅ No se encontraron variables duplicadas en el mismo scope');
    return true;
  }
}

function showManualFix() {
  console.log('\n🔧 CORRECCIÓN MANUAL:');
  console.log('Si aún hay errores, busca en VSCode:');
  console.log('1. Abrir server/index.ts');
  console.log('2. Buscar (Ctrl+F): "const tenantStorage = createTenantStorage"');
  console.log('3. Eliminar esas líneas manualmente');
  console.log('4. Mantener solo: "const tenantStorage = await getTenantStorageForUser(user);"');
}

async function main() {
  try {
    const fixApplied = fixDuplicateVariables();
    const isValid = validateNoDuplicates();

    console.log('📊 RESUMEN DE CORRECCIÓN:');
    console.log('========================');
    console.log(`✅ Correcciones aplicadas: ${fixApplied}`);
    console.log(`✅ Validación: ${isValid ? 'Sin duplicados' : 'Aún hay duplicados'}`);

    if (isValid) {
      console.log('\n🎉 ¡VARIABLES DUPLICADAS CORREGIDAS!');
      console.log('\n📋 PRÓXIMO PASO:');
      console.log('npm run build');
    } else {
      console.log('\n⚠️ Aún hay duplicados - corrección manual necesaria');
      showManualFix();
    }

  } catch (error) {
    console.error('\n💥 Error:', error.message);
    showManualFix();
  }
}

main().catch(console.error);